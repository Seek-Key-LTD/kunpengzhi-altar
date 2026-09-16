import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  SpiralEvent,
  CameraMode,
  AltarRole,
  AltarCapabilities,
  GUEST_ROUTINES,
  GUEST_ROUTINE_SECONDS,
  GUEST_ORBIT,
  ROLE_CAPABILITIES,
  CAMERA_SAFETY_BY_ROLE,
  CAMERA_DISTANCE_BY_ROLE
} from '../types/altar';
import { TEA_POEM_16_CHAPTERS } from '../data/tea_poem_16';
import { SEASON1_POEMS } from '../data/season1_poems';
import {
  BRICK,
  CELL,
  LAYERS,
  PYRAMID_HALF,
  PYRAMID_TOP,
  PLINTH_HALF,
  PLINTH_THICKNESS,
  RIVER_WIDTH,
  RIVER_HALF_LENGTH,
  SPIRAL_SLOPE
} from '../data/altarGeometry';
import RAPIER from '@dimforge/rapier3d-compat';
import { ImperialSealObject } from './relic/ImperialSealObject';
import { SealStampDecal } from './relic/SealStampDecal';
import { SealCameraRig } from './relic/SealCameraRig';
import type { ImperialSealState, SealEra, SealMode } from '../types/relic';
import { SEAL_HOVER_Y, SEAL_STAMP } from '../data/sealSpec';
import { altarAudio } from '../audio/altarAudio';

export class AltarScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  
  // Scene Groups
  private outerShellGroup: THREE.Group;
  private hollowInteriorGroup: THREE.Group;
  private lanternsGroup: THREE.Group;
  private primeLinesGroup: THREE.Group;
  private fountainGroup: THREE.Group;
  private waterworksGroup: THREE.Group;
  private physicsDropletsGroup: THREE.Group;

  // 水利机关：主翻斗 + 配重水梯
  private bucketPivot: THREE.Group | null = null;
  private bucketWater: THREE.Mesh | null = null;
  private ladderBuckets: THREE.Group[] = [];
  private ladderDrops: THREE.Mesh[] = [];
  private riverSurface: THREE.Mesh | null = null;

  // 物理引擎（Rapier3D）—— 水到底流不流得通，由引擎说了算，不由我们算角度
  private physicsWorld: RAPIER.World | null = null;
  private physicsReady = false;
  private physicsAccumulator = 0;
  private droplets: Array<{ body: RAPIER.RigidBody; mesh: THREE.Mesh }> = [];
  private dropletCursor = 0;
  private spawnTimer = 0;
  private maxSeatReached = 1;
  private waterProgressEl: HTMLDivElement | null = null;
  private numbersPanelEl: HTMLDivElement | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private apexLight: THREE.PointLight | null = null;
  private wujiLight: THREE.SpotLight | null = null;
  private ritualMode = false;
  private ritualLitSeats = 0;
  
  // Interactive Objects & Meshes
  private waterSpiralPath: THREE.Vector3[] = [];
  private waterParticles: THREE.Points | null = null;
  private waterLine: THREE.Line | null = null;
  /** 阴龙：不占席、不承载文字，只把 49 个半音向上卷成可见的气流。 */
  private soundSpiralPath: THREE.Vector3[] = [];
  private soundLine: THREE.Line | null = null;
  private soundParticles: THREE.Points | null = null;
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

  /** 已销毁标记：拦住异步初始化在 destroy() 之后继续造资源 */
  private destroyed = false;

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
  /** 游客 routine 播放状态 */
  private guestRoutineIndex = 0;
  private guestRoutineTimer = 0;
  /** 游客连续环绕的累加相位（弧度）—— 公共页唯一的镜头运动 */
  private guestOrbitAngle = Math.PI / 4;
  /** 上一帧的合法相机位（安全边界第 4 条：异常时拉回） */
  private lastSafeCameraPos = new THREE.Vector3(48, 40, 58);
  private onSeatSelect?: (seatId: number) => void;
  private onLanternSelect?: (chapterIndex: number) => void;
  private onInteriorPoemSelect?: (seasonId: string) => void;
  private clock = new THREE.Clock();
  private lastElapsed = 0;

  // Speed & Rotation
  private lanternRotationSpeed = 0; // 默认不转：诗词灯是"挂着"的，不是在那儿乱转
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
    onInteriorPoemSelect?: (seasonId: string) => void
  ) {
    this.container = container;
    this.events = events;
    this.onSeatSelect = onSeatSelect;
    this.onLanternSelect = onLanternSelect;
    this.onInteriorPoemSelect = onInteriorPoemSelect;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.012);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(48, 40, 58);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);

    // 4. Controls
    // ⚠️ minDistance 曾降到 0.5 以便"贴着看"，但那正是穿模的直接来源。
    //    安全边界见 docs/身份与相机权限规范.md §3.2。
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
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
    this.physicsDropletsGroup = new THREE.Group();

    this.scene.add(this.outerShellGroup);
    this.scene.add(this.hollowInteriorGroup);
    this.scene.add(this.lanternsGroup);
    this.scene.add(this.primeLinesGroup);
    this.scene.add(this.fountainGroup);
    this.scene.add(this.waterworksGroup);
    this.scene.add(this.physicsDropletsGroup);

    // 6. Build All Complex Layers
    this.initLighting();
    this.buildPlinthAndRiver();
    this.buildCubePyramidAndSeats();
    this.buildInnerStelaeRing();
    this.buildOuter16TeaLanterns();
    this.buildTippingBucket();
    this.buildWaterLadder();
    this.buildWujiFountain();
    this.buildStarships();
    this.buildSurroundingAtmosphere();

    // 6b. 传国玉玺：悬浮玺台（器物，与 49 席完全隔离）
    this.mountRelic();

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize);
    this.container.addEventListener('pointerdown', this.onPointerDown);

    // 8. Start loop
    this.animate();

    // 9. 物理引擎（异步）—— 起来之后由它接管水的运动
    void this.initRapierPhysics();

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

    const wujiLight = new THREE.SpotLight(0xbfe8ff, 0, 45, 0.12, 0.65, 1.4);
    wujiLight.position.set(0, 42, 0);
    wujiLight.target.position.set(0, PYRAMID_TOP, 0);
    this.scene.add(wujiLight, wujiLight.target);
    this.wujiLight = wujiLight;

    // 阴锥内腔照明（空腔是封闭的，光必须留在里面）
    const yinLightA = new THREE.PointLight(0x38bdf8, 3.0, 26, 1.2);
    yinLightA.position.set(0, 2.4, 0);
    this.hollowInteriorGroup.add(yinLightA);

    const yinLightB = new THREE.PointLight(0xf59e0b, 2.2, 22, 1.2);
    yinLightB.position.set(0, 8.0, 0);
    this.hollowInteriorGroup.add(yinLightB);
  }

  /**
   * 台基 + 河。
   * 台基东西两半，中间留出河道；河从南（+Z）到北（−Z）贯通，南北各伸出台基 3 单位。
   * 河是水的来源与归宿：南端取水（主翻斗），北端回水（第七级水槽的出水汇入）。
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

    const riverHalf = RIVER_WIDTH / 2;
    const bankWidth = PLINTH_HALF - riverHalf;
    const plinthDepth = PLINTH_HALF * 2;

    // 东西两半台基（中间即河道）
    [-1, 1].forEach((side) => {
      const bank = new THREE.Mesh(
        new THREE.BoxGeometry(bankWidth, PLINTH_THICKNESS, plinthDepth),
        stoneMat
      );
      bank.position.set(side * (riverHalf + bankWidth / 2), -PLINTH_THICKNESS / 2, 0);
      bank.receiveShadow = true;
      bank.castShadow = true;
      this.outerShellGroup.add(bank);

      // 河岸压边（铜）
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(BRICK * 0.25, PLINTH_THICKNESS * 0.2, plinthDepth),
        bronzeMat
      );
      curb.position.set(side * riverHalf, 0.05, 0);
      this.outerShellGroup.add(curb);
    });

    // 河底
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(RIVER_WIDTH, 0.3, RIVER_HALF_LENGTH * 2),
      stoneMat
    );
    bed.position.set(0, -PLINTH_THICKNESS + 0.15, 0);
    bed.receiveShadow = true;
    this.outerShellGroup.add(bed);

    // 水面（南→北连续水体）
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(RIVER_WIDTH * 0.94, 0.08, RIVER_HALF_LENGTH * 2),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.75,
        roughness: 0.05,
        metalness: 0.9,
        transparent: true,
        opacity: 0.9
      })
    );
    surface.position.set(0, -PLINTH_THICKNESS + 0.55, 0);
    this.riverSurface = surface;
    this.outerShellGroup.add(surface);

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
      color: 0x131c2e,
      roughness: 0.62,
      metalness: 0.28
    });

    const grooveMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.7,
      roughness: 0.08,
      metalness: 0.9,
      transparent: true,
      opacity: 0.92
    });

    // ---- 1. 49 根砖柱：每席一根，从地面砌到该席的台面高程 ----
    const bricks: Array<{ x: number; y: number; z: number }> = [];

    this.events.forEach((ev) => {
      const levels = Math.max(1, Math.round(ev.elevation / BRICK));
      for (let i = 0; i < levels; i++) {
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

    // ---- 2. 每席柱顶的下垂水槽：顺螺旋方向朝下一席倾斜 ----
    // 台面是一条连续下降的螺旋坡（相邻两席落差完全相等），所以水不会撞上上坡。
    // 坡度用 SPIRAL_SLOPE —— 视觉台面和物理碰撞体用的是同一个值。
    const TILT = SPIRAL_SLOPE;
    const plateW = CELL;

    this.events.forEach((ev, idx) => {
      const topY = ev.elevation;
      const cx = ev.grid_x * CELL;
      const cz = ev.grid_z * CELL;

      const next = this.events[idx + 1];
      const dx = next ? Math.sign(next.grid_x - ev.grid_x) : 0;
      const dz = next ? Math.sign(next.grid_z - ev.grid_z) : 0;

      const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, 0.1, plateW), grooveMat);
      plate.position.set(cx + dx * BRICK * 0.1, topY - 0.03, cz + dz * BRICK * 0.1);
      plate.rotation.z = -dx * TILT;
      plate.rotation.x = dz * TILT;
      this.outerShellGroup.add(plate);
    });

    // ---- 3. 49 席：托座 / 质数环 / 莲花 ----
    this.events.forEach((ev) => {
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
    const primes = this.events.filter(e => e.is_prime);
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
   * 十二座青玉经卷壁碑 —— 贴在最外圈砖柱的**朝外面**上。
   *
   * 最外圈（max(|i|,|j|) = 3）共 24 根柱，隔一根取一座，正好 12 座，绕坛一圈。
   * 每座碑的高度取它那根柱子的台面高程，碑面朝外。
   * （结构改成 49 根实心砖柱之后已经没有内腔了，碑改挂外侧；若以后恢复空腔再搬回去。）
   */
  private buildInnerStelaeRing() {
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

  private buildOuter16TeaLanterns() {
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
    canvas.width = 384;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
    ctx.roundRect(10, 10, 364, 492, 16);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 30px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${ch.chapterIndex} 面 · ${ch.title.split(' · ')[1]}`, 192, 60);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Noto Serif SC", serif';
    ctx.fillText(ch.historicalTheme, 192, 95);

    ctx.fillStyle = '#fef08a';
    ctx.font = '18px "Noto Serif SC", serif';
    ctx.textAlign = 'left';
    ctx.fillText('【左栏·起承】', 30, 140);
    ctx.fillStyle = '#f1f5f9';
    ch.leftColumn.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, 30, 175 + i * 32);
    });

    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('【右栏·转合】', 30, 295);
    ctx.fillStyle = '#f1f5f9';
    ch.rightColumn.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, 30, 330 + i * 32);
    });

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'italic 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('【点击展开 16 句全赋】', 192, 470);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.6, 4.4, 1);
    return sprite;
  }

  private buildWujiFountain() {
    // #00：只接受末段的一束冷顶光。它没有 seatId、没有音高，也不进入拾取列表。
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
    absorber.userData = { ritual_anchor: 'wuji', claimable: false, tokenizable: false };
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

    // Continuous Flowing Spiral Water Stream
    this.waterSpiralPath = this.events.map((ev) => this.getSeatWorldPos(ev));
    const curve = new THREE.CatmullRomCurve3(this.waterSpiralPath, false, 'catmullrom', 0.1);
    const points = curve.getPoints(360);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.85
    });
    const waterLine = new THREE.Line(lineGeo, lineMat);
    waterLine.geometry.setDrawRange(0, 0);
    this.outerShellGroup.add(waterLine);
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
      colors[i * 3] = 0.2;
      colors[i * 3 + 1] = 0.85;
      colors[i * 3 + 2] = 1.0;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.waterParticles = new THREE.Points(particleGeo, particleMat);
    this.outerShellGroup.add(this.waterParticles);

    // 阴龙不复制水路。它绕过 #00，由小半径起步、按对数展开，
    // 高度以 r² 抛物面抬升；第 n 点对应 C2.transpose(n)。
    const soundPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 49; i++) {
      const t = i / 48;
      const angle = -Math.PI / 2 + t * Math.PI * 6;
      const radius = 1.25 * Math.exp(t * 2.05);
      const y = PYRAMID_TOP + 0.45 + radius * radius * 0.11;
      soundPoints.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    }
    this.soundSpiralPath = soundPoints;
    const soundGeo = new THREE.BufferGeometry().setFromPoints(soundPoints);
    const soundMat = new THREE.LineBasicMaterial({
      color: 0xc4b5fd,
      transparent: true,
      opacity: 0.48,
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
      size: 0.16,
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
   * 主翻斗（立方体斗 · 偏心轴 · 越阈自翻）。
   *
   * 设计要点：
   *   · 斗身是立方体、开口朝上 —— 与全坛"只用立方砖"的规矩一致；
   *   · 轴穿在斗身中部偏南。斗里水位上升 → 重心上移越过轴心 → 自己翻，不需要外力；
   *   · 不需要物理引擎：按时间驱动 rotation.x 与水面 scale.y 即可。
   *
   * 五态循环：蓄水 → 越阈 → 翻转倒水 → 排空回落 → 复位。
   * 单斗只能"倒"不能"提"，所以提水交给北坡的配重水梯（见 buildWaterLadder）。
   */
  private buildTippingBucket() {
    const size = CELL;
    const wall = BRICK * 0.22;
    const pivotZ = RIVER_HALF_LENGTH - 4.5; // 南端取水口

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.25 });
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.28,
      metalness: 0.9,
      emissive: 0x92400e,
      emissiveIntensity: 0.35
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0369a1,
      emissiveIntensity: 0.9,
      roughness: 0.05,
      metalness: 0.8,
      transparent: true,
      opacity: 0.88
    });

    // 两根立方石墩 + 横轴
    [-1, 1].forEach((side) => {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(BRICK, BRICK * 2.2, BRICK), stoneMat);
      pier.position.set(side * (size / 2 + BRICK * 0.8), BRICK * 1.1, pivotZ);
      pier.castShadow = true;
      this.waterworksGroup.add(pier);
    });

    const axleY = BRICK * 2.2;
    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(BRICK * 0.12, BRICK * 0.12, size + BRICK * 2.4, 8),
      bronzeMat
    );
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, axleY, pivotZ);
    this.waterworksGroup.add(axle);

    // 斗（pivot group，绕 X 轴翻）
    const pivot = new THREE.Group();
    pivot.position.set(0, axleY, pivotZ);
    pivot.rotation.x = 0.1;
    this.bucketPivot = pivot;
    this.waterworksGroup.add(pivot);

    // 斗身：底 + 四壁（北壁矮一半，倒水时朝金字塔方向倾）
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(size, wall, size), bronzeMat);
    bottom.position.y = -size / 2 + wall / 2;
    pivot.add(bottom);

    const walls: Array<[number, number, number, number]> = [
      // [宽, 高, x, z]
      [size, size, 0, -size / 2 + wall / 2], // 北壁（矮）
      [size, size, 0, size / 2 - wall / 2], // 南壁
      [wall, size, -size / 2 + wall / 2, 0], // 西壁
      [wall, size, size / 2 - wall / 2, 0] // 东壁
    ];
    walls.forEach(([w, h, px, pz], i) => {
      const hh = i === 0 ? h * 0.45 : h;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, i < 2 ? wall : size), bronzeMat);
      m.position.set(px, -size / 2 + hh / 2, pz);
      pivot.add(m);
    });

    // 斗内水面：几何原点挪到底面，scale.y 即水位
    const waterGeo = new THREE.BoxGeometry(size - wall * 2, 1, size - wall * 2);
    waterGeo.translate(0, 0.5, 0);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, -size / 2 + wall, 0);
    water.scale.y = 0.01;
    pivot.add(water);
    this.bucketWater = water;
  }

  /**
   * 配重水梯：北坡 7 个立方小斗，每级一个，错时翻转。
   * 主翻斗倒下的水落到第 1 个小斗，它翻转把水递给第 2 个……逐级提到顶层分水口。
   */
  private buildWaterLadder() {
    const z = -(PYRAMID_HALF + 1.8);
    const size = BRICK * 0.8;

    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.3,
      metalness: 0.88,
      emissive: 0x92400e,
      emissiveIntensity: 0.3
    });
    const dropMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0369a1,
      emissiveIntensity: 1.0,
      roughness: 0.05,
      metalness: 0.8,
      transparent: true,
      opacity: 0.9
    });

    // 立柱
    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(BRICK * 0.3, PYRAMID_TOP, BRICK * 0.3),
      bronzeMat
    );
    mast.position.set(0, PYRAMID_TOP / 2, z);
    this.waterworksGroup.add(mast);

    for (let k = 1; k <= LAYERS; k++) {
      const y = (k / LAYERS) * PYRAMID_TOP - BRICK * 0.45;

      const bucket = new THREE.Group();
      bucket.position.set(BRICK * 0.9, y, z);
      bucket.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), bronzeMat));
      this.waterworksGroup.add(bucket);
      this.ladderBuckets.push(bucket);

      const drop = new THREE.Mesh(new THREE.BoxGeometry(BRICK * 0.4, BRICK * 0.4, BRICK * 0.4), dropMat);
      drop.position.set(BRICK * 0.9, y, z);
      this.waterworksGroup.add(drop);
      this.ladderDrops.push(drop);
    }
  }

  /**
   * 水利机关驱动：一个 12 秒的循环。
   *   0.0–6.0s  蓄水（水面 0 → 1，重心上移）
   *   6.0–7.2s  越阈翻转（−110°，ease-in，重力加速），同时倒水
   *   7.2–8.4s  排空保持
   *   8.4–12.0s 空斗回落复位
   * 水梯小斗按 0.35s 逐级延迟跟进，水被一级级递到顶层。
   */
  private updateWaterworks(elapsed: number) {
    const CYCLE = 12;
    const FILL_END = 6;
    const TIP_END = 7.2;
    const HOLD_END = 8.4;
    const t = elapsed % CYCLE;
    const restAngle = 0.1;
    const tipAngle = THREE.MathUtils.degToRad(-110);

    if (this.bucketPivot && this.bucketWater) {
      let angle = restAngle;
      let fill = 0;

      if (t < FILL_END) {
        fill = t / FILL_END;
      } else if (t < TIP_END) {
        const p = (t - FILL_END) / (TIP_END - FILL_END);
        angle = restAngle + (tipAngle - restAngle) * p * p; // ease-in
        fill = Math.max(0, 1 - p * 1.4);
      } else if (t < HOLD_END) {
        angle = tipAngle;
        fill = 0;
      } else {
        const p = (t - HOLD_END) / (CYCLE - HOLD_END);
        angle = tipAngle + (restAngle - tipAngle) * (1 - (1 - p) * (1 - p));
        fill = 0;
      }

      this.bucketPivot.rotation.x = angle;
      this.bucketWater.scale.y = Math.max(0.01, fill * (CELL - BRICK * 0.44));
    }

    // 水梯：逐级延迟 0.35s 跟进
    const ladderStart = TIP_END - 1.0;
    this.ladderBuckets.forEach((bucket, i) => {
      const p = THREE.MathUtils.clamp((t - ladderStart - i * 0.35) / 0.6, 0, 1);
      bucket.rotation.x = -Math.PI * 0.42 * Math.sin(Math.PI * p);

      const drop = this.ladderDrops[i];
      if (drop) {
        const yFrom = ((i + 1) / LAYERS) * PYRAMID_TOP - BRICK * 0.45;
        const yTo = ((Math.min(i + 2, LAYERS)) / LAYERS) * PYRAMID_TOP - BRICK * 0.45;
        drop.position.y = THREE.MathUtils.lerp(yFrom, yTo, p);
        drop.visible = p > 0 && p < 1;
      }
    });

    // 河面随循环微微起伏
    if (this.riverSurface) {
      this.riverSurface.position.y = -PLINTH_THICKNESS + 0.55 + Math.sin(elapsed * 1.2) * 0.04;
    }
  }

  /** 台面的位置与倾角 —— 视觉台面和物理碰撞体共用同一套数值 */
  private terraceTransform(ev: SpiralEvent) {
    const idx = ev.seat_id - 1;
    const next = this.events[idx + 1];
    const dx = next ? Math.sign(next.grid_x - ev.grid_x) : 0;
    const dz = next ? Math.sign(next.grid_z - ev.grid_z) : 0;

    return {
      cx: ev.grid_x * CELL + dx * BRICK * 0.1,
      cy: ev.elevation - 0.03,
      cz: ev.grid_z * CELL + dz * BRICK * 0.1,
      rx: dz * SPIRAL_SLOPE,
      rz: -dx * SPIRAL_SLOPE
    };
  }

  /**
   * 接 Rapier3D：水到底流不流得通，由物理引擎自己算，不由我们算角度。
   *
   * 给 49 席台面各建一块倾斜碰撞体（与视觉同一套位置/倾角），
   * 在塔顶天井持续投水滴刚体，让重力把它们一路推下去。
   */
  private async initRapierPhysics() {
    try {
      await RAPIER.init();

      // ⚠️ RAPIER.init() 是异步的：StrictMode 双挂载下，等它 resolve 时
      //    这一轮祭坛可能已经被 destroy() 拆掉了。此时再造 world，
      //    就造出一个再也没人 free() 的孤儿世界 —— 必须拦在这。
      if (this.destroyed) return;

      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      this.physicsWorld = world;

      // 1. 49 席台面碰撞体
      this.events.forEach((ev) => {
        const t = this.terraceTransform(ev);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx, 0, t.rz, 'XYZ'));
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(CELL / 2, 0.08, CELL / 2)
            .setTranslation(t.cx, t.cy, t.cz)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
            .setFriction(0.01)
            .setRestitution(0.02)
        );
      });

      // 2. 台基（回收渠所在平面）
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(PLINTH_HALF, 0.4, PLINTH_HALF)
          .setTranslation(0, -0.4, 0)
          .setFriction(0.04)
          .setRestitution(0.02)
      );

      // 3. 水滴刚体池
      const dropGeo = new THREE.SphereGeometry(0.22, 10, 10);
      const dropMat = new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0284c7,
        emissiveIntensity: 1.0,
        roughness: 0.05,
        metalness: 0.6,
        transparent: true,
        opacity: 0.92
      });

      for (let i = 0; i < 40; i++) {
        const mesh = new THREE.Mesh(dropGeo, dropMat);
        mesh.visible = false;
        this.physicsDropletsGroup.add(mesh);

        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, -100, 0)
            .setLinearDamping(0.02)
            .setAngularDamping(0.4)
        );
        world.createCollider(
          RAPIER.ColliderDesc.ball(0.22).setMass(0.3).setFriction(0.01).setRestitution(0.02),
          body
        );
        this.droplets.push({ body, mesh });
      }

      this.physicsReady = true;
    } catch (err) {
      console.warn('Rapier 物理初始化失败，退回手工动画：', err);
    }
  }

  /** 每帧推进物理世界，并把"水流到第几席"读出来 */
  private updatePhysics(dt: number) {
    if (!this.physicsReady || !this.physicsWorld) return;
    if (this.ritualMode && this.waterParticles?.visible !== true) return;

    const world = this.physicsWorld;
    const STEP = 1 / 60;

    this.physicsAccumulator += dt;
    let steps = 0;
    while (this.physicsAccumulator >= STEP && steps < 5) {
      world.step();
      this.physicsAccumulator -= STEP;
      steps++;
    }

    // 塔顶天井持续投水
    this.spawnTimer += dt;
    if (this.spawnTimer > 0.35) {
      this.spawnTimer = 0;
      const top = this.events[0];
      const d = this.droplets[this.dropletCursor];
      this.dropletCursor = (this.dropletCursor + 1) % this.droplets.length;
      d.body.setTranslation(
        { x: top.grid_x * CELL, y: top.elevation + 2.0, z: top.grid_z * CELL },
        true
      );
      d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      d.mesh.visible = true;
    }

    // 同步网格 + 统计最远流到第几席
    this.droplets.forEach(({ body, mesh }) => {
      const p = body.translation();
      mesh.position.set(p.x, p.y, p.z);
      if (p.y < -20) mesh.visible = false;

      let bestId = 0;
      let bestD = Number.POSITIVE_INFINITY;
      this.events.forEach((ev) => {
        const dx = p.x - ev.grid_x * CELL;
        const dz = p.z - ev.grid_z * CELL;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          bestId = ev.seat_id;
        }
      });

      if (bestId > 0 && bestD < (CELL * 0.7) ** 2 && bestId > this.maxSeatReached) {
        this.maxSeatReached = bestId;
      }
    });

    if (this.waterProgressEl) {
      const pct = Math.round((this.maxSeatReached / 49) * 100);
      this.waterProgressEl.textContent =
        `Rapier 物理验证：水流已到第 ${this.maxSeatReached} / 49 席（${pct}%）`;
      this.waterProgressEl.style.color = this.maxSeatReached >= 49 ? '#4ade80' : '#7dd3fc';
    }
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
    this.renderer.setSize(width, height);
  };

  private onPointerDown = (event: MouseEvent) => {
    // 能力门控（取代原来的 guest 二值门控）：
    // 游客一条能力都没有 ⟹ 首行 return，公共入口行为与原来逐字一致；
    // 认证/导演放行，下面四段再按各自的能力细分。
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
    phase: 'abyss' | 'naming' | 'lanterns' | 'extinguishing' | 'silence',
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
    this.scene.fog = new THREE.FogExp2(0x000000, isDark ? 0.07 : 0.024);

    if (this.ambientLight) this.ambientLight.intensity = isDark ? 0 : 0.32;
    if (this.sunLight) this.sunLight.intensity = isDark ? 0 : 0.72;
    if (this.rimLight) this.rimLight.intensity = isDark ? 0 : 0.42;
    if (this.apexLight) this.apexLight.intensity = isDark ? 0 : 0.38;
    if (this.wujiLight) this.wujiLight.intensity = phase === 'extinguishing' || phase === 'silence' ? 2.4 : 0;

    this.outerShellGroup.visible = phase !== 'abyss';
    this.hollowInteriorGroup.visible = phase !== 'abyss';
    this.waterworksGroup.visible = !isDark;
    this.physicsDropletsGroup.visible = !isDark;
    this.fountainGroup.visible = !isDark;
    this.primeLinesGroup.visible = false;
    this.starshipMeshes.forEach((ship) => { ship.visible = false; });
    this.lanternsGroup.visible = phase === 'lanterns' || phase === 'extinguishing';
    this.lanternRotationSpeed = phase === 'lanterns' ? 0.00055 : 0;
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
    if (this.wujiAbsorber) this.wujiAbsorber.visible = phase !== 'abyss';
    // 玉玺属于导演台的器物层；公共仪式中不能让它与 #00 争中心。
    if (this.relic) this.relic.object3D.visible = false;
    if (this.relicDecal) this.relicDecal.object3D.visible = false;

    this.seatLotusMeshes.forEach((flower, id) => {
      flower.visible = id <= this.ritualLitSeats && !isDark;
      flower.scale.setScalar(id === activeSeatId ? 1.12 : 0.7);
    });
  }

  public focusTeaLantern(chapterIndex: number) {
    this.cameraMode = 'outer_lanterns';
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

  public setLanternRotationSpeed(speed: number) {
    this.lanternRotationSpeed = speed;
  }

  public setSpeedMode(mode: 'pause' | 'ultra_slow' | 'slow') {
    if (mode === 'pause') {
      this.lanternRotationSpeed = 0.0;
    } else if (mode === 'ultra_slow') {
      this.lanternRotationSpeed = 0.0015;
    } else if (mode === 'slow') {
      this.lanternRotationSpeed = 0.005;
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
      // 游客机位 = 一段连续慢速环绕。起始相位取东南对角（与相机初值 (48,40,58)
      // 大致同向），并立即落到轨道上，避免首帧跳变。
      this.guestOrbitAngle = Math.PI / 4;
      this.applyGuestOrbit();
    } else {
      // 导演/认证自己掌机，游客 routine 不许抢镜头
      this.isAutoPatrol = false;
    }
  }

  public getCapabilities(): AltarCapabilities {
    return this.capabilities;
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    this.isCameraTransitioning = true;

    if (mode === 'yin') {
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

  /**
   * 把游客相机推到环绕轨道上（逐帧调用）。
   *
   * 直接写 camera.position + controls.target，并把 isCameraTransitioning 置 false ——
   * 保证永远是**连续**的慢速运动，绝不会 lerp 跳变到某个新目标。半径 57 远大于
   * 坛体半宽，相机永远在壳外翱翔，绝不入壳。
   */
  private applyGuestOrbit(): void {
    const a = this.guestOrbitAngle;
    this.camera.position.set(
      Math.sin(a) * GUEST_ORBIT.radius,
      GUEST_ORBIT.height,
      Math.cos(a) * GUEST_ORBIT.radius
    );
    this.controls.target.set(0, GUEST_ORBIT.lookAtY, 0);
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

    // 0. 游客机位 = 一段连续的慢速外部环绕（公共页唯一的镜头运动）。
    //    (a) 旧的 routine 循环（cinematic/yin/patrol 每 18s 硬切）已废止：
    //        这里仅保留「建立镜头」的计时器，并**收紧为仪式期间停用**
    //        （`&& !this.ritualMode`），避免残留倒计时进坛后突然再切一次机位。
    if (this.role === 'guest' && !this.ritualMode) {
      this.guestRoutineTimer += dt;
      if (this.guestRoutineTimer >= GUEST_ROUTINE_SECONDS) {
        this.guestRoutineTimer = 0;
        this.guestRoutineIndex = (this.guestRoutineIndex + 1) % GUEST_ROUTINES.length;
        this.setCameraMode(GUEST_ROUTINES[this.guestRoutineIndex]);
      }
    }

    //    (b) 连续环绕：逐帧平滑推进，绝不 jump、绝不入壳；进坛后（naming 等幕次）
    //        由它继续接管镜头。约 5 分钟转一圈。
    if (this.role === 'guest') {
      this.guestOrbitAngle += GUEST_ORBIT.angularSpeed * dt;
      this.applyGuestOrbit();
    }

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

    // 2. Slow continuous rotation of outer 16 Tea Lanterns
    if (this.lanternsGroup) {
      this.lanternsGroup.rotation.y += this.lanternRotationSpeed;
    }

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

    // 6. 阳龙：水只流到仪式已经唤醒的那一席，不预演未来。
    if (this.waterParticles && this.waterSpiralPath.length > 0) {
      const pAttr = this.waterParticles.geometry.attributes.position as THREE.BufferAttribute;
      const pathLength = this.ritualMode
        ? Math.max(1, this.ritualLitSeats)
        : this.waterSpiralPath.length;
      for (let i = 0; i < pAttr.count; i++) {
        const step = (elapsedTime * 2.2 + i * 0.18) % pathLength;
        const idxA = Math.floor(step);
        const idxB = Math.min(idxA + 1, pathLength - 1);
        const frac = step - idxA;
        const pA = this.waterSpiralPath[idxA];
        const pB = this.waterSpiralPath[idxB];

        pAttr.setXYZ(
          i,
          pA.x + (pB.x - pA.x) * frac + Math.sin(elapsedTime * 4 + i) * 0.04,
          pA.y + (pB.y - pA.y) * frac + 0.08,
          pA.z + (pB.z - pA.z) * frac + Math.cos(elapsedTime * 4 + i) * 0.04
        );
      }
      pAttr.needsUpdate = true;
    }

    // 阴龙：相同的 49 个计数，但用上升的对数螺线显形。
    if (this.soundParticles && this.soundSpiralPath.length > 0) {
      const pAttr = this.soundParticles.geometry.attributes.position as THREE.BufferAttribute;
      const pathLength = Math.max(1, this.ritualMode ? this.ritualLitSeats : this.soundSpiralPath.length);
      for (let i = 0; i < pAttr.count; i++) {
        const step = (elapsedTime * 1.1 + i * 0.12) % pathLength;
        const idxA = Math.floor(step);
        const idxB = Math.min(idxA + 1, pathLength - 1);
        const fraction = step - idxA;
        const a = this.soundSpiralPath[idxA];
        const b = this.soundSpiralPath[idxB];
        pAttr.setXYZ(i, a.x + (b.x - a.x) * fraction, a.y + (b.y - a.y) * fraction, a.z + (b.z - a.z) * fraction);
      }
      pAttr.needsUpdate = true;
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

    // 9. 水利机关：公共仪式的黑场与静默不允许后台水声继续说话。
    if (!this.ritualMode || this.waterParticles?.visible) {
      this.updateWaterworks(elapsedTime);
      this.updatePhysics(dt);
    }

    // 11. Auto patrol
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

    this.renderer.render(this.scene, this.camera);
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
    // 0. 立销毁标记 + 先撤玉玺子系统
    //    标记必须先立：异步的 Rapier 初始化 resolve 回来时看到它就自己退场，
    //    否则会造出一个再也没人 free() 的孤儿 world。
    //    玉玺的 geometry/material/texture 由第 6 步统一遍历回收。
    this.destroyed = true;
    this.disposeRelic();

    // 1. rAF
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // 2. 事件监听
    window.removeEventListener('resize', this.onWindowResize);
    this.container.removeEventListener('pointerdown', this.onPointerDown);

    // 3. 工程 HUD 的 DOM（数表/物理读数只属于验收，不属于公共仪式）
    [this.numbersPanelEl, this.waterProgressEl].forEach((el) => {
      if (el?.parentElement) el.parentElement.removeChild(el);
    });
    this.numbersPanelEl = null;
    this.waterProgressEl = null;

    // 4. Rapier：Wasm 侧内存不受 GC 管，必须显式 free()，否则每轮泄漏一个世界
    if (this.physicsWorld) {
      try {
        this.physicsWorld.free();
      } catch (err) {
        console.warn('Rapier world 释放失败（不影响其余资源回收）：', err);
      }
      this.physicsWorld = null;
    }
    // 置空 + 落闸双保险：updatePhysics() 开头就是
    // `if (!this.physicsReady || !this.physicsWorld) return;`，free 之后不会再 step。
    this.physicsReady = false;
    this.droplets = [];

    // 5. 控制器（内部也挂着 DOM 监听）
    this.controls.dispose();

    // 6. 场景全量回收：geometry / material / 全部贴图（28 张 CanvasTexture 在此）
    this.disposeSceneResources();

    // 7. 索引表与回调断开，别把整棵场景图挂在闭包上
    this.seatPads.clear();
    this.seatLotusMeshes.clear();
    this.starshipMeshes.clear();
    this.lanternPanels.clear();
    this.interiorStelae.clear();
    this.waterSpiralPath = [];
    this.ladderBuckets = [];
    this.ladderDrops = [];
    this.bucketPivot = null;
    this.bucketWater = null;
    this.riverSurface = null;
    this.waterParticles = null;
    this.fountainParticles = null;
    this.ambientLight = null;
    this.sunLight = null;
    this.rimLight = null;
    this.apexLight = null;
    this.wujiLight = null;
    this.onSeatSelect = undefined;
    this.onLanternSelect = undefined;
    this.onInteriorPoemSelect = undefined;

    // 8. 渲染器：dispose 之后必须 forceContextLoss()，
    //    否则 WebGL context 只是被标记为可丢弃，配额不会立刻回来。
    this.renderer.setRenderTarget(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
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
