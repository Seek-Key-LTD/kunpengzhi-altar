// 传国玉玺 · 虚拟拓印（朱砂印痕）
//
// 玉玺按下时，在祭坛地面浮现一枚朱砂小篆印痕。
//
// ── 阴刻 → 白文 ─────────────────────────────────────────────────────
// 秦刻是**阴刻**（字口凹下去）。凹处吃不到印泥，
// 所以拓出来是「朱底白字」—— 白文。这里按这个规矩画：
// 朱砂铺底，字留白。别画成红字白底，那是阳文的拓法。
//
// ── 法统边界 ────────────────────────────────────────────────────────
// 印痕落在台基上，是**器物行为**，不是占席：
// 不写 seat_id、不入座次表、不触发 MIDI、不发音。

import * as THREE from 'three';
import type { SealEra } from '../../types/relic';
import { SEAL_ERA_LAYERS, SEAL_STAMP, SEAL_WEIJIN_SECOND_INSCRIPTION } from '../../data/sealSpec';

/** 一枚印痕的运行时数据 */
interface StampEntry {
  /** 印痕本体 */
  mesh: THREE.Mesh;
  /** 触地瞬间的朱砂辉光 */
  glow: THREE.Mesh;
  /** 已存活时长（秒） */
  age: number;
  /** 是否在使用中（false = 已回收，等待复用） */
  active: boolean;
  /** 该枚印痕落下时玉玺所处的断代层 */
  era: SealEra;
}

export interface SealStampDecalOptions {
  /** 同屏最多留几枚（超出则复用最旧的一枚） */
  maxStamps?: number;
  /** 印痕边长（默认印面方四寸 = 一格） */
  size?: number;
  /** 是否带触地辉光 */
  glow?: boolean;
}

const TRADITIONAL_FONT = `"Songti SC", "STSong", "SimSun", "STKaiti", "KaiTi", serif`;

/** 确定性伪随机（同一序号每次落印姿态一致，方便复现） */
function pseudoRandom(seed: number): number {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * 朱砂印痕贴图。
 * 底 = 朱砂，字 = 留白（阴刻白文）；水蚀层再用 destination-out 把字口啃掉。
 */
function createStampTexture(era: SealEra, size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, size, size);

    // 1) 朱砂印面（外框略厚，四边有手工印泥的毛边感）
    ctx.fillStyle = SEAL_STAMP.cinnabar;
    const inset = size * 0.04;
    ctx.fillRect(inset, inset, size - inset * 2, size - inset * 2);

    // 2) 印面留白区（白文的"底"就是朱砂，字是挖出来的）
    ctx.globalCompositeOperation = 'destination-out';

    // 断代决定这枚印上有什么字
    const mainText =
      era === 'weijin' ? SEAL_ERA_LAYERS.weijin.text : SEAL_ERA_LAYERS.qin.text;
    const hasText = mainText.length > 0;

    if (hasText) {
      const chars = Array.from(mainText.replace(/[，,、\s]/g, ''));
      const cols = 2;
      const rows = Math.ceil(chars.length / cols);
      ctx.font = `${Math.floor(size / (Math.max(cols, rows) + 0.5))}px ${TRADITIONAL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000'; // 只要 alpha，颜色无所谓
      for (let i = 0; i < chars.length; i++) {
        const col = Math.floor(i / rows);
        const row = i % rows;
        // 自右向左、自上而下
        const cx = size - (col + 0.5) * ((size - inset * 4) / cols) - inset * 2;
        const cy = inset * 2 + (row + 0.5) * ((size - inset * 4) / rows);
        ctx.fillText(chars[i], cx, cy);
      }
    }

    // 3) 汉新：金镶玉补角 —— 印面缺一角（玉体本来就缺，拓出来当然也缺）
    if (era === 'xin') {
      const notch = size * 0.3;
      ctx.fillRect(size - inset - notch, size - inset - notch, notch, notch);
    }

    // 4) 魏晋：玺肩边款（小字，压在印面内侧）
    if (era === 'weijin') {
      ctx.font = `${Math.floor(size * 0.075)}px ${TRADITIONAL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      const side = SEAL_WEIJIN_SECOND_INSCRIPTION;
      for (let i = 0; i < side.length; i++) {
        ctx.fillText(side[i], inset * 3 + size * 0.055, inset * 3 + (i + 0.5) * size * 0.1);
      }
    }

    // 5) 辽金：桑干河沉砂水蚀 —— 字口圆钝、印面残缺
    if (era === 'liaojin') {
      for (let i = 0; i < 120; i++) {
        const x = pseudoRandom(i * 3 + 1) * size;
        const y = pseudoRandom(i * 3 + 2) * size;
        const r = (0.015 + pseudoRandom(i * 3 + 3) * 0.06) * size;
        ctx.globalAlpha = 0.35 + pseudoRandom(i * 3 + 4) * 0.65;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/** 触地辉光：一圈由内向外散开的朱砂晕 */
function createGlowTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(0, 'rgba(255,120,90,0.85)');
    gradient.addColorStop(0.35, 'rgba(193,39,45,0.45)');
    gradient.addColorStop(1, 'rgba(193,39,45,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

export class SealStampDecal {
  private readonly root = new THREE.Group();
  private readonly entries: StampEntry[] = [];
  private readonly textures = new Map<SealEra, THREE.CanvasTexture>();
  private readonly planeGeometry: THREE.PlaneGeometry;
  private readonly glowGeometry: THREE.PlaneGeometry;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly maxStamps: number;
  private readonly size: number;
  private readonly withGlow: boolean;
  private cursor = 0;
  private stampIndex = 0;

  constructor(options: SealStampDecalOptions = {}) {
    this.maxStamps = Math.max(1, options.maxStamps ?? SEAL_STAMP.maxStamps);
    this.size = options.size ?? SEAL_STAMP.size;
    this.withGlow = options.glow ?? true;

    this.root.name = 'seal_stamp_decals';

    this.planeGeometry = new THREE.PlaneGeometry(this.size, this.size);
    this.glowGeometry = new THREE.PlaneGeometry(this.size * 2.1, this.size * 2.1);
    this.glowTexture = createGlowTexture(128);
    this.disposables.push(this.planeGeometry, this.glowGeometry, this.glowTexture);

    for (let i = 0; i < this.maxStamps; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        toneMapped: false
      });
      const mesh = new THREE.Mesh(this.planeGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 12;
      mesh.visible = false;
      this.root.add(mesh);

      const glowMaterial = new THREE.MeshBasicMaterial({
        map: this.glowTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const glow = new THREE.Mesh(this.glowGeometry, glowMaterial);
      glow.rotation.x = -Math.PI / 2;
      glow.renderOrder = 11;
      glow.visible = this.withGlow;
      this.root.add(glow);

      this.disposables.push(material, glowMaterial);
      this.entries.push({ mesh, glow, age: 0, active: false, era: 'qin' });
    }
  }

  /** 对外挂点：由祭坛决定挂到哪儿（通常直接挂 scene） */
  public get object3D(): THREE.Group {
    return this.root;
  }

  /** 已落印次数（器物自身计数，与席号无关） */
  public getStampIndex(): number {
    return this.stampIndex;
  }

  /**
   * 落一枚印。
   * @param position 世界坐标（通常由 sealSpec.SEAL_STAMP.home 或祭坛指定）
   * @param era      落下时玉玺所处的断代层 —— 断代不同，印面不同
   */
  public stamp(position: THREE.Vector3, era: SealEra = 'qin'): void {
    const entry = this.acquire();
    entry.era = era;
    entry.age = 0;
    entry.active = true;

    const texture = this.getTexture(era);
    const material = entry.mesh.material as THREE.MeshBasicMaterial;
    material.map = texture;
    material.opacity = 0;
    material.needsUpdate = true;

    // 每枚印轻微转一点角度：手按的，不是机器压的
    const spin = (pseudoRandom(this.stampIndex + 1) - 0.5) * 0.16;
    entry.mesh.position.set(position.x, position.y + 0.012, position.z);
    entry.mesh.rotation.set(-Math.PI / 2, 0, spin);
    entry.mesh.scale.setScalar(1.24);
    entry.mesh.visible = true;

    entry.glow.position.set(position.x, position.y + 0.02, position.z);
    entry.glow.rotation.set(-Math.PI / 2, 0, spin);
    entry.glow.scale.setScalar(0.6);
    entry.glow.visible = this.withGlow;
    (entry.glow.material as THREE.MeshBasicMaterial).opacity = 0;

    this.stampIndex += 1;
  }

  /** 取一枚空闲印痕；没有空闲就复用最旧的那一枚 */
  private acquire(): StampEntry {
    const idle = this.entries.find((e) => !e.active);
    if (idle) return idle;
    const reused = this.entries[this.cursor % this.entries.length];
    this.cursor = (this.cursor + 1) % this.entries.length;
    return reused;
  }

  /** 断代贴图缓存：一个断代一张，别每按一次就重画 canvas */
  private getTexture(era: SealEra): THREE.CanvasTexture {
    const cached = this.textures.get(era);
    if (cached) return cached;
    const texture = createStampTexture(era, 256);
    this.textures.set(era, texture);
    this.disposables.push(texture);
    return texture;
  }

  /** 每帧推进淡入 → 保持 → 淡出 */
  public update(dt: number): void {
    const delta = Math.min(0.05, Math.max(0, dt));

    this.entries.forEach((entry) => {
      if (!entry.active) return;
      entry.age += delta;

      const { fadeIn, hold, fadeOut } = SEAL_STAMP;
      let alpha = 1;
      if (entry.age < fadeIn) {
        alpha = entry.age / fadeIn;
      } else if (entry.age > fadeIn + hold) {
        alpha = 1 - (entry.age - fadeIn - hold) / fadeOut;
      }

      if (alpha <= 0) {
        entry.active = false;
        entry.mesh.visible = false;
        entry.glow.visible = false;
        (entry.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        (entry.glow.material as THREE.MeshBasicMaterial).opacity = 0;
        return;
      }

      // 落印瞬间由大压小：手感是"砸下去"再定住
      const settle = Math.min(1, entry.age / fadeIn);
      entry.mesh.scale.setScalar(1.24 - 0.24 * settle);
      (entry.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, alpha) * 0.92;

      // 辉光只在最开始那一下闪，随后迅速退场
      const glowAlpha = entry.age < fadeIn * 2 ? 1 - entry.age / (fadeIn * 2) : 0;
      entry.glow.scale.setScalar(0.6 + 0.9 * Math.min(1, entry.age / (fadeIn * 2)));
      (entry.glow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, glowAlpha) * 0.7;
    });
  }

  /** 全部收走（仪式收场时用） */
  public clear(): void {
    this.entries.forEach((entry) => {
      entry.active = false;
      entry.mesh.visible = false;
      entry.glow.visible = false;
      (entry.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
      (entry.glow.material as THREE.MeshBasicMaterial).opacity = 0;
    });
  }

  public dispose(): void {
    this.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.textures.clear();
    this.root.clear();
    this.entries.length = 0;
  }
}
