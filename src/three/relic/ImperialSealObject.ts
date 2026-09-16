// 传国玉玺 · 主体（程序化占位实现 + GLB 接管接口）
//
// ── 为什么是程序化几何 ──────────────────────────────────────────────
// 美术的高精 imperial_seal.glb **尚未产出**。为了不把整条链路堵死，
// 这里先用 Three.js 基础几何（Extrude / Lathe / Tube / Box）拼一尊
// 「方圆四寸玉体 + 简化五龙钮 + 金镶玉缺角」的占位玉玺：
//   · 尺寸严格按 sealSpec（方四寸 = 3.0 = 一格，通高 2.7）
//   · 微雕细节一律走 Normal 贴图，不建几何（守住 150K tris 预算）
//   · loadSealFromGLB(url) 已留好：资产到位后一句调用即可整体接管，
//     占位几何自动退场，外部 API（setMode/setEra/setLod/update）一行不用改。
//
// ── 法统边界 ────────────────────────────────────────────────────────
// 玉玺是器物，不是席位：不占格、不发音、不可认领、不进座次表。
// 本文件不 import 任何 seat/ula/MIDI 相关模块，也不持有振荡器。

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type {
  ImperialSealState,
  SealEra,
  SealLod,
  SealMode,
  SealPartId
} from '../../types/relic';
import {
  SEAL_BODY_BEVEL,
  SEAL_BODY_HEIGHT,
  SEAL_BREATH_AMPLITUDE,
  SEAL_BREATH_PERIOD,
  SEAL_CUN,
  SEAL_DRACO_PATH,
  SEAL_ERA_LAYERS,
  SEAL_ERA_ORDER,
  SEAL_EXPLODE,
  SEAL_GLB_URL,
  SEAL_GOLD_CORNER_SIZE,
  SEAL_GOLD_MATERIAL,
  SEAL_HEIGHT,
  SEAL_HOVER_Y,
  SEAL_JADE_MATERIAL,
  SEAL_KNOB_HEIGHT,
  SEAL_LIGHT,
  SEAL_LOD_DISTANCE,
  SEAL_NORMAL_MAP_SIZE,
  SEAL_SIDE,
  SEAL_SOCKET_MATERIAL,
  SEAL_SPIN_RPM,
  SEAL_STAMP,
  SEAL_TRIANGLE_BUDGET,
  SEAL_TRANSMISSION_PRESET,
  SEAL_WEIJIN_SECOND_INSCRIPTION
} from '../../data/sealSpec';

/** 玉玺对外回调（供祭坛/导演台接线，全部可选） */
export interface ImperialSealOptions {
  /** 拓印触地瞬间触发（进度越过 contactAt 时触发一次） */
  onStamp?: () => void;
  /** 形态切换时触发 */
  onModeChange?: (mode: SealMode) => void;
  /** 是否开启高质档透射（默认关：多一遍帧缓冲，30 分钟长跑不划算） */
  transmission?: boolean;
  /** 是否自转（默认开） */
  autoSpin?: boolean;
  /** 初始 LOD 档位 */
  lod?: SealLod;
}

/** 一次性的可释放资源登记处：dispose 时统一回收，杜绝热更新泄漏 */
type Disposable = { dispose: () => void };

const OUT_DIR = new THREE.Vector3(1, 0, 1).normalize(); // 缺角所在的体对角线（外向）
const UP = new THREE.Vector3(0, 1, 0);

/** 玉玺局部坐标系：几何中心在原点，印面（底）在 −SEAL_HEIGHT/2 */
const BODY_CENTER_Y = -SEAL_HEIGHT / 2 + SEAL_BODY_HEIGHT / 2;
const BODY_TOP_Y = -SEAL_HEIGHT / 2 + SEAL_BODY_HEIGHT;
const KNOB_CENTER_Y = BODY_TOP_Y + SEAL_KNOB_HEIGHT / 2;
/** 缺角立方中心（玉体东南角被切掉的那块，金镶玉就补在这里） */
const CORNER_BASE = new THREE.Vector3(
  SEAL_SIDE / 2 - SEAL_GOLD_CORNER_SIZE / 2,
  BODY_CENTER_Y,
  SEAL_SIDE / 2 - SEAL_GOLD_CORNER_SIZE / 2
);

// ── 程序化贴图 ──────────────────────────────────────────────────────

/** 平滑插值权重 */
function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 确定性哈希（同一 seed 每次刷新结果一致，避免玉纹乱跳） */
function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/** 多倍频值噪声 —— 玉理（棉絮、萝卜丝纹）的低频骨架 */
function valueNoise(size: number, freq: number, seed: number): Float32Array {
  const grid = freq + 1;
  const lattice = new Float32Array(grid * grid);
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      lattice[gy * grid + gx] = hash2(gx % grid, gy % grid, seed);
    }
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * freq;
      const fy = (y / size) * freq;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smoothStep(fx - x0);
      const ty = smoothStep(fy - y0);
      const v00 = lattice[y0 * grid + x0];
      const v10 = lattice[y0 * grid + (x0 + 1) % grid];
      const v01 = lattice[(y0 + 1) % grid * grid + x0];
      const v11 = lattice[(y0 + 1) % grid * grid + (x0 + 1) % grid];
      const a = v00 + (v10 - v00) * tx;
      const b = v01 + (v11 - v01) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/**
 * 玉理 Normal 贴图。
 * 微雕与玉纹**全部走贴图不建几何** —— 这是把三角面压在 150K 预算内的关键。
 */
function createJadeNormalTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const octaves: Array<{ freq: number; amp: number }> = [
    { freq: 4, amp: 0.55 },
    { freq: 11, amp: 0.3 },
    { freq: 29, amp: 0.15 }
  ];

  const height = new Float32Array(size * size);
  octaves.forEach((o, i) => {
    const layer = valueNoise(size, o.freq, 17 + i * 7);
    for (let p = 0; p < height.length; p++) height[p] += layer[p] * o.amp;
  });

  const ctx = canvas.getContext('2d');
  const image = ctx ? ctx.createImageData(size, size) : null;
  if (ctx && image) {
    const strength = 2.4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const hL = height[y * size + ((x - 1 + size) % size)];
        const hR = height[y * size + ((x + 1) % size)];
        const hD = height[((y - 1 + size) % size) * size + x];
        const hU = height[((y + 1) % size) * size + x];
        const nx = (hL - hR) * strength;
        const ny = (hD - hU) * strength;
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz) || 1;
        const idx = (y * size + x) * 4;
        image.data[idx] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
        image.data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
        image.data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
        image.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/** 刻痕贴图：透明底 + 墨色字（阴刻读感），或朱砂底 + 白字（阳文） */
function createInscriptionTexture(
  text: string,
  options: { size: number; color: string; background: string | null; cols: number }
): THREE.CanvasTexture {
  const { size, color, background, cols } = options;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.clearRect(0, 0, size, size);
    }

    const chars = Array.from(text.replace(/[，,、\s]/g, ''));
    if (chars.length > 0) {
      const rows = Math.max(1, Math.ceil(chars.length / cols));
      const font = `"Songti SC", "STSong", "SimSun", "STKaiti", "KaiTi", serif`;
      ctx.font = `${Math.floor(size / (Math.max(cols, rows) + 0.6))}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;

      // 依传统自右向左、自上而下布字
      for (let i = 0; i < chars.length; i++) {
        const col = Math.floor(i / rows);
        const row = i % rows;
        const cx = size - (col + 0.5) * (size / cols);
        const cy = (row + 0.5) * (size / rows);
        ctx.fillText(chars[i], cx, cy);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/** 崩裂/水蚀的斑驳贴图（汉新补角痕、辽金沉砂共用一套发生器） */
function createMottleTexture(size: number, alpha: number, tint: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = tint;
    const blobs = 90;
    for (let i = 0; i < blobs; i++) {
      const x = hash2(i, 1, 3) * size;
      const y = hash2(i, 2, 5) * size;
      const r = (0.02 + hash2(i, 3, 7) * 0.09) * size;
      ctx.globalAlpha = alpha * (0.35 + hash2(i, 4, 11) * 0.65);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * 印台俯视轮廓：方四寸，四角微圆，**东南角被切掉一块缺口**。
 *
 * 缺口是给「金镶玉」留的：玉体本来就缺一角，金补上去；
 * 拆解时金角拔出，缺口就成了燕尾倒勾槽 —— 槽得是真空洞，才看得见。
 * 截面坐标 (x, y) 经 rotateX(−π/2) 后映射为世界 (x, −y)，
 * 所以 shape 的 (half, −half) 那一角就是世界的 (+x, +z) 角。
 */
function createJadeBodyShape(size: number, radius: number, notch: number): THREE.Shape {
  const half = size / 2;
  const r = Math.min(radius, half * 0.4);
  const n = Math.max(0.05, Math.min(notch, half));
  const shape = new THREE.Shape();
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - n, -half);
  shape.lineTo(half - n, -half + n); // 缺口内折：这是槽的两条内壁
  shape.lineTo(half, -half + n);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);
  shape.closePath();
  return shape;
}

/** 燕尾榫截面：一头宽一头窄的倒勾梯形 */
function createDovetailShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.62, -height / 2);
  shape.lineTo(width * 0.62, -height / 2);
  shape.lineTo(width, height / 2);
  shape.lineTo(-width, height / 2);
  shape.closePath();
  return shape;
}

// ── 主体 ────────────────────────────────────────────────────────────

export class ImperialSealObject {
  /** 对外只暴露这一个 Object3D，由祭坛决定挂到哪 */
  private readonly root = new THREE.Group();
  /** 程序化占位几何（GLB 接管后整体退场） */
  private readonly placeholder = new THREE.Group();
  /** 高精资产容器（loadSealFromGLB 成功后填充） */
  private glbGroup: THREE.Group | null = null;

  private readonly jadeMaterial: THREE.MeshPhysicalMaterial;
  private readonly goldMaterial: THREE.MeshPhysicalMaterial;
  private readonly socketMaterial: THREE.MeshPhysicalMaterial;
  private readonly jadeNormalMap: THREE.CanvasTexture;

  /** 可拆解部件 */
  private bodyMesh: THREE.Mesh | null = null;
  private knobGroup: THREE.Group | null = null;
  private goldCornerGroup: THREE.Group | null = null;
  private dovetailTenon: THREE.Mesh | null = null;
  private readonly dragongroup = new THREE.Group();
  private readonly eraLayers = new Map<SealEra, THREE.Group>();
  private sealLight: THREE.PointLight | null = null;

  private readonly disposables: Disposable[] = [];
  private readonly pickTargets: THREE.Object3D[] = [];
  private readonly parts = new Map<SealPartId, THREE.Object3D>();

  private mode: SealMode = 'normal';
  private era: SealEra = 'qin';
  private lod: SealLod = 'high';
  private explodedProgress = 0;
  private stampProgress = 0;
  private stampFired = false;
  private stampCount = 0;
  private autoSpin = true;
  private selected = false;
  /** 手动拆解进度覆盖值（null = 交给 mode 自动过渡） */
  private explodedOverride: number | null = null;
  private transmissionEnabled: boolean = SEAL_TRANSMISSION_PRESET.enabled;
  private glbLoaded = false;
  private dracoLoader: DRACOLoader | null = null;

  private readonly onStamp?: () => void;
  private readonly onModeChange?: (mode: SealMode) => void;

  constructor(options: ImperialSealOptions = {}) {
    this.onStamp = options.onStamp;
    this.onModeChange = options.onModeChange;
    this.autoSpin = options.autoSpin ?? true;
    this.lod = options.lod ?? 'high';
    this.transmissionEnabled = options.transmission ?? SEAL_TRANSMISSION_PRESET.enabled;

    // 玉体：MeshStandardMaterial 没有次表面散射，玉的油脂光泽必须靠
    // MeshPhysicalMaterial 的 sheen 起步；transmission 留作高质档。
    this.jadeNormalMap = this.track(createJadeNormalTexture(SEAL_NORMAL_MAP_SIZE));
    this.jadeMaterial = this.track(
      new THREE.MeshPhysicalMaterial({
        ...SEAL_JADE_MATERIAL,
        normalMap: this.jadeNormalMap,
        transmission: this.transmissionEnabled ? SEAL_TRANSMISSION_PRESET.transmission : 0,
        thickness: SEAL_TRANSMISSION_PRESET.thickness
      })
    );
    this.jadeMaterial.normalScale = new THREE.Vector2(0.35, 0.35);

    this.goldMaterial = this.track(new THREE.MeshPhysicalMaterial({ ...SEAL_GOLD_MATERIAL }));
    this.socketMaterial = this.track(new THREE.MeshPhysicalMaterial({ ...SEAL_SOCKET_MATERIAL }));

    this.root.name = 'imperial_seal';
    this.root.userData.relic_id = 'imperial_seal';
    this.root.userData.is_relic = true;
    this.root.position.set(0, SEAL_HOVER_Y, 0);
    this.root.add(this.placeholder);

    this.buildJadeBody();
    this.buildDragonKnob();
    this.buildGoldCorner();
    this.buildEraLayers();
    this.buildSealLight();

    this.applyEra(this.era);
    this.applyLod(this.lod);
    this.applyExploded(0);
  }

  /** 登记一次性资源，dispose 时统一回收 */
  private track<T extends Disposable>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  /** 唯一对外挂点 */
  public get object3D(): THREE.Group {
    return this.root;
  }

  // ── 构建：印台 ────────────────────────────────────────────────────

  private buildJadeBody() {
    // ⚠️ ExtrudeGeometry 的 bevel 是**向外**长出去的（实测：bevelSize 0.06 会让
    //    3.0 的截面长成 3.12）。要守住「方四寸 = 3.0 = 一格」，必须先把截面和
    //    挤出深度各让掉两倍的 bevel，长回来正好是规格尺寸。
    const indent = SEAL_BODY_BEVEL;
    const shape = createJadeBodyShape(
      SEAL_SIDE - indent * 2,
      SEAL_BODY_BEVEL * 4,
      SEAL_GOLD_CORNER_SIZE
    );
    const geometry = this.track(
      new THREE.ExtrudeGeometry(shape, {
        depth: SEAL_BODY_HEIGHT - indent * 2,
        bevelEnabled: true,
        bevelThickness: SEAL_BODY_BEVEL,
        bevelSize: SEAL_BODY_BEVEL,
        bevelSegments: 2,
        curveSegments: 8
      })
    );
    // ExtrudeGeometry 沿 +Z 挤出，转成沿 +Y，并把几何中心挪到原点
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -(SEAL_BODY_HEIGHT - indent * 2) / 2, 0);
    geometry.computeVertexNormals();

    const body = new THREE.Mesh(geometry, this.jadeMaterial);
    body.position.y = BODY_CENTER_Y;
    body.castShadow = true;
    body.receiveShadow = true;
    body.name = 'jade_body';
    body.userData.relic_part = 'jade_body';
    this.bodyMesh = body;
    this.parts.set('jade_body', body);
    this.pickTargets.push(body);
    this.placeholder.add(body);

    // 印面（底面）—— 一层略深的玉皮，让"能盖印的那一面"看得出来
    const faceGeo = this.track(new THREE.PlaneGeometry(SEAL_SIDE * 0.98, SEAL_SIDE * 0.98));
    const faceMat = this.track(
      new THREE.MeshPhysicalMaterial({
        ...SEAL_JADE_MATERIAL,
        color: 0x7fbf9c,
        roughness: 0.42
      })
    );
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.rotation.x = Math.PI / 2;
    face.position.y = -SEAL_HEIGHT / 2 - 0.002;
    face.name = 'seal_face';
    this.placeholder.add(face);
  }

  // ── 构建：五龙钮 ──────────────────────────────────────────────────

  private buildDragonKnob() {
    const knob = new THREE.Group();
    knob.name = 'dragon_knob';
    knob.position.y = KNOB_CENTER_Y;

    // 钮座：一段车削轮廓（LatheGeometry），五龙盘其上
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0.0, -SEAL_KNOB_HEIGHT / 2),
      new THREE.Vector2(0.62, -SEAL_KNOB_HEIGHT / 2),
      new THREE.Vector2(0.66, -SEAL_KNOB_HEIGHT * 0.28),
      new THREE.Vector2(0.42, -SEAL_KNOB_HEIGHT * 0.05),
      new THREE.Vector2(0.38, SEAL_KNOB_HEIGHT * 0.2),
      new THREE.Vector2(0.2, SEAL_KNOB_HEIGHT * 0.34),
      new THREE.Vector2(0.0, SEAL_KNOB_HEIGHT * 0.4)
    ];
    const baseGeo = this.track(new THREE.LatheGeometry(profile, 20));
    const base = new THREE.Mesh(baseGeo, this.jadeMaterial);
    base.castShadow = true;
    knob.add(base);

    // 五条简化龙：4 条绕钮一周 + 1 条盘顶。身体是 TubeGeometry 的 S 形曲线，
    // 头是一个小锥 —— 远看是龙，近看也不破，三角面却只有几百。
    const dragonCount = 5;
    const dragonBodyMat = this.jadeMaterial;
    const hornMat = this.goldMaterial;
    for (let i = 0; i < dragonCount; i++) {
      const isCrown = i === dragonCount - 1;
      const angle = (i / (dragonCount - 1)) * Math.PI * 2 * (isCrown ? 0 : 1);
      const dragon = new THREE.Group();
      dragon.name = `dragon_${i}`;

      const radius = isCrown ? 0.12 : 0.52;
      const lift = isCrown ? SEAL_KNOB_HEIGHT * 0.42 : -SEAL_KNOB_HEIGHT * 0.12;
      const points: THREE.Vector3[] = [];
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const a = angle + (isCrown ? t * Math.PI * 1.6 : t * 1.5 - 0.75);
        const r = radius + Math.sin(t * Math.PI) * (isCrown ? 0.16 : 0.1);
        points.push(
          new THREE.Vector3(
            Math.cos(a) * r,
            lift + t * (isCrown ? 0.24 : SEAL_KNOB_HEIGHT * 0.72),
            Math.sin(a) * r
          )
        );
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = this.track(new THREE.TubeGeometry(curve, 18, 0.055, 6, false));
      const tube = new THREE.Mesh(tubeGeo, dragonBodyMat);
      tube.castShadow = true;
      dragon.add(tube);

      const headGeo = this.track(new THREE.ConeGeometry(0.085, 0.22, 6));
      const head = new THREE.Mesh(headGeo, dragonBodyMat);
      head.position.copy(points[points.length - 1]);
      head.rotation.z = Math.PI * 0.15;
      dragon.add(head);

      // 龙角点金：五龙各一点，是"金镶玉"的呼应
      const hornGeo = this.track(new THREE.ConeGeometry(0.03, 0.1, 4));
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.copy(points[points.length - 1]).add(new THREE.Vector3(0, 0.08, 0));
      dragon.add(horn);

      this.dragongroup.add(dragon);
    }
    knob.add(this.dragongroup);

    this.knobGroup = knob;
    this.parts.set('dragon_knob', knob);
    this.placeholder.add(knob);
  }

  // ── 构建：金镶玉缺角 + 燕尾倒勾槽 ─────────────────────────────────

  private buildGoldCorner() {
    // 1) 燕尾槽（阴）：缺口里的暗底。金角被拔走后，人们看到的就是它。
    const socketGeo = this.track(
      new THREE.BoxGeometry(
        SEAL_GOLD_CORNER_SIZE * 0.93,
        SEAL_BODY_HEIGHT * 0.93,
        SEAL_GOLD_CORNER_SIZE * 0.93
      )
    );
    const socket = new THREE.Mesh(socketGeo, this.socketMaterial);
    socket.position.copy(CORNER_BASE);
    socket.name = 'gold_corner_socket';
    socket.receiveShadow = true;
    this.placeholder.add(socket);

    // 2) 金镶角（阳）：王莽补的那一角，整条角柱填满缺口
    const corner = new THREE.Group();
    corner.name = 'gold_corner';
    corner.position.copy(CORNER_BASE);

    const cornerGeo = this.track(
      new THREE.BoxGeometry(
        SEAL_GOLD_CORNER_SIZE,
        SEAL_BODY_HEIGHT * 0.98,
        SEAL_GOLD_CORNER_SIZE
      )
    );
    const cornerMesh = new THREE.Mesh(cornerGeo, this.goldMaterial);
    cornerMesh.castShadow = true;
    cornerMesh.name = 'gold_corner_mesh';
    cornerMesh.userData.relic_part = 'gold_corner';
    corner.add(cornerMesh);
    this.pickTargets.push(cornerMesh);

    // 3) 燕尾榫：锁住金角的倒勾键，轴指向印台内部 (−1,0,−1)/√2
    const tenonGeo = this.track(
      new THREE.ExtrudeGeometry(createDovetailShape(SEAL_CUN * 0.5, SEAL_CUN * 0.36), {
        depth: SEAL_CUN * 0.7,
        bevelEnabled: false,
        curveSegments: 2
      })
    );
    const tenon = new THREE.Mesh(tenonGeo, this.goldMaterial);
    tenon.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      OUT_DIR.clone().negate()
    );
    tenon.name = 'dovetail_tenon';
    tenon.userData.relic_part = 'dovetail_tenon';
    corner.add(tenon);

    this.dovetailTenon = tenon;
    this.parts.set('dovetail_tenon', tenon);
    this.goldCornerGroup = corner;
    this.parts.set('gold_corner', corner);
    this.placeholder.add(corner);
  }

  // ── 构建：断代刻痕层 ──────────────────────────────────────────────

  /**
   * 一个断代 = 一层可见刻痕。切 era 即切层（玉只有一个，历史一层压一层，
   * 所以是过滤不是叠加）。
   */
  private buildEraLayers() {
    SEAL_ERA_ORDER.forEach((era) => {
      const layer = new THREE.Group();
      layer.name = `era_layer_${era}`;
      layer.visible = false;

      if (era === 'qin') {
        // 秦：印面阴刻小篆「受命于天，既寿永昌」
        const tex = this.track(
          createInscriptionTexture(SEAL_ERA_LAYERS.qin.text, {
            size: 256,
            color: 'rgba(16,38,28,0.9)',
            background: null,
            cols: 2
          })
        );
        const mat = this.track(
          new THREE.MeshPhysicalMaterial({
            map: tex,
            transparent: true,
            roughness: 0.35,
            metalness: 0.0,
            depthWrite: false
          })
        );
        const geo = this.track(new THREE.PlaneGeometry(SEAL_SIDE * 0.96, SEAL_SIDE * 0.96));
        const plane = new THREE.Mesh(geo, mat);
        plane.rotation.x = Math.PI / 2; // 朝下：这就是盖印的那一面
        plane.position.y = -SEAL_HEIGHT / 2 - 0.006;
        layer.add(plane);
      }

      if (era === 'xin') {
        // 汉新：金镶玉补角 —— 角上那道崩裂痕
        const tex = this.track(createMottleTexture(256, 0.5, '#8a6b1f'));
        const mat = this.track(
          new THREE.MeshPhysicalMaterial({
            map: tex,
            transparent: true,
            roughness: 0.6,
            metalness: 0.2,
            depthWrite: false
          })
        );
        const geo = this.track(
          new THREE.PlaneGeometry(SEAL_GOLD_CORNER_SIZE * 1.6, SEAL_GOLD_CORNER_SIZE * 1.6)
        );
        const plane = new THREE.Mesh(geo, mat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(CORNER_BASE.x, BODY_TOP_Y + 0.004, CORNER_BASE.z);
        layer.add(plane);
      }

      if (era === 'weijin') {
        // 魏晋十六国：玺肩加刻。曹丕八分汉隶 + 石勒魏碑，各占一面。
        const shoulder = BODY_CENTER_Y + SEAL_BODY_HEIGHT * 0.16;
        const specs: Array<{ text: string; rotY: number; z: number; x: number }> = [
          { text: SEAL_ERA_LAYERS.weijin.text, rotY: 0, x: 0, z: SEAL_SIDE / 2 + 0.004 },
          { text: SEAL_WEIJIN_SECOND_INSCRIPTION, rotY: Math.PI / 2, x: SEAL_SIDE / 2 + 0.004, z: 0 }
        ];
        specs.forEach((spec) => {
          const tex = this.track(
            createInscriptionTexture(spec.text, {
              size: 256,
              color: 'rgba(18,42,30,0.85)',
              background: null,
              cols: Math.min(4, Array.from(spec.text).length)
            })
          );
          const mat = this.track(
            new THREE.MeshPhysicalMaterial({
              map: tex,
              transparent: true,
              roughness: 0.38,
              metalness: 0.0,
              depthWrite: false
            })
          );
          const geo = this.track(
            new THREE.PlaneGeometry(SEAL_SIDE * 0.86, SEAL_SIDE * 0.42)
          );
          const plane = new THREE.Mesh(geo, mat);
          plane.position.set(spec.x, shoulder, spec.z);
          plane.rotation.y = spec.rotY;
          layer.add(plane);
        });
      }

      if (era === 'liaojin') {
        // 辽金：桑干河沉砂水蚀 —— 玉理尽开，字口圆钝，光泽转哑
        const tex = this.track(createMottleTexture(256, 0.42, '#6b5b3e'));
        const mat = this.track(
          new THREE.MeshPhysicalMaterial({
            map: tex,
            transparent: true,
            roughness: 0.85,
            metalness: 0.0,
            depthWrite: false
          })
        );
        const geo = this.track(new THREE.PlaneGeometry(SEAL_SIDE * 0.98, SEAL_SIDE * 0.98));
        const plane = new THREE.Mesh(geo, mat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = BODY_TOP_Y + 0.006;
        layer.add(plane);
      }

      this.eraLayers.set(era, layer);
      this.placeholder.add(layer);
    });
  }

  /** 悬浮玺台的供奉柔光 */
  private buildSealLight() {
    const light = new THREE.PointLight(SEAL_LIGHT.color, SEAL_LIGHT.intensity, SEAL_LIGHT.distance, 2);
    light.position.set(0, SEAL_LIGHT.offsetY, 0);
    light.name = 'seal_light';
    this.sealLight = light;
    this.root.add(light);
  }

  // ── 对外 API ──────────────────────────────────────────────────────

  /** 形态：normal（合）/ exploded（拆解）/ stamping（拓印） */
  public setMode(mode: SealMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    // 一旦由 UI 明确切形态，就交回自动过渡，清掉手动进度覆盖
    this.explodedOverride = null;
    if (mode === 'stamping') {
      this.stampProgress = 0;
      this.stampFired = false;
    }
    this.onModeChange?.(mode);
  }

  /**
   * 导演手动拖拆解进度（0 合 → 1 全拆）。
   * 拖到 0 视为"合"，拖离 0 视为"拆"，让状态机读数与 UI 一致。
   */
  public setExplodedProgress(progress: number): void {
    const clamped = Math.min(1, Math.max(0, progress));
    this.explodedOverride = clamped;
    this.explodedProgress = clamped;
    if (clamped > 0 && this.mode !== 'exploded') this.setMode('exploded');
    else if (clamped === 0 && this.mode === 'exploded') this.setMode('normal');
  }

  /** 选中高亮：只提亮供奉光，不换材质、不改几何（可被反复调用） */
  public setSelected(selected: boolean): void {
    this.selected = selected;
  }

  public isSelected(): boolean {
    return this.selected;
  }

  public getMode(): SealMode {
    return this.mode;
  }

  /** 断代层过滤 */
  public setEra(era: SealEra): void {
    if (!this.eraLayers.has(era)) return;
    this.era = era;
    this.applyEra(era);
  }

  public getEra(): SealEra {
    return this.era;
  }

  /** LOD 档位：high 全细节 / medium 去龙去刻痕 / low 只剩玉体 */
  public setLod(lod: SealLod): void {
    this.lod = lod;
    this.applyLod(lod);
  }

  /** 按相机距离自动选档（阈值见 sealSpec.SEAL_LOD_DISTANCE） */
  public setLodByDistance(distance: number): void {
    if (distance <= SEAL_LOD_DISTANCE.high) this.setLod('high');
    else if (distance <= SEAL_LOD_DISTANCE.medium) this.setLod('medium');
    else this.setLod('low');
  }

  public getLod(): SealLod {
    return this.lod;
  }

  /** 高质档透射开关（开则多一遍帧缓冲，长跑慎开） */
  public setTransmissionEnabled(enabled: boolean): void {
    this.transmissionEnabled = enabled;
    this.jadeMaterial.transmission = enabled ? SEAL_TRANSMISSION_PRESET.transmission : 0;
    this.jadeMaterial.attenuationDistance = SEAL_TRANSMISSION_PRESET.attenuationDistance;
    this.jadeMaterial.attenuationColor = new THREE.Color(SEAL_TRANSMISSION_PRESET.attenuationColor);
    this.jadeMaterial.ior = enabled
      ? SEAL_TRANSMISSION_PRESET.ior
      : SEAL_JADE_MATERIAL.ior;
    // transmission 在 0 与 >0 之间切换会改变 shader 变体，必须重编
    this.jadeMaterial.needsUpdate = true;
  }

  public setAutoSpin(enabled: boolean): void {
    this.autoSpin = enabled;
  }

  public getPart(id: SealPartId): THREE.Object3D | undefined {
    return this.parts.get(id);
  }

  /** 印台网格（供机位取包围盒 / 外部做包围盒对齐） */
  public getBodyMesh(): THREE.Mesh | null {
    return this.bodyMesh;
  }

  /** 悬浮中心的世界坐标（机位、拓印落点都从这里起算） */
  public getHoverY(): number {
    return SEAL_HOVER_Y;
  }

  /** raycast 拾取目标（骨架：供导演/认证路由激活交互） */
  public pickables(): THREE.Object3D[] {
    if (this.glbGroup) return [this.glbGroup];
    return this.pickTargets;
  }

  /**
   * 拾取骨架：**只做选中**（高亮），**不改形态**。
   *
   * ⚠️ 早期版本这里会 normal → exploded → stamping 循环切形态，
   *    但圣物形态不能被一次误触改掉 —— 形态变更一律走 UI（SealPanel）。
   *    所以现在这里只置选中态，返回当前形态供调用方读。
   *    推近机位由祭坛的 focusRelic() 负责，器物自己不碰相机。
   */
  public handlePick(): SealMode {
    this.selected = true;
    return this.mode;
  }

  /** 当前三角面数（只数可见网格），用于卡 150K 预算 */
  public countTriangles(): number {
    let total = 0;
    this.root.traverse((obj) => {
      if (!obj.visible) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const geo = mesh.geometry as THREE.BufferGeometry;
      const index = geo.getIndex();
      const position = geo.getAttribute('position');
      if (index) total += index.count / 3;
      else if (position) total += position.count / 3;
    });
    return Math.round(total);
  }

  public isWithinTriangleBudget(): boolean {
    return this.countTriangles() <= SEAL_TRIANGLE_BUDGET;
  }

  /** 导出运行时状态（无席位语义，可安全上报） */
  public getState(): ImperialSealState {
    return {
      relic_id: 'imperial_seal',
      mode: this.mode,
      era: this.era,
      exploded_progress: this.explodedProgress,
      stamp_progress: this.stampProgress,
      stamp_count: this.stampCount,
      hover_y: this.root.position.y,
      spin_rpm: SEAL_SPIN_RPM,
      lod: this.lod,
      transmission_enabled: this.transmissionEnabled,
      glb_loaded: this.glbLoaded,
      selected: this.selected,
      visible: this.root.visible
    };
  }

  // ── 每帧 ──────────────────────────────────────────────────────────

  public update(dt: number, elapsed: number): void {
    const delta = Math.min(0.05, Math.max(0, dt));

    // 1. 缓慢自转：供着的，不是甩着的。拓印时停转，免得印面歪。
    if (this.autoSpin && this.mode !== 'stamping') {
      this.root.rotation.y += (SEAL_SPIN_RPM / 60) * Math.PI * 2 * delta;
    }

    // 2. 悬浮呼吸 + 下压行程
    const breath = Math.sin((elapsed / SEAL_BREATH_PERIOD) * Math.PI * 2) * SEAL_BREATH_AMPLITUDE;
    let drop = 0;
    if (this.mode === 'stamping' || this.stampProgress > 0) {
      const p = this.stampProgress;
      const down =
        p < SEAL_STAMP.contactAt
          ? p / SEAL_STAMP.contactAt
          : Math.max(0, (1 - p) / (1 - SEAL_STAMP.contactAt));
      drop = SEAL_STAMP.drop * down;
    }
    this.root.position.y = SEAL_HOVER_Y + breath - drop;

    // 3. 拆解进度（拆解 1.8s 走完，返回同理）
    if (this.explodedOverride !== null) {
      // 手动覆盖：导演拖到哪就是哪
      this.explodedProgress = this.explodedOverride;
    } else {
      const targetExploded = this.mode === 'exploded' ? 1 : 0;
      const explodeStep = delta / SEAL_EXPLODE.duration;
      if (this.explodedProgress < targetExploded) {
        this.explodedProgress = Math.min(targetExploded, this.explodedProgress + explodeStep);
      } else if (this.explodedProgress > targetExploded) {
        this.explodedProgress = Math.max(targetExploded, this.explodedProgress - explodeStep);
      }
    }
    this.applyExploded(this.explodedProgress);

    // 4. 拓印进度：触地出印，回升后自动回 normal
    if (this.mode === 'stamping') {
      this.stampProgress = Math.min(1, this.stampProgress + delta / SEAL_STAMP.duration);
      if (!this.stampFired && this.stampProgress >= SEAL_STAMP.contactAt) {
        this.stampFired = true;
        this.stampCount += 1;
        this.onStamp?.();
      }
      if (this.stampProgress >= 1) {
        this.stampProgress = 0;
        this.stampFired = false;
        this.setMode('normal');
      }
    }

    // 5. 柔光随呼吸轻微起伏，别闪；选中时提亮一档（唯一的选中反馈）
    if (this.sealLight) {
      const breathLight = 0.9 + Math.sin(elapsed * 0.8) * 0.1;
      this.sealLight.intensity =
        SEAL_LIGHT.intensity * breathLight * (this.selected ? 1.6 : 1);
    }
  }

  // ── 内部：应用状态到几何 ──────────────────────────────────────────

  private applyExploded(p: number): void {
    if (this.goldCornerGroup) {
      this.goldCornerGroup.position
        .copy(CORNER_BASE)
        .addScaledVector(OUT_DIR, SEAL_EXPLODE.goldCornerOut * p)
        .addScaledVector(UP, SEAL_EXPLODE.goldCornerLift * p);
    }
    if (this.dovetailTenon) {
      // 榫头故意"跟不上"金角 —— 倒勾就这样被看见
      this.dovetailTenon.position
        .set(0, 0, 0)
        .addScaledVector(OUT_DIR, -SEAL_EXPLODE.dovetailPull * p);
    }
    if (this.knobGroup) {
      this.knobGroup.position.y = KNOB_CENTER_Y + SEAL_EXPLODE.knobLift * p;
    }
  }

  private applyEra(era: SealEra): void {
    // 辽金沉砂：字口圆钝，玉理尽开 —— 材质也要跟着变哑
    this.jadeMaterial.roughness = era === 'liaojin' ? 0.62 : SEAL_JADE_MATERIAL.roughness;
    this.jadeMaterial.clearcoat = era === 'liaojin' ? 0.08 : SEAL_JADE_MATERIAL.clearcoat;
    this.refreshLayerVisibility();
  }

  /** 刻痕层可见性 = 当前断代 ∧ 当前 LOD 允许刻痕（两层条件，一处收口） */
  private refreshLayerVisibility(): void {
    const showEngraving = this.lod === 'high';
    this.eraLayers.forEach((layer, key) => {
      layer.visible = showEngraving && key === this.era;
    });
  }

  private applyLod(lod: SealLod): void {
    const showKnob = lod !== 'low';
    const showDragons = lod === 'high';

    if (this.knobGroup) this.knobGroup.visible = showKnob;
    this.dragongroup.visible = showDragons;
    // low 档连法线贴图都省掉，少一次采样
    this.jadeMaterial.normalMap = lod === 'low' ? null : this.jadeNormalMap;
    this.jadeMaterial.needsUpdate = true;
    this.refreshLayerVisibility();
  }

  // ── GLB 接管接口 ──────────────────────────────────────────────────

  /**
   * 用高精资产接管占位几何。
   *
   * 资产到位后只需：
   *     await seal.loadSealFromGLB('/models/imperial_seal.glb', { dracoPath: '/draco/' });
   * 其余 API（setMode / setEra / setLod / update）一行都不用改。
   * 加载失败会安全退回占位几何，不会把玉玺弄丢。
   */
  public async loadSealFromGLB(
    url: string = SEAL_GLB_URL,
    options: { dracoPath?: string; applyJadeMaterial?: boolean } = {}
  ): Promise<boolean> {
    const applyJadeMaterial = options.applyJadeMaterial ?? true;
    const loader = new GLTFLoader();
    let draco: DRACOLoader | null = null;

    try {
      if (options.dracoPath) {
        draco = new DRACOLoader();
        draco.setDecoderPath(options.dracoPath);
        loader.setDRACOLoader(draco);
        this.dracoLoader = draco;
      }

      const gltf = await loader.loadAsync(url);
      const model = gltf.scene;

      // 归一化到规格尺寸：方四寸 = SEAL_SIDE
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxSide = Math.max(size.x, size.z) || SEAL_SIDE;
      const scale = SEAL_SIDE / maxSide;
      model.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = scaledBox.getCenter(new THREE.Vector3());
      model.position.sub(center); // 几何中心对齐到 root 原点

      if (applyJadeMaterial) {
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const name = mesh.name.toLowerCase();
          mesh.material = name.includes('gold') || name.includes('jin') ? this.goldMaterial : this.jadeMaterial;
        });
      }

      // 占位几何整体退场
      this.retirePlaceholder();

      this.glbGroup = model;
      model.name = 'imperial_seal_glb';
      model.userData.relic_id = 'imperial_seal';
      this.root.add(model);
      this.glbLoaded = true;

      // 接管后把当前状态重新压一遍
      this.applyEra(this.era);
      this.applyLod(this.lod);
      this.applyExploded(this.explodedProgress);

      if (this.countTriangles() > SEAL_TRIANGLE_BUDGET) {
        console.warn(
          `[玉玺] GLB 三角面 ${this.countTriangles()} 超出预算 ${SEAL_TRIANGLE_BUDGET}，请减面或退回占位几何`
        );
      }
      return true;
    } catch (err) {
      console.warn('[玉玺] GLB 加载失败，保留程序化占位几何：', err);
      return false;
    } finally {
      // 解码器只在加载期间需要，用完即弃
      draco?.dispose();
      this.dracoLoader = null;
    }
  }

  public isGlbLoaded(): boolean {
    return this.glbLoaded;
  }

  /** 占位几何退场（GLB 接管时调用） */
  private retirePlaceholder(): void {
    this.placeholder.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
      }
    });
    this.placeholder.clear();
    this.pickTargets.length = 0;
    this.bodyMesh = null;
    this.knobGroup = null;
    this.goldCornerGroup = null;
    this.dovetailTenon = null;
    // 占位材质/贴图仍在 disposables 里登记着，留到 dispose() 统一回收
  }

  // ── 释放 ──────────────────────────────────────────────────────────

  public dispose(): void {
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose();
      obj.userData = {};
    });
    this.root.clear();

    // 贴图（玉理 Normal 图、刻痕图、斑驳图）与材质统一回收
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;

    // DRACO 解码器若还挂着（加载中途被打断），一并释放
    if (this.dracoLoader) {
      this.dracoLoader.dispose();
      this.dracoLoader = null;
    }

    this.eraLayers.clear();
    this.parts.clear();
    this.pickTargets.length = 0;
    this.dragongroup.clear();
    this.sealLight?.dispose();
    this.sealLight = null;
    this.glbGroup = null;
  }
}

/** DRACO 默认解码器目录：把 three 的 examples/jsm/libs/draco/ 拷到 public 下即可 */
export const SEAL_DEFAULT_DRACO_PATH = SEAL_DRACO_PATH;
