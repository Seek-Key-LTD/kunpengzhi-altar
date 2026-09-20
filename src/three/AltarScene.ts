import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  SpiralEvent,
  CameraMode,
  AltarRole,
  AltarCapabilities,
  GUEST_ROUTINES,
  GUEST_ROUTINE_SECONDS,
  ROLE_CAPABILITIES,
  CAMERA_SAFETY_BY_ROLE,
  CAMERA_DISTANCE_BY_ROLE,
  SEAT_ID_MAX,
  isSeatId,
  WUJI_REVEAL_SEC,
  WUJI_SILENCE_SEC,
  WujiRevealState,
  wujiRevealStateAt,
  RITUAL_TOTAL_SEC,
  RITUAL_NAMING_END_SEC,
  RitualPhase,
  ritualPhaseAt,
  ritualLitSeatsAt,
  isTimelineDrivenPhase
} from '../types/altar';
import {
  DRAGON_SEAT_COUNT,
  TEA_LANTERN_REV_SEC,
  soundDragonNode,
  seatTrailTightnessB,
  teaLanternRotationEnabled,
  fogCaptionAt
} from '../data/dualDragon';
import { TEA_POEM_16_CHAPTERS } from '../data/tea_poem_16';
import { SEASON1_POEMS } from '../data/season1_poems';
import {
  BRICK,
  CELL,
  PYRAMID_HALF,
  PYRAMID_TOP,
  PLINTH_HALF,
  PLINTH_THICKNESS,
  SCORPION_BORE_RADIUS,
  SCORPION_CASING_RADIUS,
  scorpionWaterElevation,
  RIVER_AXIS_SEATS,
  RIVER_GRAVITY_SEATS,
  RABBIT_HOLE_SEATS
} from '../data/altarGeometry';
import { ImperialSealObject } from './relic/ImperialSealObject';
import { SealStampDecal } from './relic/SealStampDecal';
import { SealCameraRig } from './relic/SealCameraRig';
import type { ImperialSealState, SealEra, SealMode } from '../types/relic';
import { SEAL_HOVER_Y, SEAL_STAMP } from '../data/sealSpec';
import { altarAudio } from '../audio/altarAudio';
import { phaseProgress } from '../audio/phaseEnvelope';
import { RitualNarration, type NarrationChapter } from '../audio/ritualNarration';
import { AltarWaterLiftEngine } from './AltarWaterLiftEngine';
import { AltarMaglevLanternEngine } from './AltarMaglevLanternEngine';
import type { WebglTier } from './webglCapability';

// ── RFC-007 双体水梯 → 场景的映射常数 ──────────────────────────────
// 引擎世界：H=7.0、桶行程 z∈[-3.5,3.5]。这里把 7 单位行程映射成 6 个世界单位
// （= 2 个 CELL），整机占位远小于 3 CELL，立在北坡台基上，不遮 49 席与坛心玉玺。
const WATER_LIFT_Z = -(PYRAMID_HALF + 1.7); // 北坡：坛体北面之外、台基之上
const WATER_LIFT_BASE_Y = 2.4;              // 引擎 y=0 对应的世界高度（桶心）
const WATER_LIFT_SCALE = 6.0 / 7.0;         // 7 单位 → 6 世界单位
const WATER_LIFT_PULLEY_Y = 9.6;            // 顶端定滑轮高度
const WATER_LIFT_SEP = 1.6;                 // 双桶左右分列（±x）

// ── #4 · 导演 / 工程入口 · 受控回放速率 ──────────────────────────────
//
// 公共入口恒 1.0（1800s 全程，**无倍速控件**）。仅导演 / 工程入口可经
// `setPlaybackRate()` 加速/减速回放，用于讲解与工程复核。
// 路由隔离归 #5；本轮只提供 API 并保证公共渲染树里查不到任何倍速入口。
export const RITUAL_PLAYBACK_MIN = 0.25;
export const RITUAL_PLAYBACK_MAX = 64;
export const RITUAL_PLAYBACK_DEFAULT = 1;

// ── 公共入口 · 自运维演示循环（点名→定格→逆熄→留白→重生）────────────
// 直入版不是静态模型：装置持续“说话”。访客无需等 30 分钟正典，
// 也能看到水往下走、音往上升、逐席点名、倒序熄灭的完整仪式。
export const DEMO_KINDLE_SEC = 1.15; // 点名：每席间隔（秒）
export const DEMO_HOLD_SEC = 3.2; // 第 49 席定格（秒）
export const DEMO_EXTINGUISH_SEC = 0.42; // 逆熄：每席熄灭间隔（秒）
export const DEMO_REST_SEC = 4.0; // 全熄留白（秒）

/**
 * #7 · 构造选项。
 *
 * `tier` 由 `App` 在**构造之前**探测好再传进来（设计说明书 §1.4：探测与构造解耦）。
 * 缺省 `{ tier: 'full' }` ⇒ 与既有行为逐字一致（导演台 / 取证入口不受影响）。
 */
export interface AltarSceneOptions {
  /** 能力三态。`none` ⇒ 无画模式：不建渲染器、不建几何，时间轴 / 字幕 / 音频照常。 */
  tier?: WebglTier;
}

export class AltarScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  /** #7：无画模式下为 null —— 没有 WebGL 就没有渲染器，也就不该有 canvas。 */
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;

  // ── #7 · 能力三态 / 无画模式 ───────────────────────────────────────
  /** 当前档位。运行中上下文丢失会被改写为 `none` / `context-lost`。 */
  private tier: WebglTier = { tier: 'full' };
  /** 丢失前的档位，用于 `webglcontextrestored` 后原样恢复（不猜、不升级）。 */
  private tierBeforeLoss: WebglTier | null = null;
  /** `tier='none'` ⇒ 无画：不出画，但**时钟不停**（#4 单一包络不变量）。 */
  private drawless = false;
  /** 运行中上下文已丢失且尚未恢复 ⇒ 停掉 draw call，避免刷屏报错。 */
  private contextLost = false;
  /** 降级 / 恢复回调（App 据此换静默层）。 */
  private onDegrade?: (tier: WebglTier) => void;
  /** `destroy()` 幂等闸：React.StrictMode 会双挂，二次销毁不得炸。 */
  private destroyed = false;
  
  // Scene Groups
  private outerShellGroup: THREE.Group;
  private hollowInteriorGroup: THREE.Group;
  private lanternsGroup: THREE.Group;
  private primeLinesGroup: THREE.Group;
  private fountainGroup: THREE.Group;
  private waterworksGroup: THREE.Group;

  // 水利机关：RFC-007 双体水梯（中空神索 · 双体变质量阿特伍德振子）
  private waterLift = new AltarWaterLiftEngine({ height: 7.0, bucketMass: 5.0, initialWater: 10.0 });
  private waterLiftGroup: THREE.Group | null = null;
  private waterLiftBucketA: THREE.Group | null = null;
  private waterLiftBucketB: THREE.Group | null = null;
  private waterLiftWaterA: THREE.Mesh | null = null;
  private waterLiftWaterB: THREE.Mesh | null = null;
  private waterLiftRopeA: THREE.Mesh | null = null;
  private waterLiftRopeB: THREE.Mesh | null = null;
  /** 首个物理接管帧只播报一次，避免每帧刷屏 */
  private waterLiftAnnounced = false;

  /**
   * #5 · 7×7 正交取证相机（俯视，沿 -Y 看，丢弃 y）。
   * 非 null 时 animate 用它渲一帧，供无头取证出「俯视正交截图」；
   * 公共/导演运行时不设，故对生产零影响。
   */
  private orthoTopdownCamera: THREE.OrthographicCamera | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private apexLight: THREE.PointLight | null = null;
  private wujiLight: THREE.SpotLight | null = null;
  private ritualMode = false;
  private ritualLitSeats = 0;
  /** 仪式时间（秒）。null = 未注入 —— 直入版公共页不驱动三十分钟时间轴。 */
  private ritualTimeSec: number | null = null;
  /** #00 显形档位：hidden(<24:00) / revealed(≥24:00) / silent(≥29:11)。用于幂等与一次性播报。 */
  private wujiRevealState: WujiRevealState = 'hidden';

  // ── 公共入口 · 1800s 五幕时间轴 ────────────────────────────────────
  /** 仪式已运行秒数（仅在 ritualRunning 时随 dt 推进）。 */
  private ritualElapsed = 0;
  /**
   * 时间轴回放速率（#4）。公共入口恒 1.0（1800s 全程）；仅导演/工程入口
   * 经 setPlaybackRate() 变更，用于加速回放。默认值即公共入口行为。
   */
  private ritualPlaybackRate = RITUAL_PLAYBACK_DEFAULT;
  /** 时间轴是否在推进：startRitual() 置真，presentImmediately() 保持假。 */
  private ritualRunning = false;
  /** 上一次结算到的幕次，用于只在边界改写场景（避免每帧重写）。 */
  private ritualPhase: RitualPhase = 'abyss';
  /** naming 幕上一帧的 litSeats；-1 表示需要强制刷新。 */
  private namingLitSeats = -1;

  // ── 公共入口 · 自运维演示循环状态 ──────────────────────────────────
  private demoActive = false;
  private demoLitSeats = 0;
  private demoNextSeat = 1;
  private demoPhase: 'kindle' | 'hold' | 'extinguish' | 'rest' = 'kindle';
  private demoTimer = 0;
  private waterFrontBead: THREE.Group | null = null;
  private soundFrontBead: THREE.Group | null = null;
  /** Web Audio 手势兜底是否已武装（避免重复绑定）。 */
  private audioKicked = false;
  private audioResumeHandler: (() => void) | null = null;
  /** 章节朗诵与门帘轨道镜头共用的唯一章节游标。 */
  private narration: RitualNarration;
  private lanternChoreographyActive = false;
  private activeLanternChapter = 0;
  
  // Interactive Objects & Meshes
  private waterSpiralPath: THREE.Vector3[] = [];
  private waterParticles: THREE.Points | null = null;
  private waterLine: THREE.Line | null = null;
  /** 阴龙：不占席、不承载文字，只把 49 个半音向上卷成可见的气流。 */
  private soundSpiralPath: THREE.Vector3[] = [];
  private soundLine: THREE.Line | null = null;
  private soundParticles: THREE.Points | null = null;
  // ── #2 · 双龙逐席可视化 ──────────────────────────────────────────
  /** 每个已触发席位保留一条随音高收紧的对数螺线光迹（索引 = seatId-1）。 */
  private seatTrailsGroup: THREE.Group | null = null;
  private seatTrails: THREE.Line[] = [];
  /** 茶灯旋转门控：ritualMode 下仅 ≥1020s(17:00) 后开放；非仪式档恒开放。 */
  private lanternGateOpen = false;
  /** 门控开放瞬间的引擎转角：作为显示零点，避免开门时转角跳变。 */
  private lanternRotationTheta0 = 0;
  /** 雾中一句：单一 DOM 行，任何时刻至多一句。 */
  private fogCaptionEl: HTMLDivElement | null = null;
  private fogCaptionText = '';
  private fountainParticles: THREE.Points | null = null;
  /** #00 是吸光体，永远不是第 50 席。 */
  private wujiAbsorber: THREE.Mesh | null = null;
  private seatPads: Map<number, THREE.Mesh> = new Map();
  private seatLotusMeshes: Map<number, THREE.Group> = new Map();
  private starshipMeshes: Map<number, THREE.Group> = new Map();
  private lanternPanels: Map<number, THREE.Mesh> = new Map();
  private interiorStelae: Map<string, THREE.Mesh> = new Map();

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // 玉玺子系统（器物：不占格、不发音、不入座次表）
  private relic: ImperialSealObject | null = null;
  private relicDecal: SealStampDecal | null = null;
  private relicRig: SealCameraRig | null = null;
  private onRelicSelect?: (relicId: string) => void;


  // State
  private events: SpiralEvent[] = [];
  private activeSeatId: number | null = 1;
  private cameraMode: CameraMode = 'orbit';
  /** 身份：默认游客。未认证即游客，不是"默认给自由" */
  private role: AltarRole = 'guest';
  /** 当前身份的能力表 —— 权限判定一律查它，不直接判等角色 */
  private capabilities: AltarCapabilities = ROLE_CAPABILITIES.guest;
  /** 当前身份的相机安全边界（游客档与原硬编码同值） */
  private cameraSafety = CAMERA_SAFETY_BY_ROLE.guest;
  /** 游客 routine：只有点击/触摸才会启动，绝不后台自动巡游。 */
  private guestRoutineIndex = 0;
  private guestRoutineTimer = 0;
  private guestRoutinePlaying = false;
  /** Rabbit Hole 不是一个切镜头标签；它是一段由入口 40 穿到出口 28 的实走镜头。 */
  private rabbitHoleTourActive = false;
  /** 认证者的 WASD/QE 飞行状态；访客永远不会写入它。 */
  private pressedKeys = new Set<string>();
  /** 上一帧的合法相机位（安全边界第 4 条：异常时拉回） */
  private lastSafeCameraPos = new THREE.Vector3(48, 40, 58);
  private onSeatSelect?: (seatId: number) => void;
  private onLanternSelect?: (chapterIndex: number) => void;
  private onInteriorPoemSelect?: (seasonId: string) => void;
  private clock = new THREE.Clock();
  private lastElapsed = 0;

  // Speed & Rotation
  // RFC-008 外环超导磁悬浮走马灯（回转/悬浮/声学击发由引擎驱动）。
  // 半径与 buildOuter16TeaLanterns 的 lanternRadius=23.5 保持一致，避免两套半径打架。
  private maglev = new AltarMaglevLanternEngine({ radius: 23.5 });
  /** 北坡双桶撞簧 → 走马灯的地脉震颤 [0,1]：由 waterLift.onPhaseTransition 注入、逐帧衰减 */
  private waterLiftSeismic = 0;
  private maglevAnnounced = false;
  /** QA 节奏日志上限：相变/击发各打前 8 条以证明「周期发生」，之后静默避免刷屏 */
  private waterLiftPhaseLogCount = 0;
  private maglevStrumLogCount = 0;
  private currentProgress = 1;
  private isAutoPatrol = false;

  // Smooth Camera Target
  private targetCameraPos = new THREE.Vector3(48, 40, 58);
  private targetControlsTarget = new THREE.Vector3(0, 6, 0);
  private isCameraTransitioning = false;

  constructor(
    container: HTMLElement,
    events: SpiralEvent[],
    onSeatSelect?: (seatId: number) => void,
    onLanternSelect?: (chapterIndex: number) => void,
    onInteriorPoemSelect?: (seasonId: string) => void,
    options: AltarSceneOptions = {}
  ) {
    this.container = container;
    this.events = events;
    this.onSeatSelect = onSeatSelect;
    this.onLanternSelect = onLanternSelect;
    this.onInteriorPoemSelect = onInteriorPoemSelect;
    this.narration = new RitualNarration({
      events: {
        onChapterStart: (chapter) => this.onNarrationChapterStart(chapter),
        onChapterEnd: (chapter) => this.onNarrationChapterEnd(chapter),
        onComplete: () => { this.lanternChoreographyActive = false; }
      }
    });

    // #7 · 档位先落，再决定「建不建渲染器 / 建不建几何」。
    this.tier = options.tier ?? { tier: 'full' };
    this.drawless = this.tier.tier === 'none';

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.012);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(48, 40, 58);

    // 3. Renderer setup
    //    #7：无画模式（tier='none'）**不建渲染器** —— 没有 WebGL 时这一步必抛
    //    「Error creating WebGL context」，而那正是本单要兜掉的白屏。不建渲染器
    //    也就不会往 DOM 里塞 canvas。时间轴 / 字幕 / 音频不受影响（见第 8 步）。
    if (!this.drawless) {
      this.renderer = new THREE.WebGLRenderer({
        // 降档档位关抗锯齿：软栅格 / 仅 WebGL1 的机器上这是最贵的一项。
        antialias: this.tier.tier === 'full',
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.25;
      // #7 降档（§1.2）：能画，但软栅格 / 仅 WebGL1 扛不住满配 ——
      // 只降 pixelRatio 与阴影（两项最贵），几何、材质、雾、配色一律不动。
      if (this.tier.tier === 'degraded') {
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
      }
      container.appendChild(this.renderer.domElement);
      // #7 §1.1 B/C：运行中上下文丢失 / 恢复。preventDefault 由本类与 three 内部
      // 各调一次（幂等），缺了它浏览器就不会尝试恢复上下文。
      this.renderer.domElement.addEventListener('webglcontextlost', this.onWebglContextLost);
      this.renderer.domElement.addEventListener('webglcontextrestored', this.onWebglContextRestored);
    }

    // 4. Controls
    //    无画模式下没有 renderer.domElement，给 OrbitControls 一张**游离** canvas：
    //    它只用来挂监听，永不入 DOM ⇒ 公共页查不到 canvas，也不占渲染资源。
    // ⚠️ minDistance 曾降到 0.5 以便"贴着看"，但那正是穿模的直接来源。
    //    安全边界见 docs/身份与相机权限规范.md §3.2。
    this.controls = new OrbitControls(
      this.camera,
      this.renderer ? this.renderer.domElement : document.createElement('canvas')
    );
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 220;
    this.controls.target.set(0, 6, 0);
    // 默认角色是游客 —— 未认证即游客，不是"默认给自由"
    this.applyRole();

    // 5. Structure Groups
    this.outerShellGroup = new THREE.Group();
    this.hollowInteriorGroup = new THREE.Group();
    this.lanternsGroup = new THREE.Group();
    this.primeLinesGroup = new THREE.Group();
    this.fountainGroup = new THREE.Group();
    this.waterworksGroup = new THREE.Group();

    this.scene.add(this.outerShellGroup);
    this.scene.add(this.hollowInteriorGroup);
    this.scene.add(this.lanternsGroup);
    this.scene.add(this.primeLinesGroup);
    this.scene.add(this.fountainGroup);
    this.scene.add(this.waterworksGroup);

    // 6. Build All Complex Layers
    //    #7：无画模式跳过**全部**几何 / 贴图 / 光源构建 —— 画不出来，就不该在
    //    一台连 WebGL 都没有的机器上白烧一次 CPU。这些网格只服务于出画，
    //    时间轴 / 字幕 / 音频一个都不读它们（#4：渲染层降级只是不画，不改时钟）。
    if (!this.drawless) {
      this.initLighting();
      this.buildPlinthAndRiver();
      this.buildCubePyramidAndSeats();
      // 诗词展示层后置：先验收阳 Cube、阴腔与蝎子楔水路，避免牌子遮蔽结构。
      // this.buildInnerStelaeRing();
      // RFC-008：外环 16 面走马大茶灯回廊（引擎驱动，见 animate 第 9b 段）
      this.buildOuter16TeaLanterns();
      this.buildWujiFountain();
      // #2：双龙的逐席对数螺线光迹（每个已触发席位一条，随音高收紧）。
      this.buildSeatTrails();
      this.buildStarships();
      this.buildSurroundingAtmosphere();

      // 6b. 传国玉玺：悬浮玺台（器物，与 49 席完全隔离）
      this.mountRelic();
    }

    // RFC-008 声学接线：走马灯声学击发统一走既有 triggerFountainPulse()，不新造音频 API。
    // ⚠️ 这一段**在无画模式下也保留**：它是音频链路，不是画面链路 —— 降级下音频照旧。
    this.maglev.onAcousticStrum = (chord, bay, chapter) => {
      altarAudio.triggerFountainPulse();
      if (this.maglevStrumLogCount < 8) {
        this.maglevStrumLogCount++;
        console.log(`[走马灯] 声学击发 chord=${chord} bay=${bay} chapter=${chapter}`);
      }
    };

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    this.container.addEventListener('pointerdown', this.onPointerDown);

    // #2 · 雾中一句：单一字幕行，任何时刻至多一句（窗口两两不重叠）。
    const caption = document.createElement('div');
    caption.className = 'ritual-caption';
    caption.setAttribute('aria-live', 'polite');
    caption.style.display = 'none';
    this.container.appendChild(caption);
    this.fogCaptionEl = caption;

    // 8. Start loop
    this.animate();

    // 数表与物理读数只属于工程验收，不属于公共仪式；默认不挂 HUD。
  }

  private initLighting() {
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.4);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight;

    const sunLight = new THREE.DirectionalLight(0xffecd2, 2.6);
    sunLight.position.set(35, 55, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    this.scene.add(sunLight);
    this.sunLight = sunLight;

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
    rimLight.position.set(-35, 12, -35);
    this.scene.add(rimLight);
    this.rimLight = rimLight;

    const apexLight = new THREE.PointLight(0xfbbf24, 3.2, 70, 1.2);
    apexLight.position.set(0, PYRAMID_TOP + 4, 0);
    this.scene.add(apexLight);
    this.apexLight = apexLight;

    // #00 无极具象：飞碟悬于坛顶上方中央，向下一束冷光罩住玉玺（SEAL_HOVER_Y）。
    // 抛物面 z=22.42−0.01·r² 焦距 f=1/(4·0.01)=25，数学焦点在顶点下方 z=−2.58（坛底）；
    // 此处取仪式化布置：飞碟即天听，光柱垂直下落，落点压在玉玺印面之上。
    const FLYSAUCER_Y = SEAL_HOVER_Y + 4.3;
    const wujiLight = new THREE.SpotLight(0xbfe8ff, 0, 30, 0.10, 0.55, 1.4);
    wujiLight.position.set(0, FLYSAUCER_Y, 0);
    wujiLight.target.position.set(0, SEAL_HOVER_Y, 0);
    this.scene.add(wujiLight, wujiLight.target);
    this.wujiLight = wujiLight;
    // 飞碟本体（扁圆盘 + 底部发光核心）
    const saucer = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 0.32, 48, 1, false),
      new THREE.MeshStandardMaterial({ color: 0xdfeff5, emissive: 0xbfe8ff, emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.1 })
    );
    saucer.position.set(0, FLYSAUCER_Y, 0);
    this.scene.add(saucer);
    const saucerCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xeaf9ff })
    );
    saucerCore.position.set(0, FLYSAUCER_Y - 0.25, 0);
    this.scene.add(saucerCore);
    // 可见光柱：从飞碟垂直下落到玉玺（半透明锥柱，上窄下宽罩住玉玺）
    const beamLen = FLYSAUCER_Y - SEAL_HOVER_Y;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.9, beamLen, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.set(0, (FLYSAUCER_Y + SEAL_HOVER_Y) / 2, 0);
    this.scene.add(beam);

    // 阴锥内腔照明（空腔是封闭的，光必须留在里面）
    const yinLightA = new THREE.PointLight(0x38bdf8, 3.0, 26, 1.2);
    yinLightA.position.set(0, 2.4, 0);
    this.hollowInteriorGroup.add(yinLightA);

    const yinLightB = new THREE.PointLight(0xf59e0b, 2.2, 22, 1.2);
    yinLightB.position.set(0, 8.0, 0);
    this.hollowInteriorGroup.add(yinLightB);
  }

  /**
   * 台基。水路收进 Cube 阴腔后，台基不再留一条露天河道。
   */
  private buildPlinthAndRiver() {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      roughness: 0.75,
      metalness: 0.25
    });
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.85,
      roughness: 0.3,
      emissive: 0x78350f,
      emissiveIntensity: 0.35
    });

    const plinthDepth = PLINTH_HALF * 2;
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(PLINTH_HALF * 2, PLINTH_THICKNESS, plinthDepth),
      stoneMat
    );
    plinth.position.y = -PLINTH_THICKNESS / 2;
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    this.outerShellGroup.add(plinth);

    // 坛基线：金字塔脚下的铜线
    const footLine = new THREE.Mesh(
      new THREE.BoxGeometry(PYRAMID_HALF * 2 + 0.8, 0.16, PYRAMID_HALF * 2 + 0.8),
      bronzeMat
    );
    footLine.position.y = 0.04;
    this.outerShellGroup.add(footLine);
  }

  /**
   * 席位世界坐标。
   * 每席就是一块立方砖，砖心正好落在平面格点上，所以席位坐标 = 格点坐标。
   */
  private getSeatWorldPos(event: SpiralEvent): THREE.Vector3 {
    const x = event.grid_x * CELL;
    const z = event.grid_z * CELL;
    const y = event.elevation + 0.12;
    return new THREE.Vector3(x, y, z);
  }

  /**
   * 阳：七层中空方锥 —— 每层只砌最外面那一圈砖（暴露带）。
   *
   * 第 n 层（1 = 顶 … 7 = 底）边长 n 格 = 2n 砖，相邻两层每边差 1/2 格；
   * 每层高 1 砖、每边内收 1 砖 ⟹ 坡度恒为 1:1 = 精确 45°。
   * 外圈砖数 = 8n − 4，正好是席位数 2n − 1 的 4 倍（每席占 4 块砖 = 1 格²）。
   *
   * 标称实心 7 层 = 1²+…+7² = 140 格，其中暴露带 49 格（= 49 席）、
   * 内部 91 格（= 1²+…+6²）。**内部 91 格全部不砌** ⟹ 里面是一座递收的空腔（阴），
   * 镜头可入。第 7 层南面正中留一道 2 砖宽的水口，与南北向的河对齐。
   *
   * 每层暴露带中心线上开一圈水槽，槽底统一外倾 0.5°（稳定梯度），
   * 水只可能向外流到下一层，不会积在台上。
   */
  private buildCubePyramidAndSeats() {
    const brickMat = new THREE.MeshStandardMaterial({
      color: 0x263247,
      roughness: 0.54,
      metalness: 0.16
    });

    // ---- 1. 49 根砖柱：每席一根，从地面砌到该席的台面高程 ----
    const bricks: Array<{ x: number; y: number; z: number }> = [];

    const rabbitHoleSeats = new Set<number>(RABBIT_HOLE_SEATS);
    // #00 无极点（锚点 0）不在席位域：任何 seat_id 非 [1,49] 的条目都不许砌成砖柱或席位。
    // 这一步让「#00 混进第 50 席」在结构上不可能发生，而不是靠约定。
    const seatEvents = this.events.filter((ev) => isSeatId(ev.seat_id));
    seatEvents.forEach((ev) => {
      const levels = Math.max(1, Math.round(ev.elevation / BRICK));
      for (let i = 0; i < levels; i++) {
        // 横轴 40→19→6→1→2→11→28：只抽第二层的同尺寸 Cube。
        // 顶面仍然由上层 Cube 封住；入口/出口则在两端自然开口。
        if (rabbitHoleSeats.has(ev.seat_id) && i === 1) continue;
        bricks.push({
          x: ev.grid_x * CELL,
          y: (i + 0.5) * BRICK,
          z: ev.grid_z * CELL
        });
      }
    });

    const brickGeo = new THREE.BoxGeometry(BRICK, BRICK, BRICK);
    const blocks = new THREE.InstancedMesh(brickGeo, brickMat, bricks.length);
    blocks.castShadow = true;
    blocks.receiveShadow = true;

    const mat4 = new THREE.Matrix4();
    bricks.forEach((b, i) => {
      mat4.makeTranslation(b.x, b.y, b.z);
      blocks.setMatrixAt(i, mat4);
    });
    blocks.instanceMatrix.needsUpdate = true;
    this.outerShellGroup.add(blocks);

    // ---- 2. 阴蝎子楔：水路不许出现在阳 Cube 的外露面 ----
    this.buildScorpionWaterway();
    // RFC-007：北坡双桶天车（中空神索·阿特伍德振子）—— 引擎接管前先把可视装置立好
    this.buildWaterLift();

    this.buildRiverAxis();
    this.buildRabbitHole();

    // ---- 3. 49 席：托座 / 质数环 / 莲花 ----
    seatEvents.forEach((ev) => {
      const seatPos = this.getSeatWorldPos(ev);
      const seatGroup = new THREE.Group();
      seatGroup.position.copy(seatPos);
      
      // 质数席：脚下刻一圈青金环
      if (ev.is_prime) {
        const primeRing = new THREE.Mesh(
          new THREE.RingGeometry(0.85, 1.05, 16),
          new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
          })
        );
        primeRing.rotation.x = -Math.PI / 2;
        primeRing.position.y = 0.06;
        seatGroup.add(primeRing);
      }

      // 青铜莲花托座
      const padMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.85, 0.14, 8),
        new THREE.MeshStandardMaterial({
          color: ev.seat_status === 'reserved' ? 0xd97706 : (ev.is_prime ? 0x0284c7 : 0x1e293b),
          metalness: 0.75,
          roughness: 0.25,
          emissive: ev.seat_status === 'reserved' ? 0x78350f : (ev.is_prime ? 0x0369a1 : 0x0f172a),
          emissiveIntensity: 0.4
        })
      );
      padMesh.position.y = 0.18;
      padMesh.receiveShadow = true;
      padMesh.userData = { type: 'seat_pad', seatId: ev.seat_id };
      seatGroup.add(padMesh);
      this.seatPads.set(ev.seat_id, padMesh);

      // 莲花
      const flowerGroup = new THREE.Group();
      const petalCount = 8;
      const flowerMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ev.flower_color),
        emissive: new THREE.Color(ev.flower_color),
        emissiveIntensity: ev.is_prime ? 0.9 : 0.6,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      });

      for (let p = 0; p < petalCount; p++) {
        const angle = (p / petalCount) * Math.PI * 2;
        const petalGeo = new THREE.ConeGeometry(0.28, 0.75, 5);
        petalGeo.rotateX(Math.PI / 3);
        const petal = new THREE.Mesh(petalGeo, flowerMat);
        petal.position.set(Math.sin(angle) * 0.32, 0.22, Math.cos(angle) * 0.32);
        petal.rotation.y = angle;
        flowerGroup.add(petal);
      }

      const coreMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      coreMesh.position.y = 0.25;
      flowerGroup.add(coreMesh);

      flowerGroup.position.y = 0.22;
      flowerGroup.scale.set(0.65, 0.65, 0.65);
      seatGroup.add(flowerGroup);
      this.seatLotusMeshes.set(ev.seat_id, flowerGroup);

      this.outerShellGroup.add(seatGroup);
    });

    // Build Ulam Prime Diagonal Alignment Lines
    const primes = seatEvents.filter(e => e.is_prime);
    const diagLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.55
    });

    for (let i = 0; i < primes.length; i++) {
      for (let j = i + 1; j < primes.length; j++) {
        const p1 = primes[i];
        const p2 = primes[j];
        const dx = Math.abs(p1.grid_x - p2.grid_x);
        const dz = Math.abs(p1.grid_z - p2.grid_z);
        if (dx === dz && dx <= 3) {
          const v1 = this.getSeatWorldPos(p1);
          const v2 = this.getSeatWorldPos(p2);
          const geo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
          const line = new THREE.Line(geo, diagLineMat);
          this.primeLinesGroup.add(line);
        }
      }
    }
  }

  /**
   * 49 枚蝎子楔把水封进 Cube 的阴腔。
   *
   * 每一条边都是一段从当前 Cube 腹腔通往相邻 Cube 腹腔的光滑壳管：
   * 其中心高程严格按席号下降，俯视方向严格按 Ulam 方形螺旋转弯。
   * 阳 Cube 没有槽、没有坡、没有水滴碰撞面；所以水无从跑到坛外。
   */
  private buildScorpionWaterway() {
    const points = this.events.map((event) => new THREE.Vector3(
      event.grid_x * CELL,
      scorpionWaterElevation(event.seat_id),
      event.grid_z * CELL
    ));
    this.waterSpiralPath = points;

    const casingMat = new THREE.MeshStandardMaterial({
      color: 0x5c3216,
      emissive: 0x251006,
      emissiveIntensity: 0.34,
      roughness: 0.29,
      metalness: 0.84
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0369a1,
      emissiveIntensity: 1.1,
      roughness: 0.04,
      metalness: 0.62,
      transparent: true,
      opacity: 0.88
    });

    for (let index = 0; index < points.length - 1; index++) {
      const from = points[index];
      const to = points[index + 1];
      const event = this.events[index];
      const next = this.events[index + 1];
      const planarDistance = Math.abs(event.grid_x - next.grid_x) + Math.abs(event.grid_z - next.grid_z);
      if (planarDistance !== 1 || !(from.y > to.y)) {
        throw new Error(`蝎子楔拓扑错误：${event.seat_id}→${next.seat_id} 必须相邻且降势`);
      }

      const centerline = new THREE.LineCurve3(from, to);
      const casing = new THREE.Mesh(
        new THREE.TubeGeometry(centerline, 12, SCORPION_CASING_RADIUS, 12, false),
        casingMat
      );
      casing.userData = {
        type: 'scorpion_wedge',
        fromSeat: event.seat_id,
        toSeat: next.seat_id,
        sealed: true,
        exposedOnYangCube: false
      };
      this.waterworksGroup.add(casing);

      const waterCore = new THREE.Mesh(
        new THREE.TubeGeometry(centerline, 12, SCORPION_BORE_RADIUS, 10, false),
        waterMat
      );
      waterCore.userData = {
        type: 'scorpion_water_core',
        fromSeat: event.seat_id,
        toSeat: next.seat_id,
        sealed: true,
        exposedOnYangCube: false
      };
      this.waterworksGroup.add(waterCore);

      // 每个转接心脏留一枚圆滑“蝎节”，把直段锁在 Cube 的腹腔里。
      const joint = new THREE.Mesh(
        new THREE.SphereGeometry(SCORPION_CASING_RADIUS * 1.08, 12, 10),
        casingMat
      );
      joint.position.copy(from);
      joint.userData = { type: 'scorpion_joint', seatId: event.seat_id, exposedOnYangCube: false };
      this.waterworksGroup.add(joint);
    }
  }

  /**
   * RFC-007 双体水梯 —— 北坡双桶天车。
   *
   * 一台「中空神索 · 双体变质量阿特伍德振子」的可视化：
   *   · 顶端定滑轮（Torus）—— 一索连两桶的支点；
   *   · 敞口双桶 A/B（左右分列）—— 谁重谁沉，此消彼长（yA + yB = H 守恒）；
   *   · 中空神索 —— 两条竖索自滑轮 rim 垂到桶沿，逐帧随行程伸缩；
   *   · 底部神簧 —— 桶底两枚细螺旋，承接死点反冲。
   *
   * 立于北坡台基（z = -(PYRAMID_HALF + 1.7)），加进阴腔组 hollowInteriorGroup；
   * 占位 ≤ 2 CELL，不遮 49 席、不碰坛心玉玺。引擎世界 H=7.0 → 6 世界单位。
   */
  private buildWaterLift(): void {
    const group = new THREE.Group();
    group.name = 'rfc007-water-lift';
    group.position.set(0, 0, WATER_LIFT_Z);

    // 沿用既有暗黑金石调色（与 buildScorpionWaterway 的 casing/water 同色系）
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0x5c3216,
      emissive: 0x251006,
      emissiveIntensity: 0.34,
      roughness: 0.29,
      metalness: 0.84
    });
    const ropeMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a0e,
      emissive: 0x150c05,
      emissiveIntensity: 0.3,
      roughness: 0.55,
      metalness: 0.7
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0369a1,
      emissiveIntensity: 1.1,
      roughness: 0.04,
      metalness: 0.62,
      transparent: true,
      opacity: 0.88
    });

    // 台座 + 两根立柱导轨
    const base = new THREE.Mesh(new THREE.BoxGeometry(WATER_LIFT_SEP * 2 + 1.4, 0.28, 1.2), bronzeMat);
    base.position.set(0, WATER_LIFT_BASE_Y - 1.15, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const railHeight = WATER_LIFT_PULLEY_Y - (WATER_LIFT_BASE_Y - 1.0);
    [-1, 1].forEach((sx) => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, railHeight, 8), bronzeMat);
      rail.position.set(sx * WATER_LIFT_SEP, WATER_LIFT_BASE_Y - 1.0 + railHeight / 2, 0);
      group.add(rail);
    });

    // 顶端定滑轮（一索连两桶的支点）
    const pulley = new THREE.Mesh(new THREE.TorusGeometry(WATER_LIFT_SEP, 0.16, 12, 40), bronzeMat);
    pulley.position.set(0, WATER_LIFT_PULLEY_Y, 0);
    group.add(pulley);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), bronzeMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, WATER_LIFT_PULLEY_Y, 0);
    group.add(hub);

    // 双桶（敞口圆柱）+ 桶内水柱
    const makeBucket = (side: -1 | 1): { bucket: THREE.Group; water: THREE.Mesh } => {
      const bucket = new THREE.Group();
      bucket.position.set(side * WATER_LIFT_SEP, WATER_LIFT_BASE_Y, 0);

      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.58, 1.0, 14, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0x5c3216,
          emissive: 0x251006,
          emissiveIntensity: 0.34,
          roughness: 0.29,
          metalness: 0.84,
          side: THREE.DoubleSide
        })
      );
      wall.castShadow = true;
      bucket.add(wall);

      const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 14), bronzeMat);
      bottom.position.y = -0.5;
      bucket.add(bottom);

      // 水面：几何原点挪到底面，scale.y 即水位
      const waterGeo = new THREE.CylinderGeometry(0.55, 0.5, 1.0, 14, 1, false);
      waterGeo.translate(0, 0.5, 0);
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.position.y = -0.46;
      water.scale.y = 0.5;
      bucket.add(water);

      group.add(bucket);
      return { bucket, water };
    };

    const a = makeBucket(-1);
    const b = makeBucket(1);
    this.waterLiftBucketA = a.bucket;
    this.waterLiftBucketB = b.bucket;
    this.waterLiftWaterA = a.water;
    this.waterLiftWaterB = b.water;

    // 中空神索：竖索，几何高度 1，逐帧 scale.y 伸缩
    const ropeGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
    const ropeA = new THREE.Mesh(ropeGeo, ropeMat);
    const ropeB = new THREE.Mesh(ropeGeo, ropeMat);
    group.add(ropeA, ropeB);
    this.waterLiftRopeA = ropeA;
    this.waterLiftRopeB = ropeB;

    // 底部神簧：桶底两枚细螺旋
    [-1, 1].forEach((sx) => {
      for (let k = 0; k < 4; k++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 18), bronzeMat);
        coil.position.set(sx * WATER_LIFT_SEP, WATER_LIFT_BASE_Y - 1.05 + k * 0.13, 0);
        coil.rotation.x = Math.PI / 2;
        group.add(coil);
      }
    });

    this.hollowInteriorGroup.add(group);
    this.waterLiftGroup = group;

    // 相变接线：既有 triggerFountainPulse()（水花/垫音）+ #4 新增的翻斗链条声。
    this.waterLift.onPhaseTransition = (highBucket, massSkimmed, tone) => {
      altarAudio.triggerFountainPulse();
      // #4 翻斗链条：RFC-007 死点/翻斗 → 一记链条声（顶死点黄钟 / 底死点林钟）。
      altarAudio.triggerBucketChain(tone);
      // RFC-007 → RFC-008 联动：双桶撞死点即给外环走马灯一次地脉冲击（0..1），
      // 由 animate 第 9b 段逐帧衰减后喂给 maglev.update(dt, seismic)。
      this.waterLiftSeismic = THREE.MathUtils.clamp(massSkimmed, 0, 1);
      if (this.waterLiftPhaseLogCount < 8) {
        this.waterLiftPhaseLogCount++;
        console.log(
          `[水梯] 死点相变 #${this.waterLiftPhaseLogCount} high=${highBucket} ` +
            `skim=${massSkimmed.toFixed(3)}kg tone=${tone} z=${this.waterLift.state.z.toFixed(3)}`
        );
      }
    };
  }

  /**
   * 每帧把 RFC-007 引擎状态映射到 3D：
   *   · 双桶标高由 yA / yB 驱动（yA + yB = H 守恒，此消彼长）；
   *   · 桶内水面高度由 mA / mB 驱动；
   *   · 中空神索随桶顶与滑轮之间的距离逐帧伸缩。
   */
  private syncWaterLiftVisual(): void {
    if (!this.waterLiftGroup) return;
    const { yA, yB, mA, mB } = this.waterLift.state;

    const centerA = WATER_LIFT_BASE_Y + yA * WATER_LIFT_SCALE;
    const centerB = WATER_LIFT_BASE_Y + yB * WATER_LIFT_SCALE;

    if (this.waterLiftBucketA) this.waterLiftBucketA.position.y = centerA;
    if (this.waterLiftBucketB) this.waterLiftBucketB.position.y = centerB;

    // 水柱高度 ∝ 质量（参考满量 ~15kg，夹到 [0.02, 1]）
    if (this.waterLiftWaterA) this.waterLiftWaterA.scale.y = THREE.MathUtils.clamp(mA / 15, 0.02, 1);
    if (this.waterLiftWaterB) this.waterLiftWaterB.scale.y = THREE.MathUtils.clamp(mB / 15, 0.02, 1);

    // 神索：竖索长度 = 滑轮高度 − 桶顶高度
    const ropeLenA = Math.max(0.05, WATER_LIFT_PULLEY_Y - (centerA + 0.5));
    const ropeLenB = Math.max(0.05, WATER_LIFT_PULLEY_Y - (centerB + 0.5));
    if (this.waterLiftRopeA) {
      this.waterLiftRopeA.scale.y = ropeLenA;
      this.waterLiftRopeA.position.set(-WATER_LIFT_SEP, WATER_LIFT_PULLEY_Y - ropeLenA / 2, 0);
    }
    if (this.waterLiftRopeB) {
      this.waterLiftRopeB.scale.y = ropeLenB;
      this.waterLiftRopeB.position.set(WATER_LIFT_SEP, WATER_LIFT_PULLEY_Y - ropeLenB / 2, 0);
    }

    // 首个物理接管帧播报一次，便于 QA 验证
    if (!this.waterLiftAnnounced) {
      this.waterLiftAnnounced = true;
      console.log(`[水梯] RFC-007 引擎接管 z=${this.waterLift.state.z.toFixed(3)}`);
    }
  }

  /**
   * 每帧把 RFC-008 引擎状态映射到 3D：
   *   · 回转：lanternsGroup.rotation.y = state.theta（由引擎 omega 驱动）；
   *   · 悬浮：lanternsGroup.position.y = state.z —— 这是 20mm 级磁浮气隙，
   *     毫米/微米量级的微振，**不做视觉大起大落**，只忠实反映气隙。
   */
  private syncMaglevVisual(): void {
    if (!this.lanternsGroup) return;
    // #2 茶灯门控：仅当门开（ritualMode 下 ≥1020s，或非仪式档）才让茶灯转动。
    // 引擎与地脉耦合（seismic）保持原样 —— 这里只门控**视觉转角**，不碰动力学。
    const raw = this.maglev.state.theta;
    this.lanternsGroup.rotation.y = this.lanternGateOpen ? raw - this.lanternRotationTheta0 : 0;
    this.lanternsGroup.position.y = this.maglev.state.z;

    if (!this.maglevAnnounced) {
      this.maglevAnnounced = true;
      console.log(`[走马灯] RFC-008 引擎接管 theta=${this.maglev.state.theta.toFixed(4)}`);
    }
  }

  /**
   * #2 要求 5：16 盏茶灯仅在 17:00（1020s = RITUAL_NAMING_END_SEC）之后低速转动
   * （沿用 RFC-008 引擎既有 maxOmega，120s/圈）。**只门控旋转** ——
   * RFC-008 的地脉耦合（`maglev.update(dt, waterLiftSeismic)`）一字未动。
   * 非仪式档（导演台 / 直入）不设门，保持既有行为。
   */
  private updateLanternGate(): void {
    const open = !this.ritualMode || teaLanternRotationEnabled(this.ritualElapsed);
    if (open === this.lanternGateOpen) return;
    this.lanternGateOpen = open;
    if (open) {
      // 从当前引擎转角起算显示零点，跨过 1020s 时不跳变。
      this.lanternRotationTheta0 = this.maglev.state.theta;
      // 只在**仪式运行态且确由 ≥1020s 触发**时播报：构造函数同步调 animate()，
      // 首帧早于 App.startRitual()，此时 ritualMode 仍为 false（!ritualMode 分支开门），
      // 若在此打印会给出「门控开放 @ 0s ≥ 1020s(17:00)」这类**误导审计**的日志。
      // 门控行为本身不变（开门/关门照旧），只收敛日志。
      if (this.ritualRunning && this.ritualMode) {
        console.log(
          `[走马灯] 门控开放 @ ${this.ritualElapsed.toFixed(0)}s ≥ ${RITUAL_NAMING_END_SEC}s(17:00)：` +
            `茶灯始转（maxOmega ⇒ ${TEA_LANTERN_REV_SEC}s/圈）`
        );
      }
    }
  }

  /**
   * #2：双龙**唯一**触发源 —— 已触发席数。
   * 仪式中即 `ritualLitSeatsAt(elapsed)` 的结算值（由 setRitualState 写入）；
   * 非仪式档（导演台 / 直入）恒 49 席。两龙共用此值 ⟹ 同源、不预演未来席。
   */
  private dualDragonLitSeats(): number {
    if (this.demoActive) return this.demoLitSeats;
    return this.ritualMode ? this.ritualLitSeats : SEAT_ID_MAX;
  }

  /**
   * #2 要求 6：雾中一句。以时间轴结算的 `ritualElapsed` 查唯一权威 `fogCaptionAt`
   * （窗口两两不重叠 ⟹ 至多一句），只在文本变化时改写 DOM，避免每帧重排。
   * 非仪式档不显示雾中字幕。
   */
  private syncFogCaption(): void {
    if (!this.fogCaptionEl) return;
    const line = this.ritualMode ? fogCaptionAt(this.ritualElapsed) : null;
    const text = line ?? '';
    if (text === this.fogCaptionText) return;
    this.fogCaptionText = text;
    this.fogCaptionEl.textContent = text;
    this.fogCaptionEl.style.display = text ? '' : 'none';
  }

  // ── #7 · 上下文丢失 / 恢复（§1.1 B / C）────────────────────────────

  /**
   * 运行中上下文丢失（显卡驱动重置、标签页被回收、上下文配额打满 …）。
   *
   * 三条纪律：
   *   1. **必须** `preventDefault()` —— 否则浏览器不尝试恢复，页面就此死掉；
   *   2. **绝不**在这里抛错 / 弹错：归入 `none` 档，由 App 换静默层；
   *   3. **只关 draw call，不动时钟** —— 1800s 时间轴、雾中字幕、音频继续跑
   *      （#4 单一包络不变量：渲染层降级只是不画，不改时钟）。
   */
  private onWebglContextLost = (event: Event) => {
    event.preventDefault();
    if (this.contextLost) return;
    this.contextLost = true;
    this.tierBeforeLoss = this.tier;
    const next: WebglTier = { tier: 'none', reason: 'context-lost' };
    this.tier = next;
    if (this.onDegrade) this.onDegrade(next);
  };

  /**
   * 上下文已恢复：按**丢失前**的档位原样恢复（不猜、不擅自升档）。
   *
   * three.js 内部已监听同一事件并重建 GL 资源，这里只负责把本类的档位与回调对齐。
   * 是否撤掉静默层由 App 决定（本类不碰 DOM 结构）。
   */
  private onWebglContextRestored = () => {
    if (!this.contextLost) return;
    this.contextLost = false;
    const restored: WebglTier = this.tierBeforeLoss ?? { tier: 'full' };
    this.tierBeforeLoss = null;
    this.tier = restored;
    if (this.onDegrade) this.onDegrade(restored);
  };

  /**
   * #7：登记降级回调 —— 运行中上下文丢失 / 恢复时触发（`none` ⇒ App 换静默层）。
   * 传 `undefined` 即注销。**不进公共产物**的是"强制降级开关"，本回调是正常产品逻辑。
   */
  public setOnDegrade(callback?: (tier: WebglTier) => void): void {
    this.onDegrade = callback;
  }

  /** #7：当前能力档位（构造时传入，运行中可能因上下文丢失改写）。 */
  public get webglTier(): WebglTier {
    return this.tier;
  }

  /**
   * #7：无画模式（`tier='none'`）—— 不建渲染器、不出画；
   * **时间轴 / 雾中字幕 / 音频照常**（#4 单一包络不变量）。
   */
  public get isDrawless(): boolean {
    return this.drawless;
  }

  /**
   * Ulam 中轴水利线：46→23→8→1 是阴腔内的机械提升；
   * 1→4→15→34 是阴腔内的重力支路。二者都不得露到阳 Cube 表面。
   */
  private buildRiverAxis() {
    const bySeat = new Map(this.events.map((event) => [event.seat_id, event]));
    const axis = RIVER_AXIS_SEATS.map((seatId) => bySeat.get(seatId)).filter((event): event is SpiralEvent => Boolean(event));
    if (axis.length !== RIVER_AXIS_SEATS.length) {
      throw new Error('Ulam 河轴缺席：46→23→8→1→4→15→34 必须完整存在');
    }

    const liftPoints = axis.slice(0, 4).map((event) => new THREE.Vector3(
      event.grid_x * CELL,
      scorpionWaterElevation(event.seat_id),
      event.grid_z * CELL
    ));
    const liftCurve = new THREE.CatmullRomCurve3(liftPoints, false, 'centripetal');
    const liftPipe = new THREE.Mesh(
      new THREE.TubeGeometry(liftCurve, 48, 0.16, 10, false),
      new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.34, metalness: 0.82 })
    );
    liftPipe.userData = { waterway: '46-23-8-1', mode: 'counterweight-lift' };
    this.waterworksGroup.add(liftPipe);

    const gravityPoints = RIVER_GRAVITY_SEATS.map((seatId) => {
      const event = bySeat.get(seatId)!;
      return new THREE.Vector3(event.grid_x * CELL, scorpionWaterElevation(event.seat_id), event.grid_z * CELL);
    });
    const gravityCurve = new THREE.CatmullRomCurve3(gravityPoints, false, 'centripetal');
    const bed = new THREE.Mesh(
      new THREE.TubeGeometry(gravityCurve, 36, CELL * 0.18, 10, false),
      new THREE.MeshStandardMaterial({ color: 0x0f3d56, roughness: 0.12, metalness: 0.72 })
    );
    bed.userData = { waterway: '1-4-15-34', mode: 'gravity' };
    this.waterworksGroup.add(bed);
  }

  /**
   * 横轴 Rabbit Hole：40→19→6→1→2→11→28。
   *
   * 它不夺用顶面 7×7 的任何一个格位，而是从第二层等体 Cube 中抽出一条
   * 3×3 的连续内腔。人进入入口 40 后以缩放视角在内腔穿行，出口为 28；
   * 经文挂在洞壁，故只有入内才看见，绝不成为外立面的装饰卡片。
   */
  private buildRabbitHole() {
    const bySeat = new Map(this.events.map((event) => [event.seat_id, event]));
    const axis = RABBIT_HOLE_SEATS.map((seatId) => bySeat.get(seatId));
    if (axis.some((event) => !event) || axis.some((event) => event!.grid_z !== 0)) {
      throw new Error('Rabbit Hole 必须是横轴 40→19→6→1→2→11→28（z=0）');
    }

    const group = new THREE.Group();
    group.name = 'rabbit-hole-40-19-6-1-2-11-28';
    const tunnelY = BRICK * 1.5;
    const tunnelLength = CELL * 7 - 0.12;

    // BackSide 只在镜头缩小、进入洞内时显影；外部仍是一座严丝合缝的方坛。
    const lining = new THREE.Mesh(
      new THREE.BoxGeometry(tunnelLength, BRICK - 0.16, BRICK - 0.16),
      new THREE.MeshStandardMaterial({
        color: 0x071827,
        emissive: 0x0b3150,
        emissiveIntensity: 0.48,
        roughness: 0.46,
        metalness: 0.38,
        side: THREE.BackSide
      })
    );
    lining.position.set(0, tunnelY, 0);
    lining.userData = { type: 'rabbit_hole_lining', axis: [...RABBIT_HOLE_SEATS] };
    group.add(lining);

    const portalMat = new THREE.MeshStandardMaterial({
      color: 0xd6a54a,
      emissive: 0x7c4b0e,
      emissiveIntensity: 0.7,
      roughness: 0.22,
      metalness: 0.84
    });
    [-1, 1].forEach((side) => {
      const portal = new THREE.Mesh(new THREE.TorusGeometry(BRICK * 0.37, 0.075, 10, 36), portalMat);
      portal.rotation.y = Math.PI / 2;
      portal.position.set(side * (CELL * 3 + 0.12), tunnelY, 0);
      portal.userData = { type: side < 0 ? 'rabbit_hole_entrance_40' : 'rabbit_hole_exit_28' };
      group.add(portal);
    });

    // Rabbit Hole 的诗句同样后置；此时只保留可验收的空腔与管路。

    this.hollowInteriorGroup.add(group);
  }

  /**
   * 十二座青玉经卷壁碑 —— 贴在最外圈砖柱的**朝外面**上。
   *
   * 最外圈（max(|i|,|j|) = 3）共 24 根柱，隔一根取一座，正好 12 座，绕坛一圈。
   * 每座碑的高度取它那根柱子的台面高程，碑面朝外。
   * （结构改成 49 根实心砖柱之后已经没有内腔了，碑改挂外侧；若以后恢复空腔再搬回去。）
   */
  /** 后置展示层：结构验收通过后才由显式调用启用。 */
  public buildInnerStelaeRing() {
    const outer = this.events
      .filter((ev) => Math.max(Math.abs(ev.grid_x), Math.abs(ev.grid_z)) === 3)
      .sort((a, b) => a.seat_id - b.seat_id);

    const picks = outer.filter((_, i) => i % 2 === 0).slice(0, SEASON1_POEMS.length);

    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.6,
      roughness: 0.3,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.94
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xb45309,
      emissiveIntensity: 0.5
    });

    const stelaH = BRICK * 0.9;
    const stelaW = BRICK * 2.4;

    picks.forEach((ev, i) => {
      const poem = SEASON1_POEMS[i % SEASON1_POEMS.length];

      let nx = 0;
      let nz = 0;
      if (Math.abs(ev.grid_x) === 3) nx = Math.sign(ev.grid_x);
      else nz = Math.sign(ev.grid_z);

      const cx = ev.grid_x * CELL + nx * (CELL / 2 + 0.08);
      const cz = ev.grid_z * CELL + nz * (CELL / 2 + 0.08);
      const cy = ev.elevation + stelaH / 2 - BRICK * 0.1;

      const stelaGroup = new THREE.Group();
      stelaGroup.position.set(cx, cy, cz);
      stelaGroup.rotation.y = Math.atan2(nx, nz);

      const slab = new THREE.Mesh(new THREE.BoxGeometry(stelaW, stelaH, 0.1), slabMat);
      slab.userData = { type: 'interior_stela', seasonId: poem.seasonId };
      stelaGroup.add(slab);
      this.interiorStelae.set(poem.seasonId, slab);

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(stelaW + 0.12, stelaH + 0.12, 0.06),
        frameMat
      );
      frame.position.z = -0.03;
      stelaGroup.add(frame);

      const sprite = this.createInteriorStelaSprite(poem);
      sprite.position.set(0, 0, 0.07);
      sprite.scale.set(stelaW, stelaH, 1);
      stelaGroup.add(sprite);

      this.hollowInteriorGroup.add(stelaGroup);
    });
  }

  private createInteriorStelaSprite(poem: typeof SEASON1_POEMS[0]): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.roundRect(8, 8, 240, 368, 12);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 28px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${poem.seasonId} ${poem.seasonName}`, 128, 50);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Noto Serif SC", serif';
    ctx.fillText(poem.opening.title, 128, 80);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px "Noto Serif SC", serif';
    ctx.textAlign = 'left';
    poem.opening.text.slice(0, 5).forEach((line, i) => {
      const shortLine = line.length > 14 ? line.substring(0, 13) + '…' : line;
      ctx.fillText(shortLine, 22, 125 + i * 26);
    });

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'italic 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('【点击展开全卷】', 128, 350);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.7, 2.5, 1);
    return sprite;
  }

  /** 后置展示层：结构验收通过后才由显式调用启用。 */
  public buildOuter16TeaLanterns() {
    // 16-Faceted Rotating Lantern Pavilion (十六面转经走马大茶灯回廊)
    const lanternRadius = 23.5;
    const lanternHeight = 4.6;

    TEA_POEM_16_CHAPTERS.forEach((ch, idx) => {
      const angle = (idx / 16) * Math.PI * 2;
      const x = Math.sin(angle) * lanternRadius;
      const z = Math.cos(angle) * lanternRadius;

      const panelGroup = new THREE.Group();
      panelGroup.position.set(x, lanternHeight / 2 + 0.3, z);
      panelGroup.rotation.y = angle;

      const screenGeo = new THREE.PlaneGeometry(3.8, lanternHeight);
      const screenMat = new THREE.MeshStandardMaterial({
        color: 0x0c1322,
        emissive: 0x1e293b,
        emissiveIntensity: 0.4,
        roughness: 0.4,
        metalness: 0.3,
        side: THREE.DoubleSide
      });
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.userData = { type: 'tea_lantern', chapterIndex: ch.chapterIndex };
      panelGroup.add(screenMesh);
      this.lanternPanels.set(ch.chapterIndex, screenMesh);

      const rodGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.0, 8);
      rodGeo.rotateZ(Math.PI / 2);
      const rodMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0x92400e,
        emissiveIntensity: 0.4
      });
      const topRod = new THREE.Mesh(rodGeo, rodMat);
      topRod.position.y = lanternHeight / 2;
      panelGroup.add(topRod);

      const botRod = new THREE.Mesh(rodGeo, rodMat);
      botRod.position.y = -lanternHeight / 2;
      panelGroup.add(botRod);

      const sprite = this.createTeaLanternSprite(ch);
      sprite.position.set(0, 0, 0.05);
      panelGroup.add(sprite);

      this.lanternsGroup.add(panelGroup);
    });
  }

  private createTeaLanternSprite(ch: typeof TEA_POEM_16_CHAPTERS[0]): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 853;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
    ctx.roundRect(17, 17, 606, 819, 27);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 50px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${ch.chapterIndex} 面 · ${ch.title.split(' · ')[1]}`, 320, 100);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '27px "Noto Serif SC", serif';
    ctx.fillText(ch.historicalTheme, 320, 158);

    // 双列是版式，不把“左栏/右栏/起承/转合”等编辑标签烧进门帘纹理。
    // CanvasTexture 不受 CSS 影响，因此 3D 扇面在这里直接按两列排版；
    // HTML 阅读层另由 CSS grid 控制同一份左右数据。
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '27px "Noto Serif SC", serif';
    ctx.textAlign = 'left';
    ch.leftColumn.slice(0, 4).forEach((line, i) => {
      ctx.fillText(line, 40, 242 + i * 53);
    });
    ch.rightColumn.slice(0, 4).forEach((line, i) => {
      ctx.fillText(line, 337, 242 + i * 53);
    });

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'italic 27px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('【点击展开 16 句全赋】', 320, 783);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.6, 4.4, 1);
    return sprite;
  }

  private buildWujiFountain() {
    // #00 无极点 · 吸光体：
    //   · 独立网格，挂在**场景根**上（不属于 outerShellGroup / 任何席位组）；
    //   · 材质：color 黑 / roughness 0.95 / metalness 0.1 / **无自发光**（emissive 关闭）；
    //   · 无 seatId、无音高、不进拾取列表，只在 24:00 后接受末段一束窄角冷顶光。
    //   世界坐标：x=0, y=PYRAMID_TOP+0.14(=21.14), z=0 —— 坛心正上方，不可占有。
    const absorber = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.82, 0.18, 48),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.95,
        metalness: 0.1,
        emissive: 0x000000,
        emissiveIntensity: 0
      })
    );
    absorber.position.set(0, PYRAMID_TOP + 0.14, 0);
    absorber.name = 'wuji_absorber_#00';
    // 归属标记：永不可认领 / 不可通证化；seatId 明置为 null（#00 不是席位，绝无第 50 席）。
    absorber.userData = { ritual_anchor: 'wuji', seatId: null, claimable: false, tokenizable: false };
    this.scene.add(absorber);
    this.wujiAbsorber = absorber;

    const beamGeo = new THREE.CylinderGeometry(0.3, 1.2, 20, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, PYRAMID_TOP + 9.75, 0);
    this.fountainGroup.add(beam);

    const ringGeo = new THREE.TorusGeometry(1.8, 0.08, 16, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xd97706,
      emissiveIntensity: 0.8
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, PYRAMID_TOP + 4, 0);
    this.fountainGroup.add(ring);

    const fountainPCount = 300;
    const fGeo = new THREE.BufferGeometry();
    const fPos = new Float32Array(fountainPCount * 3);
    for (let i = 0; i < fountainPCount; i++) {
      fPos[i * 3] = (Math.random() - 0.5) * 1.5;
      fPos[i * 3 + 1] = PYRAMID_TOP + 0.5 + Math.random() * 4.0;
      fPos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    const fMat = new THREE.PointsMaterial({
      size: 0.22,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.fountainParticles = new THREE.Points(fGeo, fMat);
    this.fountainGroup.add(this.fountainParticles);

    // 水龙沿阴蝎子楔的管芯走；绝不重建成阳面上的顶面水流。
    if (this.waterSpiralPath.length !== this.events.length) {
      throw new Error('水龙未绑定 49 枚蝎子楔');
    }
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let index = 0; index < this.waterSpiralPath.length - 1; index++) {
      curve.add(new THREE.LineCurve3(this.waterSpiralPath[index], this.waterSpiralPath[index + 1]));
    }
    const points = curve.getSpacedPoints(360);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.85
    });
    const waterLine = new THREE.Line(lineGeo, lineMat);
    waterLine.geometry.setDrawRange(0, 0);
    this.waterworksGroup.add(waterLine);
    this.waterLine = waterLine;

    const particleCount = 280;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const p = points[Math.floor(Math.random() * points.length)];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y + 0.08;
      positions[i * 3 + 2] = p.z;
      colors[i * 3] = 0.35;
      colors[i * 3 + 1] = 0.95;
      colors[i * 3 + 2] = 1.0;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.52,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.waterParticles = new THREE.Points(particleGeo, particleMat);
    this.waterworksGroup.add(this.waterParticles);

    // 阴龙不复制水路。它绕过 #00，由外缘大半径起步、按半音**向内收**，
    // 高度随内收**向上抬升** —— 与水龙“向外向下”互为反向（#2 要求 2/4）。
    // 节点取自唯一权威 `soundDragonNode`，第 n 点对应 C2.transpose(n)。
    const soundPoints: THREE.Vector3[] = [];
    for (let i = 0; i < DRAGON_SEAT_COUNT; i++) {
      const node = soundDragonNode(i + 1);
      soundPoints.push(new THREE.Vector3(node.x, node.y, node.z));
    }
    this.soundSpiralPath = soundPoints;
    const soundGeo = new THREE.BufferGeometry().setFromPoints(soundPoints);
    const soundMat = new THREE.LineBasicMaterial({
      color: 0xc4b5fd,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending
    });
    const soundLine = new THREE.Line(soundGeo, soundMat);
    soundLine.geometry.setDrawRange(0, 0);
    soundLine.visible = false;
    this.scene.add(soundLine);
    this.soundLine = soundLine;

    const soundParticleGeo = new THREE.BufferGeometry();
    const soundParticlePositions = new Float32Array(96 * 3);
    soundParticleGeo.setAttribute('position', new THREE.BufferAttribute(soundParticlePositions, 3));
    const soundParticleMat = new THREE.PointsMaterial({
      color: 0xe9d5ff,
      size: 0.32,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const soundParticles = new THREE.Points(soundParticleGeo, soundParticleMat);
    soundParticles.visible = false;
    this.scene.add(soundParticles);
    this.soundParticles = soundParticles;
  }

  /**
   * #2 要求 3：每个已触发席位保留一条**随音高收紧**的对数螺线光迹。
   *
   * 螺线 r(θ)=r0·e^{bθ}：b 由该席音高决定（见 `seatTrailTightnessB`）——
   * 音越高 b 越小、螺线越紧。锚点取该席音龙节点，使光迹紧贴“按半音回收”的声场。
   * 逐席建线（49 条），显隐由仪式已触发席数逐帧门控（见 setRitualState），
   * 未触发者恒不可见 —— 绝不预演未来席。
   */
  private buildSeatTrails(): void {
    const group = new THREE.Group();
    group.name = 'dual-dragon-seat-trails';
    // 49 条光迹共用一份材质（disposeSceneResources 以 Set 去重，不会重复回收）。
    const mat = new THREE.LineBasicMaterial({
      color: 0xe9d5ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const steps = 48;
    const turns = 2.4;
    for (let seatId = 1; seatId <= DRAGON_SEAT_COUNT; seatId++) {
      const node = soundDragonNode(seatId);
      const b = seatTrailTightnessB(seatId);
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * turns * Math.PI * 2;
        const r = 0.06 * Math.exp(b * theta); // 对数螺线：b 越小越紧
        pts.push(new THREE.Vector3(
          node.x + Math.cos(theta) * r,
          node.y + (s / steps) * 0.45,
          node.z + Math.sin(theta) * r
        ));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      line.visible = false;
      line.userData = { type: 'seat_trail', seatId };
      this.seatTrails.push(line);
      group.add(line);
    }
    this.seatTrailsGroup = group;
    this.scene.add(group);
  }

  private buildStarships() {
    this.events.forEach((ev) => {
      if (ev.seat_status === 'reserved' || ev.seat_id === 49) {
        const shipGroup = new THREE.Group();
        const basePos = this.getSeatWorldPos(ev);
        shipGroup.position.set(basePos.x, basePos.y + 4.5, basePos.z);

        const hullGeo = new THREE.ConeGeometry(0.4, 2.2, 4);
        hullGeo.rotateX(Math.PI / 2);
        const hullMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.9,
          roughness: 0.2,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.3
        });
        const hull = new THREE.Mesh(hullGeo, hullMat);
        shipGroup.add(hull);

        const wingGeo = new THREE.BoxGeometry(2.0, 0.05, 0.8);
        const wingMat = new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.8,
          roughness: 0.3
        });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, 0, 0.2);
        shipGroup.add(wings);

        shipGroup.scale.set(0.65, 0.65, 0.65);
        this.starshipMeshes.set(ev.seat_id, shipGroup);
        this.outerShellGroup.add(shipGroup);
      }
    });
  }

  private buildSurroundingAtmosphere() {
    const starCount = 1500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 300;
      starPos[i * 3 + 1] = Math.random() * 150;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.6, color: 0xffffff, transparent: true, opacity: 0.7 });
    const stars = new THREE.Points(starGeo, starMat);
    this.scene.add(stars);
  }

  private onWindowResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height);
  };

  private onPointerDown = (event: MouseEvent) => {
    // 访客不是自动播放的被动摄像机：每次鼠标/触摸才唤起一条固定路线。
    if (this.role === 'guest') {
      this.activateGuestRoutine();
      return;
    }
    const caps = this.capabilities;
    if (!caps.freeCamera) return;

    // 用户一按鼠标，立刻放弃自动机位过渡，别跟人抢镜头
    this.isCameraTransitioning = false;

    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // 1. Check Outer Tea Lanterns
    if (caps.pickLanterns) {
      const lanterns = Array.from(this.lanternPanels.values());
      const lanternHits = this.raycaster.intersectObjects(lanterns);
      if (lanternHits.length > 0) {
        const hit = lanternHits[0].object;
        const chIdx = hit.userData?.chapterIndex;
        if (chIdx) {
          this.focusTeaLantern(chIdx);
          if (this.onLanternSelect) {
            this.onLanternSelect(chIdx);
          }
          return;
        }
      }
    }

    // 2. Check Interior Stelae
    if (caps.pickStelae) {
      const stelae = Array.from(this.interiorStelae.values());
      const stelaHits = this.raycaster.intersectObjects(stelae);
      if (stelaHits.length > 0) {
        const hit = stelaHits[0].object;
        const sId = hit.userData?.seasonId;
        if (sId) {
          this.focusInteriorPoem(sId);
          if (this.onInteriorPoemSelect) {
            this.onInteriorPoemSelect(sId);
          }
          return;
        }
      }
    }

    // 3. Check Seat Pads（只读：只聚焦与回调，不写座次表）
    if (caps.pickSeats) {
      const pads = Array.from(this.seatPads.values());
      const seatHits = this.raycaster.intersectObjects(pads);
      if (seatHits.length > 0) {
        const hit = seatHits[0].object;
        const seatId = hit.userData?.seatId;
        if (seatId && this.onSeatSelect) {
          this.onSeatSelect(seatId);
          this.setActiveSeat(seatId);
          return;
        }
      }
    }

    // 4. 玉玺拾取（器物不是席位：不进 49 席、不发音、不入座次表）
    //    ⚠️ 命中后**只做选中**（高亮 + 推近），**不改形态**。
    //      形态变更一律走 UI（SealPanel）—— 圣物形态不能被一次误触改掉。
    if (caps.sealStamp || caps.sealExploded) {
      if (this.relic) {
        const relicHits = this.raycaster.intersectObjects(this.relic.pickables(), true);
        if (relicHits.length > 0) {
          this.selectRelic();
          this.onRelicSelect?.('imperial_seal');
        }
      }
    }
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.capabilities.freeCamera) return;
    const key = event.key.toLowerCase();
    if (key === 'r') {
      this.resetCamera();
      event.preventDefault();
      return;
    }
    if (!['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(key)) return;
    this.pressedKeys.add(key);
    event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.pressedKeys.delete(event.key.toLowerCase());
  };

  private onWindowBlur = () => this.pressedKeys.clear();

  public setActiveSeat(seatId: number) {
    this.activeSeatId = seatId;
    this.currentProgress = seatId;

    this.seatLotusMeshes.forEach((group, id) => {
      const isActive = id === seatId;
      group.scale.setScalar(isActive ? 1.1 : 0.65);
    });

    if (this.cameraMode === 'patrol') {
      const ev = this.events.find(e => e.seat_id === seatId);
      if (ev) {
        const targetPos = this.getSeatWorldPos(ev);
        this.targetControlsTarget.copy(targetPos);
        this.targetCameraPos.set(targetPos.x + 6, targetPos.y + 5, targetPos.z + 6);
        this.isCameraTransitioning = true;
      }
    }
  }

  /** 公共入口的导演状态：让水、光、声遵从同一条三十分钟时间轴。 */
  public setRitualState(
    phase: RitualPhase,
    litSeats: number,
    activeSeatId: number | null
  ) {
    this.ritualMode = true;
    this.ritualLitSeats = Math.max(0, Math.min(49, litSeats));
    this.isAutoPatrol = false;
    // 游客 routine 的残留倒计时归零：进坛后不再有任何机位硬切。
    // 公共页唯一的镜头运动是 animate() 第 0 段的连续环绕（不受 ritualMode 影响）。
    this.guestRoutineTimer = 0;
    this.guestRoutineIndex = 0;
    this.controls.enabled = false;
    this.scene.background = new THREE.Color(0x000000);
    const isDark = phase === 'abyss' || phase === 'silence';
    // 公共仪式可以暗，不能灰。雾只承担远景吸收，不许把 7×7 Cube 的贴合边界糊掉。
    this.scene.fog = new THREE.FogExp2(0x000000, isDark ? 0.07 : 0.006);

    if (this.ambientLight) this.ambientLight.intensity = isDark ? 0 : 0.18;
    if (this.sunLight) this.sunLight.intensity = isDark ? 0 : 1.35;
    if (this.rimLight) this.rimLight.intensity = isDark ? 0 : 0.82;
    if (this.apexLight) this.apexLight.intensity = isDark ? 0 : 0.62;
    if (this.wujiLight) this.wujiLight.intensity = phase === 'extinguishing' || phase === 'silence' ? 2.4 : 0;

    this.outerShellGroup.visible = phase !== 'abyss';
    this.hollowInteriorGroup.visible = phase !== 'abyss';
    this.waterworksGroup.visible = !isDark;
    this.fountainGroup.visible = !isDark;
    this.primeLinesGroup.visible = false;
    this.starshipMeshes.forEach((ship) => { ship.visible = false; });
    this.lanternsGroup.visible = phase === 'lanterns' || phase === 'extinguishing';
    // 回转由 RFC-008 引擎持续驱动，幕次切换不再改写转速（见 animate 第 9b 段）
    if (this.waterParticles) this.waterParticles.visible = phase === 'naming' || phase === 'lanterns';
    const dualDragonVisible = phase === 'naming' || phase === 'lanterns';
    if (this.waterLine) {
      this.waterLine.visible = dualDragonVisible;
      this.waterLine.geometry.setDrawRange(
        0,
        Math.round(this.waterLine.geometry.attributes.position.count * (this.ritualLitSeats / 49))
      );
    }
    if (this.soundLine) {
      this.soundLine.visible = dualDragonVisible;
      this.soundLine.geometry.setDrawRange(0, this.ritualLitSeats);
    }
    if (this.soundParticles) this.soundParticles.visible = dualDragonVisible;
    // #2：逐席光迹 —— 只有已触发席位保留光迹（未触发者不可见，绝不预演未来席）。
    if (this.seatTrailsGroup) this.seatTrailsGroup.visible = dualDragonVisible;
    this.seatTrails.forEach((trail, idx) => {
      trail.visible = dualDragonVisible && idx + 1 <= this.ritualLitSeats;
    });
    if (this.wujiAbsorber) this.wujiAbsorber.visible = phase !== 'abyss';
    // 玉玺属于导演台的器物层；公共仪式中不能让它与 #00 争中心。
    if (this.relic) this.relic.object3D.visible = false;
    if (this.relicDecal) this.relicDecal.object3D.visible = false;

    this.seatLotusMeshes.forEach((flower, id) => {
      flower.visible = id <= this.ritualLitSeats && !isDark;
      flower.scale.setScalar(id === activeSeatId ? 1.12 : 0.7);
    });
  }

  /**
   * 非剧本公共入口：一帧即呈现完整祭坛。
   * 不复用 setRitualState('lanterns', …)，因为后者仍是“按幕次演出”的语义。
   */
  // ── 公共入口 · 自运维演示循环 ──────────────────────────────────────

  /** 双龙前锋珠：水龙珠（外行下潜）+ 音龙珠（内收上升），让点名肉眼可见。 */
  private buildFrontBead(color: number, radius: number, emissive: number, lightIntensity: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'front-bead';
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 2.6,
      roughness: 0.3,
      metalness: 0.1
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 18), mat);
    group.add(mesh);
    // 一束跟随点名珠的光，让“水流抵达”真正照亮周围。
    const light = new THREE.PointLight(color, lightIntensity, 14, 1.7);
    group.add(light);
    return group;
  }

  /**
   * 公共入口：启动自运维演示循环。
   *
   * 直入版（presentImmediately）全坛常亮；startDemo 在此基础上驱动
   * 点名（1→49 逐席点亮发声）→ 定格（第 49 席）→ 逆熄（49→1 倒序熄灭）
   * → 留白 → 重生，周而复始。双龙、光迹、繁花、水线全部由同一
   * demoLitSeats 驱动（与 ritualLitSeatsAt 同语义，不预演未来席）。
   */
  public startDemo(): void {
    if (this.demoActive) return;
    this.demoActive = true;
    this.demoLitSeats = 0;
    this.demoNextSeat = 1;
    this.demoPhase = 'kindle';
    this.demoTimer = 0;
    this.isAutoPatrol = false;

    if (!this.waterFrontBead && this.waterSpiralPath.length > 0) {
      this.waterFrontBead = this.buildFrontBead(0x38bdf8, 0.72, 0x0b7ab8, 3.2);
      this.waterworksGroup.add(this.waterFrontBead);
      this.soundFrontBead = this.buildFrontBead(0xc4b5fd, 0.55, 0x7c5cbf, 2.6);
      this.scene.add(this.soundFrontBead);
    }
    // #00 无极点：演示循环中给一束常驻冷顶光（吸光体做视觉锚点，仍不可占有）。
    if (this.wujiLight) this.wujiLight.intensity = 0.9;
    if (this.wujiAbsorber) this.wujiAbsorber.visible = true;

    this.applyDemoVisuals();
    this.kickAudio();
  }

  /** 停掉演示循环（导演/工程入口不需要时）。 */
  public stopDemo(): void {
    if (!this.demoActive) return;
    this.demoActive = false;
    if (this.wujiLight) this.wujiLight.intensity = 0;
  }

  /**
   * 每帧推进演示状态机。点名每席发声一次（水声+编钟+拨弦）；
   * 未获用户手势时 altarAudio 静默跳过，由 kickAudio 的首次点击兜底。
   */
  private updateDemo(dt: number): void {
    if (!this.demoActive) return;
    this.demoTimer += Number.isFinite(dt) ? dt : 0;

    if (this.demoPhase === 'kindle') {
      if (this.demoTimer >= DEMO_KINDLE_SEC) {
        this.demoTimer -= DEMO_KINDLE_SEC;
        const next = Math.min(SEAT_ID_MAX, this.demoNextSeat);
        this.demoNextSeat = next + 1;
        this.demoLitSeats = next;
        const ev = this.events.find((e) => e.seat_id === next);
        if (ev) altarAudio.triggerSeatEvent(ev);
        if (next === SEAT_ID_MAX) {
          this.demoPhase = 'hold';
          this.demoTimer = 0;
        }
      }
    } else if (this.demoPhase === 'hold') {
      if (this.demoTimer >= DEMO_HOLD_SEC) {
        this.demoPhase = 'extinguish';
        this.demoTimer = 0;
        this.demoNextSeat = SEAT_ID_MAX;
      }
    } else if (this.demoPhase === 'extinguish') {
      if (this.demoTimer >= DEMO_EXTINGUISH_SEC) {
        this.demoTimer -= DEMO_EXTINGUISH_SEC;
        this.demoLitSeats = Math.max(0, this.demoNextSeat - 1);
        this.demoNextSeat = this.demoLitSeats;
        if (this.demoLitSeats <= 0) {
          this.demoPhase = 'rest';
          this.demoTimer = 0;
        }
      }
    } else {
      if (this.demoTimer >= DEMO_REST_SEC) {
        this.demoPhase = 'kindle';
        this.demoTimer = 0;
        this.demoNextSeat = 1;
        this.demoLitSeats = 0;
      }
    }

    this.applyDemoVisuals();
  }

  /** 把 demoLitSeats 落到全部演示驱动的视觉上（每帧幂等）。 */
  private applyDemoVisuals(): void {
    const lit = this.demoLitSeats;

    // 逐席光迹与繁花：点名中递增、逆熄中递减。
    if (this.seatTrailsGroup) this.seatTrailsGroup.visible = lit > 0;
    this.seatTrails.forEach((trail, idx) => { trail.visible = idx + 1 <= lit; });
    this.seatLotusMeshes.forEach((flower, id) => { flower.visible = id <= lit; });

    // 双龙粒子与线：同 setRitualState 的 drawRange 语义。
    if (this.waterParticles) this.waterParticles.visible = lit > 0;
    if (this.waterLine) {
      this.waterLine.visible = lit > 0;
      this.waterLine.geometry.setDrawRange(
        0,
        Math.round(this.waterLine.geometry.attributes.position.count * (lit / SEAT_ID_MAX))
      );
    }
    if (this.soundLine) {
      this.soundLine.visible = lit > 0;
      this.soundLine.geometry.setDrawRange(0, lit);
    }
    if (this.soundParticles) this.soundParticles.visible = lit > 0;

    // 前锋珠：水龙珠贴当前点名席（沿水路外行下潜），音龙珠贴对应音龙节点（内收上升）。
    const waterNode =
      lit > 0 && this.waterSpiralPath.length > 0
        ? this.waterSpiralPath[Math.min(lit, this.waterSpiralPath.length) - 1]
        : null;
    const soundNode =
      lit > 0 && this.soundSpiralPath.length > 0
        ? this.soundSpiralPath[Math.min(lit, this.soundSpiralPath.length) - 1]
        : null;

    if (this.waterFrontBead) {
      this.waterFrontBead.visible = waterNode !== null;
      if (waterNode) this.waterFrontBead.position.copy(waterNode);
    }
    if (this.soundFrontBead) {
      this.soundFrontBead.visible = soundNode !== null;
      if (soundNode) this.soundFrontBead.position.copy(soundNode);
    }
  }

  public presentImmediately() {
    this.ritualMode = false;
    this.ritualLitSeats = 49;
    this.isAutoPatrol = false;
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.006);

    if (this.ambientLight) this.ambientLight.intensity = 0.18;
    if (this.sunLight) this.sunLight.intensity = 1.35;
    if (this.rimLight) this.rimLight.intensity = 0.82;
    if (this.apexLight) this.apexLight.intensity = 0.62;
    if (this.wujiLight) this.wujiLight.intensity = 0;

    this.outerShellGroup.visible = true;
    this.hollowInteriorGroup.visible = true;
    this.waterworksGroup.visible = true;
    this.fountainGroup.visible = true;
    this.lanternsGroup.visible = true;
    if (this.waterParticles) this.waterParticles.visible = true;
    if (this.waterLine) {
      this.waterLine.visible = true;
      this.waterLine.geometry.setDrawRange(0, this.waterLine.geometry.attributes.position.count);
    }
    if (this.soundLine) {
      this.soundLine.visible = true;
      this.soundLine.geometry.setDrawRange(0, this.soundLine.geometry.attributes.position.count);
    }
    if (this.soundParticles) this.soundParticles.visible = true;
    // 直入版：不按幕次演出，49 席光迹一次性全显。
    this.seatTrails.forEach((trail) => { trail.visible = true; });
    if (this.wujiAbsorber) this.wujiAbsorber.visible = true;
    this.seatLotusMeshes.forEach((flower) => { flower.visible = true; });
  }

  /** 当前注入的仪式时间（秒）；null = 尚未注入。供导演台 / 工程入口读取。 */
  public get currentRitualTime(): number | null {
    return this.ritualTimeSec;
  }

  /**
   * 注入仪式时间（秒）—— 24:00 显形 / 29:11 静默的**唯一驱动入口**。
   *
   * 公共页当前是直入版（App 直接 presentImmediately()，没有内建三十分钟时间轴），
   * 所以这两个时间码**不依赖** App 的时间轴，而由导演台 / 工程入口按需调用本方法注入。
   * 复用了既有的 setRitualState(phase) 机制，不新造一套并行状态。
   *
   *   · sec < 24:00 → #00 尚未显形：冷顶光熄灭、吸光体隐藏（其余景观不动）
   *   · sec ≥ 24:00 → 末段：窄角冷色顶光点亮 #00 吸光体
   *   · sec ≥ 29:11 → 终局：除该冷顶光外，全坛完全静默
   *
   * 幂等且无帧循环依赖：一次调用即结算；跨档位时才切换场景状态并播报一次。
   */
  public setRitualTime(sec: number) {
    const t = Number.isFinite(sec) ? Math.max(0, sec) : 0;
    this.ritualTimeSec = t;

    const next: WujiRevealState = wujiRevealStateAt(t);
    const changed = next !== this.wujiRevealState;
    this.wujiRevealState = next;

    if (next === 'silent') {
      // 29:11 起：除 #00 的窄角冷色顶光外，全坛静默（不灰、不亮、不响）。
      // 走既有 silence 幕次：其余灯光归零、水/灯/石经收束，只留 wujiLight 一束。
      this.setRitualState('silence', SEAT_ID_MAX, null);
      if (changed) {
        console.log(`[无极] #00 静默 t=${t.toFixed(0)}s ≥ ${WUJI_SILENCE_SEC}s(29:11)：除冷顶光外全坛寂灭`);
      }
      return;
    }
    if (next === 'revealed') {
      // 24:00 起：末段窄角冷色顶光点亮 #00 吸光体；其余景观按 extinguishing 收束。
      this.setRitualState('extinguishing', SEAT_ID_MAX, this.activeSeatId);
      if (changed) {
        console.log(`[无极] #00 显形 t=${t.toFixed(0)}s ≥ ${WUJI_REVEAL_SEC}s(24:00)：窄角冷色顶光点亮吸光体`);
      }
      return;
    }

    // 24:00 之前：#00 尚未显形 —— 不点灯、隐藏吸光体。
    // #00 始终不在席位 / 拾取 / 音高 / 贡献路径上，这里只改它自己的可见性与受光。
    if (this.wujiLight) this.wujiLight.intensity = 0;
    if (this.wujiAbsorber) this.wujiAbsorber.visible = false;
    if (changed) {
      console.log(`[无极] #00 未显形 t=${t.toFixed(0)}s < 24:00：吸光体隐藏、冷顶光熄灭`);
    }
  }

  /**
   * 公共入口：启动 1800s 五幕时间轴（唯一的幕次 / 时间驱动源）。
   *
   * 置初幕 abyss —— 0–180s 深渊黑场是正典，不跳过、不倍速。
   * presentImmediately() 保留不删；导演路径（#5）自行决定用哪条。
   */
  public startRitual() {
    this.ritualRunning = true;
    this.ritualElapsed = 0;
    this.ritualPhase = 'abyss';
    this.namingLitSeats = -1;
    // 先归到 #00「未显形」档（<24:00），再落到初幕 abyss（黑场、litSeats=0）。
    this.setRitualTime(0);
    this.setRitualState('abyss', 0, null);
    this.kickAudio();
  }

  /**
   * #4 导演 / 工程入口 · 受控回放速率（**仅供导演 / 工程入口调用**）。
   *
   * 改变时间轴推进速度：`ritualElapsed += dt * rate`。公共入口从不调用本方法，
   * 故恒为 1.0 ⟹ 1800s 全程、**无倍速控件**。rate 夹到 [MIN, MAX]；
   * 非有限值回落默认 1.0（与 dt 的 isFinite 兜底同风格）。
   */
  public setPlaybackRate(rate: number): number {
    if (!Number.isFinite(rate)) {
      this.ritualPlaybackRate = RITUAL_PLAYBACK_DEFAULT;
    } else {
      this.ritualPlaybackRate = Math.min(
        RITUAL_PLAYBACK_MAX,
        Math.max(RITUAL_PLAYBACK_MIN, rate)
      );
    }
    return this.ritualPlaybackRate;
  }

  /** 当前回放速率（公共入口恒 1.0）。供导演 / 工程入口读取。 */
  public get playbackRate(): number {
    return this.ritualPlaybackRate;
  }

  /**
   * #7 工程入口 · 定位仪式时间（秒）—— 把内部时钟与全部派生状态**一次性**结算到 t。
   *
   * 供无头取证（`tools/capture`）按幕次 / 席次精确取样：直接置 `ritualElapsed = t`，
   * 复算幕次 / litSeats / #00 显形阈值，使后续 animate 帧从 t 起续跑。
   * 与「只调 setRitualState + setRitualTime 单点摆位」不同 —— 这里**同时对齐内部时钟**，
   * 否则下一帧 updateRitualTimeline 会用旧时钟把画面覆写回去（雾中字幕/门控也读时钟）。
   * 不改变时间轴推进逻辑；音频包络由下一帧的 updateRitualTimeline 统一结算（保持单一调用点）。
   */
  public seekTo(sec: number): number {
    const t = Number.isFinite(sec) ? Math.max(0, Math.min(RITUAL_TOTAL_SEC, sec)) : 0;
    this.ritualElapsed = t;
    const phase = ritualPhaseAt(t);
    this.ritualPhase = phase;
    const litSeats = ritualLitSeatsAt(t);
    this.namingLitSeats = litSeats;
    if (isTimelineDrivenPhase(phase)) {
      this.setRitualState(phase, litSeats, null);
    }
    // 无论哪一幕都结算 #00 显形 / 静默（extinguishing / silence 由 setRitualTime 内部处理）。
    this.setRitualTime(t);
    return t;
  }

  /**
   * 每帧推进 1800s 五幕时间轴；仅在仪式运行态生效。
   *
   * 防双写：只在 0 / 180 / 1020 三个边界改写幕次；1440（24:00）与 1751（29:11）
   * 一律交给 setRitualTime() 内部结算 —— 这里**绝不**重复调
   * setRitualState('extinguishing' | 'silence')。
   */
  private updateRitualTimeline(dt: number) {
    if (!this.ritualRunning) return;
    // dt 兜底：与同文件 setRitualTime 对齐 —— 非有限 dt 一律当 0。
    // 否则一次 NaN 会让 ritualElapsed 永久 NaN，仪式卡死在终幕、再不复位。
    const step = Number.isFinite(dt) ? dt : 0;
    // #4 受控回放速率：公共入口 rate=1（1800s 全程）；导演/工程入口可加速。
    this.ritualElapsed = Math.min(
      RITUAL_TOTAL_SEC,
      this.ritualElapsed + step * this.ritualPlaybackRate
    );

    const phase = ritualPhaseAt(this.ritualElapsed);
    if (phase !== this.ritualPhase) {
      const prev = this.ritualPhase;
      this.ritualPhase = phase;
      // 只有早段三幕在此改写；extinguishing / silence 交给 setRitualTime（契约：互斥、覆盖五幕）。
      if (isTimelineDrivenPhase(phase)) {
        if (phase === 'abyss') {
          this.setRitualState('abyss', 0, null);
        } else if (phase === 'naming') {
          this.namingLitSeats = -1; // 强制刷新首个 litSeats
          this.setRitualState('naming', 0, this.activeSeatId);
        } else {
          this.setRitualState('lanterns', SEAT_ID_MAX, this.activeSeatId);
        }
      }
      console.log(`[仪式] 幕次 ${prev} → ${phase} @ ${this.ritualElapsed.toFixed(0)}s / 1800s`);
    }

    // naming 幕：litSeats 由 0 线性升到 49（仅在整席台阶变化时重算，避免每帧重写）。
    if (phase === 'naming') {
      const litSeats = ritualLitSeatsAt(this.ritualElapsed);
      if (litSeats !== this.namingLitSeats) {
        this.namingLitSeats = litSeats;
        this.setRitualState('naming', litSeats, this.activeSeatId);
      }
    }

    // 唯一时间注入点：#00 显形（1440）/ 静默（1751）阈值 + extinguishing / silence 幕次。
    this.setRitualTime(this.ritualElapsed);

    // #4 五阶段音频包络：与幕次**同源**（ritualPhaseAt），逐帧落到三条声链
    // （水声 / 翻斗链条 / 低频空间混响）。silence 幕三层归零（1751→1800 恰 49s）。
    altarAudio.applyPhaseEnvelope(phase, phaseProgress(this.ritualElapsed));
  }

  /**
   * 启动公共仪式音频。Web Audio 需用户手势：先尽力 init()；
   * 被浏览器挂起 / 拦下就绑首次 pointerdown / keydown 再试一次。
   * **全程静默降级，绝不抛错。**
   */
  private kickAudio() {
    if (this.audioKicked) return;
    this.audioKicked = true;

    const attempt = () => {
      void altarAudio.init().catch(() => {
        /* 未获用户手势：静默降级，不影响画面 */
      });
    };

    attempt(); // 若已在手势上下文（如导演台点击进入）会即刻成功

    const resume = () => {
      attempt(); // 幂等 + 并发安全：init() 单飞，已初始化时短路
      if (this.audioResumeHandler) {
        window.removeEventListener('pointerdown', this.audioResumeHandler);
        window.removeEventListener('keydown', this.audioResumeHandler);
        this.audioResumeHandler = null;
      }
    };
    this.audioResumeHandler = resume;
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  public focusTeaLantern(chapterIndex: number) {
    this.cameraMode = 'outer_lanterns';
    this.activeLanternChapter = Math.max(0, Math.min(15, chapterIndex - 1));
    const angle = ((chapterIndex - 1) / 16) * Math.PI * 2;
    const lanternRadius = 23.5;
    const lanternHeight = 2.6;

    const currentGroupAngle = this.lanternsGroup.rotation.y;
    const effectiveAngle = angle + currentGroupAngle;

    const x = Math.sin(effectiveAngle) * lanternRadius;
    const z = Math.cos(effectiveAngle) * lanternRadius;

    const camDist = 6.2;
    const camX = Math.sin(effectiveAngle) * (lanternRadius + camDist);
    const camZ = Math.cos(effectiveAngle) * (lanternRadius + camDist);

    this.targetCameraPos.set(camX, lanternHeight + 0.5, camZ);
    this.targetControlsTarget.set(x, lanternHeight, z);
    this.isCameraTransitioning = true;
  }

  /** 朗诵开始时把镜头锁到当前扇面；章节结束时由播放器推进到下一面。 */
  private onNarrationChapterStart(chapter: NarrationChapter): void {
    this.lanternChoreographyActive = true;
    this.focusTeaLantern(chapter.index + 1);
  }

  private onNarrationChapterEnd(chapter: NarrationChapter): void {
    const next = chapter.index + 1;
    if (next < 17) this.focusTeaLantern(next + 1);
  }

  /** 显式启动 17 章朗诵；必须由导演入口或用户手势调用。 */
  public startLanternNarration(fromChapter = 0): void {
    this.lanternChoreographyActive = true;
    this.narration.play(fromChapter);
  }

  public stopLanternNarration(): void {
    this.narration.stop();
    this.lanternChoreographyActive = false;
  }

  /** 每帧重算当前扇面的世界机位，避免外环转动时镜头脱离门帘。 */
  private syncLanternCameraRail(): void {
    if (!this.lanternChoreographyActive || this.cameraMode !== 'outer_lanterns') return;
    const baseAngle = (this.activeLanternChapter / 16) * Math.PI * 2;
    const angle = baseAngle + this.lanternsGroup.rotation.y;
    const panelRadius = 23.5;
    const cameraRadius = 30.5;
    this.targetCameraPos.set(Math.sin(angle) * cameraRadius, 3.1 + this.lanternsGroup.position.y, Math.cos(angle) * cameraRadius);
    this.targetControlsTarget.set(Math.sin(angle) * panelRadius, 2.6 + this.lanternsGroup.position.y, Math.cos(angle) * panelRadius);
    this.isCameraTransitioning = true;
  }

  public focusInteriorPoem(seasonId: string) {
    this.cameraMode = 'interior';
    const slab = this.interiorStelae.get(seasonId);
    if (!slab) return;

    const p = new THREE.Vector3();
    slab.getWorldPosition(p);

    // 碑面朝内，相机退到碑前 5.5 单位，落在阴锥的空腔里
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(
      slab.getWorldQuaternion(new THREE.Quaternion())
    );
    const camPos = p.clone().add(facing.multiplyScalar(5.5));
    camPos.y = 2.2;

    this.targetCameraPos.copy(camPos);
    this.targetControlsTarget.copy(p);
    this.isCameraTransitioning = true;
  }

  /**
   * 外环回转速度：RFC-008 引擎接管后，直接写引擎的角速度 omega。
   * （保留旧的公开方法签名，内部改由引擎驱动，避免两套转速逻辑打架。）
   */
  public setLanternRotationSpeed(speed: number) {
    this.maglev.state.omega = speed;
  }

  public setSpeedMode(mode: 'pause' | 'ultra_slow' | 'slow') {
    if (mode === 'pause') {
      this.maglev.state.omega = 0.0;
    } else if (mode === 'ultra_slow') {
      this.maglev.state.omega = 0.0015;
    } else if (mode === 'slow') {
      this.maglev.state.omega = 0.005;
    }
  }

  /**
   * 切换身份。**认证层调用这一句，祭坛只消费身份，不自己实现认证。**
   * 见 docs/身份与相机权限规范.md §4。
   */
  public setRole(role: AltarRole) {
    this.role = role;
    this.applyRole();
  }

  public getRole(): AltarRole {
    return this.role;
  }

  /**
   * 按当前身份落能力表。
   *
   * 原来是 `isGuest` 二值，现在改成查 ROLE_CAPABILITIES：
   * 权限判定的唯一真源在 types/altar.ts 那张表里，这里只负责落到
   * controls / 相机边界 / 自动巡礼上。
   */
  private applyRole() {
    const isGuest = this.role === 'guest';
    const caps = ROLE_CAPABILITIES[this.role];
    this.capabilities = caps;
    this.cameraSafety = CAMERA_SAFETY_BY_ROLE[this.role];

    this.controls.enabled = caps.freeCamera;
    this.controls.enableRotate = caps.freeCamera;
    this.controls.enableZoom = caps.freeCamera;
    this.controls.enablePan = caps.freeCamera;

    // 推拉范围也角色化：玉玺 macro 特写真正卡人的是 minDistance，不是安全边界
    const distance = CAMERA_DISTANCE_BY_ROLE[this.role];
    this.controls.minDistance = distance.min;
    this.controls.maxDistance = distance.max;

    if (isGuest) {
      this.guestRoutineIndex = 0;
      this.guestRoutineTimer = 0;
      this.guestRoutinePlaying = false;
    } else {
      // 导演/认证自己掌机，游客 routine 不许抢镜头。
      this.isAutoPatrol = false;
    }
  }

  public getCapabilities(): AltarCapabilities {
    return this.capabilities;
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    this.isCameraTransitioning = true;

    if (mode === 'rabbit_hole') {
      // 从 40 号入口起步；真正的穿行由 updateRabbitHoleTour 连续完成，不能硬切进墙里。
      this.targetCameraPos.set(-CELL * 3 - 2.2, BRICK * 1.5, 0);
      this.targetControlsTarget.set(-CELL * 3, BRICK * 1.5, 0);
    } else if (mode === 'yin') {
      // 入阴：进到中空方锥的下层空腔（5×5×3 单位），略抬头看北壁的青玉碑
      this.targetCameraPos.set(0, 1.8, 2.5);
      this.targetControlsTarget.set(0, 2.6, -7.5);
    } else if (mode === 'interior') {
      this.targetCameraPos.set(0, 16, 18);
      this.targetControlsTarget.set(0, 6, 0);
    } else if (mode === 'outer_lanterns') {
      this.targetCameraPos.set(0, 6.5, 30.5);
      this.targetControlsTarget.set(0, 3.5, 23.5);
    } else if (mode === 'topdown') {
      this.targetCameraPos.set(0, 78, 0.1);
      this.targetControlsTarget.set(0, 0, 0);
    } else if (mode === 'fountain') {
      this.targetCameraPos.set(0, 26, 20);
      this.targetControlsTarget.set(0, 14, 0);
    } else if (mode === 'cinematic') {
      this.targetCameraPos.set(52, 26, 52);
      this.targetControlsTarget.set(0, 5, 0);
    } else if (mode === 'orbit') {
      this.targetCameraPos.set(48, 40, 58);
      this.targetControlsTarget.set(0, 6, 0);
    } else if (mode === 'patrol') {
      // 水道巡礼：基线机位 —— 坛体东南上方的外部视角，绝不入壳。
      // 逐席的真实目标由 setActiveSeat() 在该模式下刷新（见其上 patrol 分支）。
      this.targetCameraPos.set(46, 24, 46);
      this.targetControlsTarget.set(0, 5, 0);
    } else if (mode === 'relic') {
      // 玉玺机位：数值的唯一真源在玉玺 rig（sealSpec.SEAL_CAMERA_POSES），
      // 这里不复制一份常量，避免两边漂移。rig 未挂载时退回直算。
      const pose = this.relicRig?.getPose('overview');
      if (pose) {
        this.targetCameraPos.copy(pose.position);
        this.targetControlsTarget.copy(pose.target);
      } else {
        this.targetCameraPos.set(6.2, SEAL_HOVER_Y + 3.4, 8.6);
        this.targetControlsTarget.set(0, SEAL_HOVER_Y, 0);
      }
    }
  }

  /** 将自由观察席复位到场景外部的安全总览位。 */
  public resetCamera(): void {
    const position = new THREE.Vector3(48, 40, 58);
    const target = new THREE.Vector3(0, 6, 0);
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.targetCameraPos.copy(position);
    this.targetControlsTarget.copy(target);
    this.lastSafeCameraPos.copy(position);
    this.cameraMode = 'orbit';
    this.isCameraTransitioning = false;
    this.pressedKeys.clear();
    this.controls.update();
  }

  /**
   * #5 · 7×7 正交取证：启用**俯视正交相机**（沿 -Y 看，视口半宽 = `halfWidth`，丢弃 y）。
   *
   * 与 `setCameraMode('topdown')` 不同 —— 那是**透视**相机远距离俯视；
   * 这里给无头取证一个**真正交**投影，使 49 席在屏幕上落在均匀格点，
   * 与 `scripts/assert-ulam-projection.mjs` 的「e ≤ 1e-4」模型同源（半宽 = PYRAMID_HALF）。
   * 仅取证用，公共/导演运行时不调用 ⇒ 对生产零影响。返回该相机便于驱动读参数。
   */
  public setOrthoTopdown(halfWidth: number = PYRAMID_HALF): THREE.OrthographicCamera {
    // #7：无画模式没有 canvas，退化成 1:1 视口（本方法只服务取证入口，不在降级路径上）。
    const el = this.renderer ? this.renderer.domElement : null;
    const aspect = el && el.height > 0 ? el.width / el.height : 1;
    const cam = new THREE.OrthographicCamera(
      -halfWidth * aspect,
      halfWidth * aspect,
      halfWidth,
      -halfWidth,
      0.1,
      1000
    );
    cam.position.set(0, 200, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.orthoTopdownCamera = cam;
    return cam;
  }

  /** #5 · 关闭正交取证相机，主循环回到透视相机。 */
  public clearOrthoTopdown(): void {
    this.orthoTopdownCamera = null;
  }

  /** 鼠标/触摸一次只唤起一条游客既定路线，播放完停在当前位置。 */
  private activateGuestRoutine(): void {
    const routine = GUEST_ROUTINES[this.guestRoutineIndex];
    this.guestRoutineIndex = (this.guestRoutineIndex + 1) % GUEST_ROUTINES.length;
    this.guestRoutineTimer = 0;
    this.guestRoutinePlaying = true;
    this.rabbitHoleTourActive = routine === 'rabbit_hole';
    this.setCameraMode(routine);
  }

  /**
   * 访客的缩放路线：40 口入、28 口出。相机沿洞心移动而非 teleport，
   * 所以洞壁的诗句有阅读时间，也不会发生“镜头穿 Cube”的假象。
   */
  private updateRabbitHoleTour(progress: number): void {
    const startX = -CELL * 3 - 1.7;
    const endX = CELL * 3 + 1.7;
    const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
    const x = THREE.MathUtils.lerp(startX, endX, eased);
    const y = BRICK * 1.5;
    this.camera.position.set(x, y, 0);
    this.controls.target.set(Math.min(x + 2.1, endX), y, 0);
    this.isCameraTransitioning = false;
  }

  /** 认证者的鼠标看向 + WASD 平面飞行，Q/E 升降，Shift 加速。 */
  private updateFreeFlight(dt: number): void {
    if (!this.capabilities.freeCamera || this.pressedKeys.size === 0) return;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const delta = new THREE.Vector3();
    if (this.pressedKeys.has('w')) delta.add(forward);
    if (this.pressedKeys.has('s')) delta.sub(forward);
    if (this.pressedKeys.has('d')) delta.add(right);
    if (this.pressedKeys.has('a')) delta.sub(right);
    if (this.pressedKeys.has('e')) delta.y += 1;
    if (this.pressedKeys.has('q')) delta.y -= 1;
    if (delta.lengthSq() === 0) return;
    const speed = this.pressedKeys.has('shift') ? 24 : 8;
    delta.normalize().multiplyScalar(speed * dt);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.isCameraTransitioning = false;
  }

  public setAutoPatrol(patrol: boolean) {
    this.isAutoPatrol = patrol;
  }

  public updateEvents(events: SpiralEvent[]) {
    this.events = events;
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const elapsedTime = this.clock.getElapsedTime();
    const dt = Math.min(0.05, elapsedTime - this.lastElapsed);
    this.lastElapsed = elapsedTime;

    // 0. 公共入口 1800s 五幕时间轴（唯一幕次 / 时间驱动源，仅在仪式运行态推进）。
    this.updateRitualTimeline(dt);

    // 0.05 公共入口自运维演示循环：与仪式时间轴互斥（演示只在非 ritual 直入版跑）。
    this.updateDemo(dt);

    // 0.2 雾中一句：由时间轴结算后刷新字幕（至多一句）。
    this.syncFogCaption();

    // 0.1 游客路线只由 pointerdown 唤起，绝不在后台自顾自切换。
    if (this.role === 'guest' && this.guestRoutinePlaying) {
      this.guestRoutineTimer += dt;
      if (this.rabbitHoleTourActive) {
        this.updateRabbitHoleTour(this.guestRoutineTimer / GUEST_ROUTINE_SECONDS);
      }
      if (this.guestRoutineTimer >= GUEST_ROUTINE_SECONDS) {
        this.guestRoutinePlaying = false;
        this.rabbitHoleTourActive = false;
      }
    }

    // 0.15 朗诵门帘轨道：目标机位始终跟随当前扇面的世界角度。
    this.syncLanternCameraRail();

    // 1. Smooth Camera Transition
    if (this.isCameraTransitioning) {
      this.camera.position.lerp(this.targetCameraPos, 0.05);
      this.controls.target.lerp(this.targetControlsTarget, 0.05);
      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.1) {
        this.isCameraTransitioning = false;
      }
    }

    // 1.5 安全边界（见 docs/身份与相机权限规范.md §3.2）
    //     自由度高 = 出错面大；这几条不是限制自由，是防止自由变成故障。
    //     阈值已角色化（CAMERA_SAFETY_BY_ROLE）：游客档 = 原硬编码 0.3 / 120，
    //     一个数字都没动；导演档放宽，否则燕尾槽 macro 特写会被误判拉回。
    const p = this.camera.position;
    const finite = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    const tooLow = p.y < this.cameraSafety.minY;
    const tooFar = p.length() > this.cameraSafety.maxRadius;
    if (!finite || tooLow || tooFar) {
      this.camera.position.copy(this.lastSafeCameraPos);
      this.isCameraTransitioning = false;
    } else {
      this.lastSafeCameraPos.copy(p);
    }

    this.controls.update();
    this.updateFreeFlight(dt);

    // 2. 外环 16 茶灯的回转改由 RFC-008 引擎驱动（见第 9b 段），此处不再手动累加。

    // 3. 壁碑已嵌在阴锥内壁上，不再浮动/旋转（不是"浮在外面的卡片"）

    // 4. Subtle pulse on Ulam Prime diagonal lines
    if (this.primeLinesGroup) {
      this.primeLinesGroup.children.forEach((line, idx) => {
        const mat = (line as THREE.Line).material as THREE.LineBasicMaterial;
        mat.opacity = 0.4 + Math.sin(elapsedTime * 3 + idx) * 0.3;
      });
    }

    // 5. Rotate apex fountain ring & fountain particles
    if (this.fountainGroup) {
      this.fountainGroup.rotation.y = elapsedTime * 0.15;
    }
    if (this.fountainParticles) {
      const posAttr = this.fountainParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - 0.03;
        if (y < 7.2) y = 11.2;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // 6. 阳龙（水龙）：**逐席触发** —— 每个已触发席位一枚水珠，落在该席蝎子楔水芯。
    //    席位未触发前既不显形、也不落珠（唯一驱动源 = ritualLitSeatsAt，不预演未来席）。
    //    方向：沿 Ulam 方形螺旋向外（ring ↑）、向下（y ↓）。
    if (this.waterParticles && this.waterSpiralPath.length > 0) {
      const pAttr = this.waterParticles.geometry.attributes.position as THREE.BufferAttribute;
      const lit = this.dualDragonLitSeats();
      const visible = Math.min(lit, this.waterSpiralPath.length, pAttr.count);
      for (let i = 0; i < visible; i++) {
        const node = this.waterSpiralPath[i];
        const drift = Math.sin(elapsedTime * 2.4 + i * 0.7) * 0.035;
        pAttr.setXYZ(i, node.x + drift, node.y + 0.08, node.z + drift * 0.6);
      }
      pAttr.needsUpdate = true;
      this.waterParticles.geometry.setDrawRange(0, visible);
    }

    // 6b. 阴龙（音龙）：同一触发源的收束段 —— 每个已触发席位一枚音滴，落在该席音龙节点。
    //     方向与阳龙**互为反向**：向内（radius ↓）、向上（y ↑），按半音逐级回收。
    if (this.soundParticles && this.soundSpiralPath.length > 0) {
      const pAttr = this.soundParticles.geometry.attributes.position as THREE.BufferAttribute;
      const lit = this.dualDragonLitSeats();
      const visible = Math.min(lit, this.soundSpiralPath.length, pAttr.count);
      for (let i = 0; i < visible; i++) {
        const node = this.soundSpiralPath[i];
        const rise = Math.sin(elapsedTime * 1.8 + i * 0.5) * 0.02;
        pAttr.setXYZ(i, node.x, node.y + rise, node.z);
      }
      pAttr.needsUpdate = true;
      this.soundParticles.geometry.setDrawRange(0, visible);
    }

    // 7. Starships floating
    this.starshipMeshes.forEach((ship, id) => {
      ship.position.y += Math.sin(elapsedTime * 2 + id) * 0.002;
      ship.rotation.y = elapsedTime * 0.2 + id;
    });

    // 8. Flowers breathing
    this.seatLotusMeshes.forEach((flower, id) => {
      const pulse = 1.0 + Math.sin(elapsedTime * 2.5 + id) * 0.04;
      flower.rotation.y = elapsedTime * 0.2 + id;
      if (id !== this.activeSeatId) {
        flower.scale.set(0.65 * pulse, 0.65 * pulse, 0.65 * pulse);
      }
    });

    // 9. RFC-007 双体水梯：引擎驱动，北坡机关由此获得动力学
    this.waterLift.update(dt);
    this.syncWaterLiftVisual();

    // 9b. RFC-008 外环磁悬浮走马灯：引擎驱动回转/悬浮/声学击发。
    //     waterLiftSeismic 是北坡双桶撞簧的地脉震颤 —— 先衰减再喂给引擎，
    //     双桶每撞一次死点 → 走马灯受一次地脉震颤 → 触发声学击发。
    //     （地脉耦合链路一字未动；茶灯 1020s 门控只作用在**视觉转角**上。）
    this.updateLanternGate();
    this.waterLiftSeismic *= 0.92;
    this.maglev.update(dt, this.waterLiftSeismic);
    this.syncMaglevVisual();

    // 10. Auto patrol
    if (this.isAutoPatrol) {
      this.currentProgress += 0.05;
      if (this.currentProgress > 49.5) {
        this.currentProgress = 1;
      }
      const activeIdx = Math.max(1, Math.min(49, Math.floor(this.currentProgress)));
      if (activeIdx !== this.activeSeatId) {
        this.setActiveSeat(activeIdx);
        if (this.onSeatSelect) {
          this.onSeatSelect(activeIdx);
        }
      }
    }

    // 10. 玉玺：自转 + 呼吸 + 形态状态机（器物，不占席、不发音、不入座次表）
    if (this.relic) {
      this.relic.update(dt, elapsedTime);
      this.relicDecal?.update(dt);
      this.relicRig?.update(dt);
    }

    // #5：取证正交相机存在时以它渲一帧（俯视 7×7），否则走主循环透视相机。
    // #7：无画模式 / 上下文已丢失 ⇒ **不画**。只跳过这一次 draw call，
    //     上面的时间轴推进、字幕刷新、音频包络**一字未动**（#4 不变量）。
    if (this.renderer && !this.contextLost) {
      this.renderer.render(this.scene, this.orthoTopdownCamera ?? this.camera);
    }
  };

  // ── 传国玉玺（T03 接线，只此一段，不碰祭坛其余部分）────────────────

  /**
   * 挂载玉玺：悬浮于坛心正上方 PYRAMID_TOP + 2.2（= SEAL_HOVER_Y = 12.7）处。
   * 当前是 30 分钟自动播放、默认 guest，所以先保证它**自动可见、自动展示**：
   * 缓慢自转 + 呼吸浮动 + 自带柔光。交互留给导演/认证路由去开。
   */
  public mountRelic(): void {
    if (this.relic) return;

    const decal = new SealStampDecal();
    this.scene.add(decal.object3D);
    this.relicDecal = decal;

    const seal: ImperialSealObject = new ImperialSealObject({
      // 拓印触地：朱砂印痕落在坛体西侧台基（PYRAMID_HALF 之外，不被中空方锥遮挡）
      onStamp: () =>
        decal.stamp(
          new THREE.Vector3(SEAL_STAMP.home.x, SEAL_STAMP.home.y, SEAL_STAMP.home.z),
          seal.getEra()
        )
    });
    seal.object3D.position.set(0, SEAL_HOVER_Y, 0);
    this.scene.add(seal.object3D);
    this.relic = seal;

    // 用真实资产接管程序化占位几何（public/models/imperial_seal.glb）。
    // 文件缺失/解析失败一律安全退回占位，不会把玉玺弄丢，也不会中断场景。
    void seal.loadSealFromGLB().then((ok) => {
      if (ok) {
        console.info('[玉玺] 高精 GLB 已接管，三角面 =', seal.countTriangles());
      }
    });

    this.relicRig = new SealCameraRig({
      camera: this.camera,
      controlsTarget: this.controls.target
    });
  }

  /** 玉玺形态：normal（合） / exploded（拆解） / stamping（拓印） */
  public setSealMode(mode: SealMode): void {
    this.relic?.setMode(mode);
    this.relicRig?.focusMode(mode);
  }

  /** 断代层过滤：秦 → 汉新 → 魏晋十六国 → 辽金 */
  public setSealEra(era: SealEra): void {
    this.relic?.setEra(era);
  }

  /** 推近到悬浮玺台（导演/认证路由或点选玉玺时用） */
  public focusRelic(): void {
    this.relicRig?.focus('overview');
  }

  /**
   * 玉玺选中：**只高亮 + 推近，不改形态**。
   * 形态变更（拆解/拓印/断代）一律走 UI，见 SealPanel ——
   * 圣物形态不能被一次误触改掉，这是硬规矩。
   */
  public selectRelic(): void {
    this.relic?.handlePick(); // 器物侧只置选中态，不改形态
    this.focusRelic();
  }

  public clearRelicSelection(): void {
    this.relic?.setSelected(false);
  }

  /** 导演手动拖拆解进度（0 合 → 1 全拆），会覆盖形态自动过渡 */
  public setSealExploded(progress: number): void {
    this.relic?.setExplodedProgress(progress);
  }

  /** 拾取回调登记（骨架：不改动 role/guest 判定） */
  public setOnRelicSelect(callback?: (relicId: string) => void): void {
    this.onRelicSelect = callback;
  }

  /** 玉玺运行时状态（无席位语义，可安全上报） */
  public getRelicState(): ImperialSealState | null {
    return this.relic?.getState() ?? null;
  }

  private disposeRelic(): void {
    if (this.relic) {
      this.scene.remove(this.relic.object3D);
      this.relic.dispose();
      this.relic = null;
    }
    if (this.relicDecal) {
      this.scene.remove(this.relicDecal.object3D);
      this.relicDecal.dispose();
      this.relicDecal = null;
    }
    this.relicRig?.dispose();
    this.relicRig = null;
    this.onRelicSelect = undefined;
  }

  /**
   * 彻底释放 —— 按资源类别逐项回收。
   *
   * 以前这里只 dispose(renderer)，于是每次热更新都泄漏一整份场景：
   * 60+ 个 geometry、几十个 material、28 张 CanvasTexture、一个 Rapier
   * Wasm 世界、以及一个 WebGL context。React.StrictMode 挂载两遍，
   * 十来次之后浏览器 context 配额打满，就是白屏。现在全部回收。
   */
  public destroy() {
    // 0. 幂等闸：React.StrictMode 双挂、或 App 兜底路径重复清理时，二次调用必须安全返回。
    //    （销毁后 renderer / controls 已置空，再走一遍会炸在 null 上。）
    if (this.destroyed) return;
    this.destroyed = true;

    // 0. 先撤玉玺子系统；其 geometry/material/texture 由第 6 步统一遍历回收。
    this.disposeRelic();

    // 1. rAF
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // 2. 事件监听
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.container.removeEventListener('pointerdown', this.onPointerDown);

    // 3. 雾中字幕行（工程 HUD 的 DOM 自始不挂，数表只属于验收、不属于公共仪式）
    if (this.fogCaptionEl?.parentElement) {
      this.fogCaptionEl.parentElement.removeChild(this.fogCaptionEl);
    }
    this.fogCaptionEl = null;
    // 4. 控制器（内部也挂着 DOM 监听）
    this.controls.dispose();

    // 6. 场景全量回收：geometry / material / 全部贴图（28 张 CanvasTexture 在此）
    this.disposeSceneResources();

    // 7. 索引表与回调断开，别把整棵场景图挂在闭包上
    this.seatPads.clear();
    this.seatLotusMeshes.clear();
    this.starshipMeshes.clear();
    this.lanternPanels.clear();
    this.interiorStelae.clear();
    // RFC-007 双体水梯：几何随整棵场景图在第 6 步回收，这里只断开引用
    this.waterLiftGroup = null;
    this.waterLiftBucketA = null;
    this.waterLiftBucketB = null;
    this.waterLiftWaterA = null;
    this.waterLiftWaterB = null;
    this.waterLiftRopeA = null;
    this.waterLiftRopeB = null;
    // RFC-008 走马灯：引擎是纯数学状态、无场景资源（几何随场景图第 6 步回收），
    // 这里只把 RFC-007→RFC-008 的地脉冲击量归零。
    this.waterLiftSeismic = 0;
    this.waterSpiralPath = [];
    this.waterParticles = null;
    // #2：逐席光迹的几何随整棵场景图在第 6 步回收，这里只断开引用。
    this.seatTrails = [];
    this.seatTrailsGroup = null;
    this.soundSpiralPath = [];
    this.soundParticles = null;
    this.fountainParticles = null;
    this.ambientLight = null;
    this.sunLight = null;
    this.rimLight = null;
    this.apexLight = null;
    this.wujiLight = null;
    // #00 无极点吸光体：几何随整棵场景图在第 6 步回收，这里只断开引用。
    this.wujiAbsorber = null;
    this.onSeatSelect = undefined;
    this.onLanternSelect = undefined;
    this.onInteriorPoemSelect = undefined;

    // 8. 渲染器：dispose 之后必须 forceContextLoss()，
    //    否则 WebGL context 只是被标记为可丢弃，配额不会立刻回来。
    //    #7：无画模式根本没有渲染器（也就没有 canvas），这一步整段跳过。
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onWebglContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.onWebglContextRestored);
      this.renderer.setRenderTarget(null);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
    this.onDegrade = undefined;

    // 8b. 公共入口 1800s 时间轴 / Web Audio 手势兜底：停推进，摘掉 window 监听。
    this.ritualRunning = false;
    if (this.audioResumeHandler) {
      window.removeEventListener('pointerdown', this.audioResumeHandler);
      window.removeEventListener('keydown', this.audioResumeHandler);
      this.audioResumeHandler = null;
    }

    // 9. Tone.js：altarAudio 是这一轮仪式造的乐器，随祭坛一起拆，
    //    下次入坛由 App 的 begin() 重新 init()。拆不干净就是一堆悬挂的 AudioNode。
    try {
      altarAudio.dispose();
    } catch (err) {
      console.warn('音频资源释放失败（不影响场景释放）：', err);
    }
  }

  /**
   * 遍历场景，按类别回收：
   *   · geometry（共享几何用 Set 去重，不会重复 dispose）
   *   · material，以及 material 上挂着的**每一张**贴图（CanvasTexture 在这里）
   *   · 光源阴影贴图（独立 RenderTarget，dispose(material) 不会带走）
   *   · 场景级 background / environment 贴图
   */
  private disposeSceneResources(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    const collectMaterial = (material: THREE.Material) => {
      materials.add(material);
      // 贴图挂在材质实例的自有属性上（map / normalMap / alphaMap / sheenColorMap …）
      const record = material as unknown as Record<string, unknown>;
      Object.keys(record).forEach((key) => {
        const value = record[key];
        if (value && typeof value === 'object' && (value as THREE.Texture).isTexture) {
          textures.add(value as THREE.Texture);
        }
      });
      // ShaderMaterial 的贴图藏在 uniforms 里
      const uniforms = (material as THREE.ShaderMaterial).uniforms;
      if (uniforms) {
        Object.values(uniforms).forEach((uniform) => {
          const value = uniform?.value as THREE.Texture | undefined;
          if (value && value.isTexture) textures.add(value);
        });
      }
    };

    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);

      const material = (obj as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(material)) material.forEach(collectMaterial);
      else if (material) collectMaterial(material);

      const light = obj as THREE.Light;
      if (light.isLight && light.shadow) {
        light.shadow.map?.dispose();
      }
    });

    [this.scene.background, this.scene.environment].forEach((slot) => {
      if (slot && (slot as THREE.Texture).isTexture) textures.add(slot as THREE.Texture);
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());

    this.scene.clear();
    this.scene.background = null;
    this.scene.environment = null;
    this.scene.fog = null;
  }
}
