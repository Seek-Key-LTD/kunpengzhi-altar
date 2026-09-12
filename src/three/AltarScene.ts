import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SpiralEvent, CameraMode } from '../types/altar';
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
  
  // Interactive Objects & Meshes
  private waterSpiralPath: THREE.Vector3[] = [];
  private waterParticles: THREE.Points | null = null;
  private fountainParticles: THREE.Points | null = null;
  private seatPads: Map<number, THREE.Mesh> = new Map();
  private seatLotusMeshes: Map<number, THREE.Group> = new Map();
  private starshipMeshes: Map<number, THREE.Group> = new Map();
  private lanternPanels: Map<number, THREE.Mesh> = new Map();
  private interiorStelae: Map<string, THREE.Mesh> = new Map();

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // State
  private events: SpiralEvent[] = [];
  private activeSeatId: number | null = 1;
  private cameraMode: CameraMode = 'orbit';
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
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 220;
    this.controls.target.set(0, 6, 0);

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

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize);
    this.container.addEventListener('pointerdown', this.onPointerDown);

    // 8. Start loop
    this.animate();

    // 9. 物理引擎（异步）—— 起来之后由它接管水的运动
    void this.initRapierPhysics();

    // 10. 数表与物理读数（贴在容器上，不走 React）
    this.buildOverlayReadouts();
  }

  /**
   * 把这座坛子用到的几个数直接标在界面上。
   *
   *   140 = 1²+2²+…+7²          实心七级方锥的总格数
   *    49 = 7² = 1+3+5+…+13      朝天暴露的格数 = 49 席
   *    91 = 1²+…+6² = 140−49     内部（阴）的格数 = 364 ÷ 4
   *    49 = 4×12+1               49 个音：四组键子 + 一个（中央 C 往下数）
   *   364 = 4×91
   */
  private buildOverlayReadouts() {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;left:16px;top:170px;z-index:50;pointer-events:none;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;' +
      'line-height:1.65;color:#94a3b8;background:rgba(2,6,23,.85);' +
      'border:1px solid rgba(51,65,85,.8);border-radius:10px;padding:10px 12px;' +
      'backdrop-filter:blur(6px);max-width:260px;';

    const rows = [
      ['140', '= 1²+2²+…+7²', '实心七级方锥的总格数'],
      ['49', '= 7² = 1+3+5+7+9+11+13', '朝天暴露的格数 = 49 席'],
      ['91', '= 1²+…+6² = 140 − 49', '内部（阴）的格数'],
      ['364', '= 4 × 91', ''],
      ['49', '= 4 组键子 × 12 + 1', '中央 C 往下数，四组零一个半音']
    ];

    rows.forEach(([num, expr, note]) => {
      const line = document.createElement('div');
      line.innerHTML =
        `<span style="color:#fbbf24;font-weight:700">${num}</span>` +
        `<span style="color:#64748b"> ${expr}</span>` +
        (note ? `<div style="color:#475569;padding-left:10px">${note}</div>` : '');
      wrap.appendChild(line);
    });

    const prog = document.createElement('div');
    prog.style.cssText =
      'margin-top:8px;padding-top:8px;border-top:1px solid rgba(51,65,85,.8);' +
      'color:#7dd3fc;font-weight:600;';
    prog.textContent = 'Rapier 物理验证：启动中…';
    wrap.appendChild(prog);

    // 挂在 document.body 上，避免被 Canvas 容器的 overflow / stacking 遮住
    document.body.appendChild(wrap);
    this.numbersPanelEl = wrap;
    this.waterProgressEl = prog;
  }

  private initLighting() {
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffecd2, 2.6);
    sunLight.position.set(35, 55, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
    rimLight.position.set(-35, 12, -35);
    this.scene.add(rimLight);

    const apexLight = new THREE.PointLight(0xfbbf24, 3.2, 70, 1.2);
    apexLight.position.set(0, PYRAMID_TOP + 4, 0);
    this.scene.add(apexLight);

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
    this.outerShellGroup.add(waterLine);

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
    // 用户一按鼠标，立刻放弃自动机位过渡，别跟人抢镜头
    this.isCameraTransitioning = false;

    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // 1. Check Outer Tea Lanterns
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

    // 2. Check Interior Stelae
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

    // 3. Check Seat Pads
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
    }
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

    // 1. Smooth Camera Transition
    if (this.isCameraTransitioning) {
      this.camera.position.lerp(this.targetCameraPos, 0.05);
      this.controls.target.lerp(this.targetControlsTarget, 0.05);
      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.1) {
        this.isCameraTransitioning = false;
      }
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

    // 6. Water particles flowing along strictly descending spiral
    if (this.waterParticles && this.waterSpiralPath.length > 0) {
      const pAttr = this.waterParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pAttr.count; i++) {
        const step = (elapsedTime * 6 + i * 0.25) % this.waterSpiralPath.length;
        const idxA = Math.floor(step);
        const idxB = (idxA + 1) % this.waterSpiralPath.length;
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

    // 9. 水利机关：翻斗蓄水—越阈翻转—配重水梯提水—复位
    this.updateWaterworks(elapsedTime);

    // 10. 物理引擎：水滴由 Rapier 自己算，我们不插手
    this.updatePhysics(dt);

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

    this.renderer.render(this.scene, this.camera);
  };

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    if (this.numbersPanelEl?.parentElement) {
      this.numbersPanelEl.parentElement.removeChild(this.numbersPanelEl);
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
