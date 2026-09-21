import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  SpiralEvent,
  CameraMode,
  AltarRole,
  AltarCapabilities,
  GUEST_ROUTINES,
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
  TEA_LANTERN_REV_SEC,
  teaLanternRotationEnabled,
  fogCaptionAt
} from '../data/dualDragon';
import {
  CELL,
  PYRAMID_HALF
} from '../data/altarGeometry';
import { ImperialSealObject } from './relic/ImperialSealObject';
import { CameraRig } from './CameraRig';
import { DemoDirector } from './DemoDirector';
import { RitualClock } from './RitualClock';
import { DualDragonRig } from './DualDragonRig';
import { StarshipRig } from './StarshipRig';
import { SeatLotusRig } from './SeatLotusRig';
import { MechanicsRig } from './MechanicsRig';
import { SealStampDecal } from './relic/SealStampDecal';
import type { ImperialSealState, SealEra, SealMode } from '../types/relic';
import { buildLightRig } from './LightRig';
import { buildInnerStelaeRing, buildOuter16TeaLanterns } from './StelaeLanternBuilder';
import { buildWaterWaterway, buildSoundWaterway } from './WaterwayBuilder';
import { onWindowResize as evWindowResize, onPointerDown as evPointerDown, onKeyDown as evKeyDown, onKeyUp as evKeyUp, onWindowBlur as evWindowBlur } from './EventHandlers';
import { RelicController } from './RelicController';
import { DemoController } from './DemoController';
import { RitualTimelineController } from './RitualTimelineController';
import { lanternCameraPose } from '../data/lanternCamera';
import { CAMERA_MODE_POSES } from '../data/cameraModes';
import { seatWorldPos } from '../data/seatWorldPos';
import { buildSurroundingAtmosphere } from './AtmosphereBuilder';
import { buildStarships } from './StarshipBuilder';
import { buildPlinth } from './PlinthBuilder';
import { buildSeatTrails } from './SeatTrailsBuilder';
import { buildRiverAxis } from './RiverAxisBuilder';
import { buildScorpionWaterway } from './ScorpionWaterwayBuilder';
import { buildRabbitHole } from './RabbitHoleBuilder';
import { buildWaterLift } from './WaterLiftBuilder';
import { buildBrickColumns } from './CubePyramidBuilder';
import { buildSeats } from './SeatsBuilder';
import { buildPrimeDiagonalLines } from './PrimeDiagonalBuilder';
import { buildWujiFountain } from './WujiFountainBuilder';
import { broadcastStateAt } from '../data/broadcastSchedule';
import { SEAL_HOVER_Y } from '../data/sealSpec';
import { altarAudio } from '../audio/altarAudio';
import { phaseProgress } from '../audio/phaseEnvelope';
import { RitualNarration, type NarrationChapter } from '../audio/ritualNarration';
import { AltarWaterLiftEngine } from './AltarWaterLiftEngine';
import { AltarMaglevLanternEngine } from './AltarMaglevLanternEngine';
import type { WebglTier } from './webglCapability';

// ── RFC-007 双体水梯 → 场景的映射常数 ──────────────────────────────
// 引擎世界：H=7.0、桶行程 z∈[-3.5,3.5]。这里把 7 单位行程映射成 6 个世界单位
// （= 2 个 CELL），整机占位远小于 3 CELL，立在北坡台基上，不遮 49 席与坛心玉玺。

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
  private rig!: CameraRig;
  private demo!: DemoDirector;
  private ritualClock!: RitualClock;
  private mech!: MechanicsRig;
  private dragon!: DualDragonRig;
  private starship!: StarshipRig;
  private lotus!: SeatLotusRig;
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

  /**
   * #5 · 7×7 正交取证相机（俯视，沿 -Y 看，丢弃 y）。
   * 非 null 时 animate 用它渲一帧，供无头取证出「俯视正交截图」；
   * 公共/导演运行时不设，故对生产零影响。
   */
  private ambientLight: THREE.AmbientLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private apexLight: THREE.PointLight | null = null;
  private wujiLight: THREE.SpotLight | null = null;
  private ritualMode = false;
  private ritualLitSeats = 0;
  /** #00 显形档位：hidden(<24:00) / revealed(≥24:00) / silent(≥29:11)。用于幂等与一次性播报。 */
  private wujiRevealState: WujiRevealState = 'hidden';

  // ── 公共入口 · 1800s 五幕时间轴 ────────────────────────────────────
  /** 仪式已运行秒数（仅在 ritualRunning 时随 dt 推进）。 */
  /**
   * 时间轴回放速率（#4）。公共入口恒 1.0（1800s 全程）；仅导演/工程入口
   * 经 setPlaybackRate() 变更，用于加速回放。默认值即公共入口行为。
   */
  /** 时间轴是否在推进：startRitual() 置真，presentImmediately() 保持假。 */
  /** naming 幕上一帧的 litSeats；-1 表示需要强制刷新。 */

  // ── 公共入口 · 自运维演示循环状态 ──────────────────────────────────
  /** Web Audio 手势兜底是否已武装（避免重复绑定）。 */
  private audioKicked = false;
  private audioResumeHandler: (() => void) | null = null;
  /** 章节朗诵与门帘轨道镜头共用的唯一章节游标。 */
  private narration: RitualNarration;
  private lanternChoreographyActive = false;
  private activeLanternChapter = 0;
  
  // Interactive Objects & Meshes
  /** 阴龙：不占席、不承载文字，只把 49 个半音向上卷成可见的气流。 */
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
  private lanternPanels: Map<number, THREE.Mesh> = new Map();
  private interiorStelae: Map<string, THREE.Mesh> = new Map();

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // 玉玺子系统（器物：不占格、不发音、不入座次表）
  private relic: ImperialSealObject | null = null;
  private relicDecal: SealStampDecal | null = null;
  private relicController: RelicController | null = null;
  private demoController: DemoController | null = null;
  private ritualController: RitualTimelineController | null = null;
  private onRelicSelect?: (relicId: string) => void;


  // State
  private events: SpiralEvent[] = [];
  private activeSeatId: number | null = 1;
  private onSeatSelect?: (seatId: number) => void;

  /** 事件处理上下文（供 EventHandlers 模块使用） */
  private get eventContext(): import('./EventHandlers').EventContext {
    return {
      container: this.container,
      camera: this.camera,
      renderer: this.renderer,
      raycaster: this.raycaster,
      mouse: this.mouse,
      lanternPanels: this.lanternPanels,
      interiorStelae: this.interiorStelae,
      seatPads: this.seatPads,
      relic: this.relic,
      caps: this.rig.caps,
      pressedKeys: this.rig.pressedKeys,
      onLanternSelect: this.onLanternSelect,
      onInteriorPoemSelect: this.onInteriorPoemSelect,
      onSeatSelect: this.onSeatSelect,
      onRelicSelect: this.onRelicSelect,
      focusTeaLantern: (id) => this.focusTeaLantern(id),
      focusInteriorPoem: (id) => this.focusInteriorPoem(id),
      setActiveSeat: (id) => this.setActiveSeat(id),
      selectRelic: () => this.selectRelic(),
      resetCamera: () => this.resetCamera(),
      activateGuestRoutine: () => this.activateGuestRoutine(),
      role: this.rig.role,
      transitioning: this.rig.transitioning,
      setTransitioning: (v) => { this.rig.transitioning = v; },
    };
  }
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
  /** QA 节奏日志上限：相变/击发各打前 8 条以证明「周期发生」，之后静默避免刷屏 */
  private waterLiftPhaseLogCount = 0;
  private maglevStrumLogCount = 0;
  private currentProgress = 1;
  private isAutoPatrol = false;


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
    this.rig = new CameraRig(this.camera, this.controls);
    this.demo = new DemoDirector();
    this.ritualClock = new RitualClock();
    this.mech = new MechanicsRig();
    this.dragon = new DualDragonRig();
    this.starship = new StarshipRig();
    this.lotus = new SeatLotusRig();
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
    this.mech.registerLanterns(this.lanternsGroup);
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
    const handles = buildLightRig(this.scene, this.hollowInteriorGroup);
    this.ambientLight = handles.ambient;
    this.sunLight = handles.sun;
    this.rimLight = handles.rim;
    this.apexLight = handles.apex;
    this.wujiLight = handles.wuji;
  }

  /**
   * 台基。水路收进 Cube 阴腔后，台基不再留一条露天河道。
   */
  private buildPlinthAndRiver() {
    buildPlinth(this.outerShellGroup);
  }

  /**
   * 席位世界坐标。
   * 每席就是一块立方砖，砖心正好落在平面格点上，所以席位坐标 = 格点坐标。
   */
  private getSeatWorldPos(event: SpiralEvent): THREE.Vector3 {
    const p = seatWorldPos(event, CELL);
    return new THREE.Vector3(p.x, p.y, p.z);
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
    // ---- 1. 49 根砖柱：每席一根，从地面砌到该席的台面高程 ----
    buildBrickColumns(this.events, this.outerShellGroup);

    const seatEvents = this.events.filter((ev) => isSeatId(ev.seat_id));

    // ---- 2. 阴蝎子楔：水路不许出现在阳 Cube 的外露面 ----
    this.buildScorpionWaterway();
    // RFC-007：北坡双桶天车（中空神索·阿特伍德振子）—— 引擎接管前先把可视装置立好
    this.buildWaterLift();

    this.buildRiverAxis();
    this.buildRabbitHole();

    // ---- 3. 49 席：托座 / 质数环 / 莲花 ----
    buildSeats(seatEvents, (ev) => this.getSeatWorldPos(ev), this.seatPads, this.lotus, this.outerShellGroup);

    // Ulam 素数对角线
    buildPrimeDiagonalLines(seatEvents, (ev) => this.getSeatWorldPos(ev), this.primeLinesGroup);
  }

  /**
   * 49 枚蝎子楔把水封进 Cube 的阴腔。
   *
   * 每一条边都是一段从当前 Cube 腹腔通往相邻 Cube 腹腔的光滑壳管：
   * 其中心高程严格按席号下降，俯视方向严格按 Ulam 方形螺旋转弯。
   * 阳 Cube 没有槽、没有坡、没有水滴碰撞面；所以水无从跑到坛外。
   */
  private buildScorpionWaterway() {
    buildScorpionWaterway(this.events, this.waterworksGroup, (pts) => this.dragon.setWaterPath(pts));
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
    const wl = buildWaterLift();
    this.mech.registerWaterLift(wl.group, wl.bucketA, wl.bucketB, wl.waterA, wl.waterB, wl.ropeA, wl.ropeB);
    this.hollowInteriorGroup.add(wl.group);

    this.waterLift.onPhaseTransition = (highBucket, massSkimmed, tone) => {
      altarAudio.triggerFountainPulse();
      altarAudio.triggerBucketChain(tone);
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
    this.mech.syncWaterLift(this.waterLift.state);
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
    this.mech.syncMaglev(this.maglev.state, this.lanternGateOpen, this.lanternRotationTheta0);
  }

  /**
   * #2 要求 5：16 盏茶灯仅在 17:00（1020s = RITUAL_NAMING_END_SEC）之后低速转动
   * （沿用 RFC-008 引擎既有 maxOmega，120s/圈）。**只门控旋转** ——
   * RFC-008 的地脉耦合（`maglev.update(dt, waterLiftSeismic)`）一字未动。
   * 非仪式档（导演台 / 直入）不设门，保持既有行为。
   */
  private updateLanternGate(): void {
    const open = !this.ritualMode || teaLanternRotationEnabled(this.ritualClock.elapsed);
    if (open === this.lanternGateOpen) return;
    this.lanternGateOpen = open;
    if (open) {
      // 从当前引擎转角起算显示零点，跨过 1020s 时不跳变。
      this.lanternRotationTheta0 = this.maglev.state.theta;
      // 只在**仪式运行态且确由 ≥1020s 触发**时播报：构造函数同步调 animate()，
      // 首帧早于 App.startRitual()，此时 ritualMode 仍为 false（!ritualMode 分支开门），
      // 若在此打印会给出「门控开放 @ 0s ≥ 1020s(17:00)」这类**误导审计**的日志。
      // 门控行为本身不变（开门/关门照旧），只收敛日志。
      if (this.ritualClock.running && this.ritualMode) {
        console.log(
          `[走马灯] 门控开放 @ ${this.ritualClock.elapsed.toFixed(0)}s ≥ ${RITUAL_NAMING_END_SEC}s(17:00)：` +
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
    if (this.demo.isActive) return this.demo.lit;
    return this.ritualMode ? this.ritualLitSeats : SEAT_ID_MAX;
  }

  /**
   * #2 要求 6：雾中一句。以时间轴结算的 `ritualElapsed` 查唯一权威 `fogCaptionAt`
   * （窗口两两不重叠 ⟹ 至多一句），只在文本变化时改写 DOM，避免每帧重排。
   * 非仪式档不显示雾中字幕。
   */
  private syncFogCaption(): void {
    if (!this.fogCaptionEl) return;
    const line = this.ritualMode ? fogCaptionAt(this.ritualClock.elapsed) : null;
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
    buildRiverAxis(this.events, this.waterworksGroup);
  }

  /**
   * 横轴 Rabbit Hole：40→19→6→1→2→11→28。
   *
   * 它不夺用顶面 7×7 的任何一个格位，而是从第二层等体 Cube 中抽出一条
   * 3×3 的连续内腔。人进入入口 40 后以缩放视角在内腔穿行，出口为 28；
   * 经文挂在洞壁，故只有入内才看见，绝不成为外立面的装饰卡片。
   */
  private buildRabbitHole() {
    buildRabbitHole(this.events, this.hollowInteriorGroup);
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
    this.interiorStelae = buildInnerStelaeRing(this.events, this.hollowInteriorGroup);
  }

  /** 后置展示层：结构验收通过后才由显式调用启用。 */
  public buildOuter16TeaLanterns() {
    this.lanternPanels = buildOuter16TeaLanterns(this.lanternsGroup);
  }

  private buildWujiFountain() {
    const { absorber, fountainParticles } = buildWujiFountain(this.scene, this.fountainGroup);
    this.wujiAbsorber = absorber;
    this.fountainParticles = fountainParticles;

    // 水龙沿阴蝎子楔的管芯走；绝不重建成阳面上的顶面水流。
    if (this.dragon.waterPath.length !== this.events.length) {
      throw new Error('水龙未绑定 49 枚蝎子楔');
    }
    const { waterLine, waterParticles } = buildWaterWaterway(this.dragon.waterPath, this.waterworksGroup);

    // 阴龙不复制水路。它绕过 #00，由外缘大半径起步、按半音**向内收**。
    const { soundPoints, soundLine, soundParticles } = buildSoundWaterway(this.scene);
    this.dragon.setSoundPath(soundPoints);
    this.dragon.registerParticles(waterParticles, waterLine, soundLine, soundParticles);
  }

  /**
   * #2 要求 3：每个已触发席位保留一条**随音高收紧**的对数螺线光迹。
   *
   * 音越高 b 越小、螺线越紧。锚点取该席音龙节点，使光迹紧贴“按半音回收”的声场。
   * 逐席建线（49 条），显隐由仪式已触发席数逐帧门控（见 setRitualState），
   * 未触发者恒不可见 —— 绝不预演未来席。
   */
  private buildSeatTrails(): void {
    const { group, lines } = buildSeatTrails(this.scene);
    this.seatTrailsGroup = group;
    this.seatTrails.push(...lines);
  }

  private buildStarships() {
    buildStarships(this.events, (ev) => { const p = this.getSeatWorldPos(ev); return { x: p.x, y: p.y, z: p.z }; }, this.starship, this.outerShellGroup);
  }

  private buildSurroundingAtmosphere() {
    buildSurroundingAtmosphere(this.scene);
  }

  private onWindowResize = () => evWindowResize(this.eventContext);

  private onPointerDown = (event: MouseEvent) => evPointerDown(this.eventContext, event);

  private onKeyDown = (event: KeyboardEvent) => evKeyDown(this.eventContext, event);

  private onKeyUp = (event: KeyboardEvent) => evKeyUp(this.eventContext, event);

  private onWindowBlur = () => evWindowBlur(this.eventContext);

  public setActiveSeat(seatId: number) {
    this.activeSeatId = seatId;
    this.currentProgress = seatId;

    this.lotus.setFocus(seatId);

    if (this.rig.cameraMode === 'patrol') {
      const ev = this.events.find(e => e.seat_id === seatId);
      if (ev) {
        const targetPos = this.getSeatWorldPos(ev);
        this.rig.targetLookAt.copy(targetPos);
        this.rig.targetPos.set(targetPos.x + 6, targetPos.y + 5, targetPos.z + 6);
        this.rig.transitioning = true;
      }
    }
  }

  /** 公共入口的导演状态：让水、光、声遵从同一条三十分钟时间轴。 */
  public setRitualState(
    phase: RitualPhase,
    litSeats: number,
    activeSeatId: number | null
  ) {
    if (!this.ritualController) {
      this.ritualController = new RitualTimelineController({
        clock: this.ritualClock,
        scene: this.scene,
        ambientLight: this.ambientLight,
        sunLight: this.sunLight,
        rimLight: this.rimLight,
        apexLight: this.apexLight,
        wujiLight: this.wujiLight,
        outerShellGroup: this.outerShellGroup,
        hollowInteriorGroup: this.hollowInteriorGroup,
        waterworksGroup: this.waterworksGroup,
        fountainGroup: this.fountainGroup,
        lanternsGroup: this.lanternsGroup,
        seatTrailsGroup: this.seatTrailsGroup,
        seatTrails: this.seatTrails,
        wujiAbsorber: this.wujiAbsorber,
        relic: this.relic,
        relicDecal: this.relicDecal,
        dragon: this.dragon,
        lotus: this.lotus,
        starship: this.starship,
        rig: this.rig,
        controls: this.controls,
        activeSeatId: this.activeSeatId,
        onKickAudio: () => this.kickAudio()
      });
    }
    this.ritualController.setRitualState(phase, litSeats, activeSeatId);
    this.ritualMode = this.ritualController.ritualMode;
    this.ritualLitSeats = this.ritualController.ritualLitSeats;
  }

  /**
   * 非剧本公共入口：一帧即呈现完整祭坛。
   * 不复用 setRitualState('lanterns', …)，因为后者仍是“按幕次演出”的语义。
   */
  // ── 公共入口 · 自运维演示循环 ──────────────────────────────────────

  /**
   * 公共入口：启动自运维演示循环。
   *
   * 直入版（presentImmediately）全坛常亮；startDemo 在此基础上驱动
   * 点名（1→49 逐席点亮发声）→ 定格（第 49 席）→ 逆熄（49→1 倒序熄灭）
   * → 留白 → 重生，周而复始。双龙、光迹、繁花、水线全部由同一
   * demoLitSeats 驱动（与 ritualLitSeatsAt 同语义，不预演未来席）。
   */
  public startDemo(): void {
    if (!this.demoController) {
      this.demoController = new DemoController({
        demo: this.demo,
        seatTrails: this.seatTrails,
        seatTrailsGroup: this.seatTrailsGroup,
        lotus: this.lotus,
        dragon: this.dragon,
        events: this.events,
        waterworksGroup: this.waterworksGroup,
        scene: this.scene,
        wujiLight: this.wujiLight,
        wujiAbsorber: this.wujiAbsorber
      });
    }
    this.isAutoPatrol = false;
    this.demoController.start();
    this.kickAudio();
  }

  /** 停掉演示循环（导演/工程入口不需要时）。 */
  public stopDemo(): void {
    this.demoController?.stop();
  }

  /**
   * 每帧推进演示状态机。点名每席发声一次（水声+编钟+拨弦）；
   * 未获用户手势时 altarAudio 静默跳过，由 kickAudio 的首次点击兜底。
   */
  private updateDemo(dt: number): void {
    this.demoController?.update(dt);
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
    this.dragon.presentAll();
    // 直入版：不按幕次演出，49 席光迹一次性全显。
    this.seatTrails.forEach((trail) => { trail.visible = true; });
    if (this.wujiAbsorber) this.wujiAbsorber.visible = true;
    this.lotus.presentAll();
  }

  /** 当前注入的仪式时间（秒）；null = 尚未注入。供导演台 / 工程入口读取。 */
  public get currentRitualTime(): number | null {
    return this.ritualClock.timeSec;
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
    this.ritualClock.timeSec = t;

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
    this.ritualClock.running = true;
    // #19 公共正典广播时钟：从 Asia/Shanghai 当前时间取场内秒数
    const broadcast = broadcastStateAt(new Date());
    const startSec = broadcast.mode === 'live' ? broadcast.showSec ?? 0 : 0;
    this.ritualClock.elapsed = startSec;
    this.ritualClock.phase = ritualPhaseAt(startSec);
    this.ritualClock.namingLitSeats = -1;
    // 先归到 #00「未显形」档（<24:00），再落到初幕 abyss（黑场、litSeats=0）。
    this.setRitualTime(startSec);
    this.setRitualState(this.ritualClock.phase, 0, null);
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
      this.ritualClock.rate = RITUAL_PLAYBACK_DEFAULT;
    } else {
      this.ritualClock.rate = Math.min(
        RITUAL_PLAYBACK_MAX,
        Math.max(RITUAL_PLAYBACK_MIN, rate)
      );
    }
    return this.ritualClock.rate;
  }

  /** 当前回放速率（公共入口恒 1.0）。供导演 / 工程入口读取。 */
  public get playbackRate(): number {
    return this.ritualClock.rate;
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
    this.ritualClock.elapsed = t;
    const phase = ritualPhaseAt(t);
    this.ritualClock.phase = phase;
    const litSeats = ritualLitSeatsAt(t);
    this.ritualClock.namingLitSeats = litSeats;
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
    if (!this.ritualClock.running) return;
    // dt 兜底：与同文件 setRitualTime 对齐 —— 非有限 dt 一律当 0。
    // 否则一次 NaN 会让 ritualElapsed 永久 NaN，仪式卡死在终幕、再不复位。
    const step = Number.isFinite(dt) ? dt : 0;
    // #4 受控回放速率：公共入口 rate=1（1800s 全程）；导演/工程入口可加速。
    this.ritualClock.elapsed = Math.min(
      RITUAL_TOTAL_SEC,
      this.ritualClock.elapsed + step * this.ritualClock.rate
    );

    const phase = ritualPhaseAt(this.ritualClock.elapsed);
    if (phase !== this.ritualClock.phase) {
      const prev = this.ritualClock.phase;
      this.ritualClock.phase = phase;
      // 只有早段三幕在此改写；extinguishing / silence 交给 setRitualTime（契约：互斥、覆盖五幕）。
      if (isTimelineDrivenPhase(phase)) {
        if (phase === 'abyss') {
          this.setRitualState('abyss', 0, null);
        } else if (phase === 'naming') {
          this.ritualClock.namingLitSeats = -1; // 强制刷新首个 litSeats
          this.setRitualState('naming', 0, this.activeSeatId);
        } else {
          this.setRitualState('lanterns', SEAT_ID_MAX, this.activeSeatId);
        }
      }
      console.log(`[仪式] 幕次 ${prev} → ${phase} @ ${this.ritualClock.elapsed.toFixed(0)}s / 1800s`);
    }

    // naming 幕：litSeats 由 0 线性升到 49（仅在整席台阶变化时重算，避免每帧重写）。
    if (phase === 'naming') {
      const litSeats = ritualLitSeatsAt(this.ritualClock.elapsed);
      if (litSeats !== this.ritualClock.namingLitSeats) {
        this.ritualClock.namingLitSeats = litSeats;
        this.setRitualState('naming', litSeats, this.activeSeatId);
      }
    }

    // 唯一时间注入点：#00 显形（1440）/ 静默（1751）阈值 + extinguishing / silence 幕次。
    this.setRitualTime(this.ritualClock.elapsed);

    // #4 五阶段音频包络：与幕次**同源**（ritualPhaseAt），逐帧落到三条声链
    // （水声 / 翻斗链条 / 低频空间混响）。silence 幕三层归零（1751→1800 恰 49s）。
    altarAudio.applyPhaseEnvelope(phase, phaseProgress(this.ritualClock.elapsed));
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
    this.rig.cameraMode = 'outer_lanterns';
    this.activeLanternChapter = Math.max(0, Math.min(15, chapterIndex - 1));
    const currentGroupAngle = this.lanternsGroup.rotation.y;
    const pose = lanternCameraPose(chapterIndex, currentGroupAngle);

    this.rig.targetPos.set(pose.camX, pose.camY, pose.camZ);
    this.rig.targetLookAt.set(pose.targetX, pose.targetY, pose.targetZ);
    this.rig.transitioning = true;
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
    if (!this.lanternChoreographyActive || this.rig.cameraMode !== 'outer_lanterns') return;
    const baseAngle = (this.activeLanternChapter / 16) * Math.PI * 2;
    const angle = baseAngle + this.lanternsGroup.rotation.y;
    const panelRadius = 23.5;
    const cameraRadius = 30.5;
    this.rig.targetPos.set(Math.sin(angle) * cameraRadius, 3.1 + this.lanternsGroup.position.y, Math.cos(angle) * cameraRadius);
    this.rig.targetLookAt.set(Math.sin(angle) * panelRadius, 2.6 + this.lanternsGroup.position.y, Math.cos(angle) * panelRadius);
    this.rig.transitioning = true;
  }

  public focusInteriorPoem(seasonId: string) {
    this.rig.cameraMode = 'interior';
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

    this.rig.targetPos.copy(camPos);
    this.rig.targetLookAt.copy(p);
    this.rig.transitioning = true;
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
    this.rig.role = role;
    this.applyRole();
  }

  public getRole(): AltarRole {
    return this.rig.role;
  }

  /**
   * 按当前身份落能力表。
   *
   * 原来是 `isGuest` 二值，现在改成查 ROLE_CAPABILITIES：
   * 权限判定的唯一真源在 types/altar.ts 那张表里，这里只负责落到
   * controls / 相机边界 / 自动巡礼上。
   */
  private applyRole() {
    this.rig.setRole(this.rig.role);
    if (this.rig.role !== 'guest') this.isAutoPatrol = false;
  }

  public getCapabilities(): AltarCapabilities {
    return this.rig.caps;
  }

  public setCameraMode(mode: CameraMode) {
    this.rig.cameraMode = mode;
    this.rig.transitioning = true;

    const pose = CAMERA_MODE_POSES[mode as string];
    if (pose) {
      this.rig.targetPos.set(...pose.pos);
      this.rig.targetLookAt.set(...pose.lookAt);
    } else if (mode === 'relic') {
      // 玉玺机位：数值的唯一真源在玉玺 rig（sealSpec.SEAL_CAMERA_POSES），
      // 这里不复制一份常量，避免两边漂移。rig 未挂载时退回直算。
      const pose = this.relicController?.getCameraPose();
      if (pose) {
        this.rig.targetPos.copy(pose.position);
        this.rig.targetLookAt.copy(pose.target);
      } else {
        this.rig.targetPos.set(6.2, SEAL_HOVER_Y + 3.4, 8.6);
        this.rig.targetLookAt.set(0, SEAL_HOVER_Y, 0);
      }
    }
  }

  /** 将自由观察席复位到场景外部的安全总览位。 */
  public resetCamera(): void {
    const position = new THREE.Vector3(48, 40, 58);
    const target = new THREE.Vector3(0, 6, 0);
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.rig.targetPos.copy(position);
    this.rig.targetLookAt.copy(target);
    this.rig.lastSafe.copy(position);
    this.rig.cameraMode = 'orbit';
    this.rig.transitioning = false;
    this.rig.pressedKeys.clear();
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
    this.rig.orthoTopdownCamera = cam;
    return cam;
  }

  /** #5 · 关闭正交取证相机，主循环回到透视相机。 */
  public clearOrthoTopdown(): void {
    this.rig.orthoTopdownCamera = null;
  }

  /** 鼠标/触摸一次只唤起一条游客既定路线，播放完停在当前位置。 */
  private activateGuestRoutine(): void {
    // 固定黄金机位（拉格朗日点）：飞过去即停死，不连续钻洞、不后台巡游。
    const routine = GUEST_ROUTINES[this.rig.guestIndex];
    this.rig.guestIndex = (this.rig.guestIndex + 1) % GUEST_ROUTINES.length;
    this.rig.guestTimer = 0;
    this.rig.guestPlaying = false;
    this.rig.rabbitActive = false;
    this.setCameraMode(routine);
  }

  /**
   * 访客的缩放路线：40 口入、28 口出。相机沿洞心移动而非 teleport，
   * 所以洞壁的诗句有阅读时间，也不会发生“镜头穿 Cube”的假象。
   */


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

    // 0.15 朗诵门帘轨道：目标机位始终跟随当前扇面的世界角度。
    this.syncLanternCameraRail();

    // 1. 相机子系统（过渡插值 / 安全边界 / 游客机位 / WASD / controls.update）统一由 CameraRig 推进。
    this.rig.update(dt);

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
    // 6/6b. 双龙粒子沿路径逐席 animate（水龙下潜 / 音龙上升），见 DualDragonRig。
    this.dragon.animateParticles(elapsedTime, this.dualDragonLitSeats());

    // 7. Starships floating
    this.starship.update(elapsedTime);

    // 8. Flowers breathing
    this.lotus.update(elapsedTime, this.activeSeatId);

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
    this.relicController?.update(dt, elapsedTime);

    // #5：取证正交相机存在时以它渲一帧（俯视 7×7），否则走主循环透视相机。
    // #7：无画模式 / 上下文已丢失 ⇒ **不画**。只跳过这一次 draw call，
    //     上面的时间轴推进、字幕刷新、音频包络**一字未动**（#4 不变量）。
    if (this.renderer && !this.contextLost) {
      this.renderer.render(this.scene, this.rig.orthoTopdownCamera ?? this.camera);
    }
  };

  // ── 传国玉玺（T03 接线，只此一段，不碰祭坛其余部分）────────────────

  /**
   * 挂载玉玺：悬浮于坛心正上方 PYRAMID_TOP + 2.2（= SEAL_HOVER_Y = 12.7）处。
   * 当前是 30 分钟自动播放、默认 guest，所以先保证它**自动可见、自动展示**：
   * 缓慢自转 + 呼吸浮动 + 自带柔光。交互留给导演/认证路由去开。
   */
  public mountRelic(): void {
    if (!this.relicController) {
      this.relicController = new RelicController({
        scene: this.scene,
        camera: this.camera,
        controlsTarget: this.controls.target
      });
      this.relicController.onRelicSelect = (id) => this.onRelicSelect?.(id);
    }
    this.relicController.mount();
    this.relic = this.relicController.relic;
    this.relicDecal = this.relicController.relicDecal;
  }

  /** 玉玺形态：normal（合） / exploded（拆解） / stamping（拓印） */
  public setSealMode(mode: SealMode): void {
    this.relicController?.setMode(mode);
  }

  /** 断代层过滤：秦 → 汉新 → 魏晋十六国 → 辽金 */
  public setSealEra(era: SealEra): void {
    this.relicController?.setEra(era);
  }

  /** 推近到悬浮玺台（导演/认证路由或点选玉玺时用） */
  public focusRelic(): void {
    this.relicController?.focus();
  }

  /**
   * 玉玺选中：**只高亮 + 推近，不改形态**。
   * 形态变更（拆解/拓印/断代）一律走 UI，见 SealPanel ——
   * 圣物形态不能被一次误触改掉，这是硬规矩。
   */
  public selectRelic(): void {
    this.relicController?.handlePick();
  }

  public clearRelicSelection(): void {
    this.relicController?.setSelected(false);
  }

  /** 导演手动拖拆解进度（0 合 → 1 全拆），会覆盖形态自动过渡 */
  public setSealExploded(progress: number): void {
    this.relicController?.setExplodedProgress(progress);
  }

  /** 拾取回调登记（骨架：不改动 role/guest 判定） */
  public setOnRelicSelect(callback?: (relicId: string) => void): void {
    this.onRelicSelect = callback;
    if (this.relicController) {
      this.relicController.onRelicSelect = (id) => this.onRelicSelect?.(id);
    }
  }

  /** 玉玺运行时状态（无席位语义，可安全上报） */
  public getRelicState(): ImperialSealState | null {
    return this.relicController?.getState() ?? null;
  }

  private disposeRelic(): void {
    this.relicController?.dispose();
    this.relic = null;
    this.relicDecal = null;
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
    this.lotus.clear();
    this.starship.clear();
    this.lanternPanels.clear();
    this.interiorStelae.clear();
    // RFC-007 双体水梯：几何随整棵场景图在第 6 步回收，这里只断开引用
    // RFC-008 走马灯：引擎是纯数学状态、无场景资源（几何随场景图第 6 步回收），
    // 这里只把 RFC-007→RFC-008 的地脉冲击量归零。
    this.waterLiftSeismic = 0;
    // #2：逐席光迹的几何随整棵场景图在第 6 步回收，这里只断开引用。
    this.seatTrails = [];
    this.seatTrailsGroup = null;
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
    this.ritualClock.running = false;
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
