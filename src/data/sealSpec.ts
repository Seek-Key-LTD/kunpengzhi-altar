// 传国玉玺 · 规格常量（尺寸 / 断代 / 拆解 / 材质 / 机位）
//
// ── 尺寸换算 ────────────────────────────────────────────────────────
// 全坛唯一建材是立方砖 BRICK = 1.5 = 半格，故取
//     1 寸 = BRICK / 2 = 0.75
// 史载传国玉玺「方四寸，高三寸六」：
//     方四寸 = 4 × 0.75 = 3.0 = CELL      ← 正好与祭坛一格等宽
//     高三寸六 = 3.6 × 0.75 = 2.7
// 一方印压下去，不多不少，正好盖住一格 —— 这不是巧合，是坛的度量衡先定了。
//
// ── 位置 ────────────────────────────────────────────────────────────
// 玉玺悬浮于坛心正上方 PYRAMID_TOP + 2.2 处（= 12.7），作「悬浮玺台」。
// 它不入 49 席数组：不占格、不发音、不可认领、不进座次表。

import { BRICK, PLINTH_HALF, PYRAMID_HALF, PYRAMID_TOP } from './altarGeometry';
import type { SealEra, SealEraLayer, SealLod } from '../types/relic';

/** 一寸（世界单位） */
export const SEAL_CUN = BRICK / 2; // 0.75

/** 印面边长：方四寸 = 3.0 = 一格 */
export const SEAL_SIDE = SEAL_CUN * 4; // 3.0（= CELL）
/** 通高：三寸六 = 2.7 */
export const SEAL_HEIGHT = SEAL_CUN * 3.6; // 2.7

/** 印台（含印面）高度：通高的 55% */
export const SEAL_BODY_HEIGHT = SEAL_HEIGHT * 0.55; // 1.485
/** 五龙钮高度：通高的 45% */
export const SEAL_KNOB_HEIGHT = SEAL_HEIGHT * 0.45; // 1.215

/** 金镶补角的边长（约 1.2 寸） */
export const SEAL_GOLD_CORNER_SIZE = SEAL_CUN * 1.2; // 0.9
/** 印台倒角半径 */
export const SEAL_BODY_BEVEL = SEAL_CUN * 0.08; // 0.06

/** 悬浮中心高程：坛顶再抬 2.2 */
export const SEAL_HOVER_Y = PYRAMID_TOP + 2.2; // 12.7
/** 自转速度（转/分）—— 慢，是供着，不是甩着 */
export const SEAL_SPIN_RPM = 0.35;
/** 悬浮呼吸幅度（世界单位） */
export const SEAL_BREATH_AMPLITUDE = 0.18;
/** 悬浮呼吸周期（秒） */
export const SEAL_BREATH_PERIOD = 9.0;

/** 三角面预算（含后续高精 GLB） */
export const SEAL_TRIANGLE_BUDGET = 150_000;

// ── 断代时间轴：一个断代 = 一层刻痕 ──────────────────────────────────
// 过滤方式：切 era 即切可见层，不叠加（玉只有一个，历史一层压一层）。

export const SEAL_ERA_ORDER: SealEra[] = ['qin', 'xin', 'weijin', 'liaojin'];

export const SEAL_ERA_LAYERS: Record<SealEra, SealEraLayer> = {
  qin: {
    era: 'qin',
    dynasty: '秦',
    script: '小篆',
    technique: '阴刻',
    text: '受命于天，既寿永昌',
    note: '始皇初制，李斯篆文，虫鱼鸟迹，刻于蓝田玉。'
  },
  xin: {
    era: 'xin',
    dynasty: '汉新',
    script: '摹印篆',
    technique: '补铸',
    text: '',
    note: '王莽逼孝元太后投玺，玺崩一角，以黄金镶补 —— 金镶玉自此始。'
  },
  weijin: {
    era: 'weijin',
    dynasty: '魏晋十六国',
    script: '八分汉隶 / 魏碑',
    technique: '加刻',
    text: '大魏受汉传国之宝',
    note: '曹丕于玺肩刻八分汉隶「大魏受汉传国之宝」；后赵石勒加刻魏碑「天命在赵」。'
  },
  liaojin: {
    era: 'liaojin',
    dynasty: '辽金',
    script: '无',
    technique: '水蚀',
    text: '',
    note: '玺随辽主沉于桑干河，砂水百年，字口圆钝，玉理尽开。'
  }
};

/** 魏晋层的第二道刻痕（石勒加刻），单独存一句，避免主文案被污染 */
export const SEAL_WEIJIN_SECOND_INSCRIPTION = '天命在赵';

// ── 拆解（Exploded）位移参数 ─────────────────────────────────────────
// 「黄金角拔出 + 燕尾倒勾槽特写」：金角沿体对角线斜向外拔，
// 露出燕尾槽；燕尾榫同步抽出，机位推近到槽口。
export const SEAL_EXPLODE = {
  /** 金镶角沿 (1,·,1) 方向外拔的距离 */
  goldCornerOut: 1.15,
  /** 金镶角同时抬升 */
  goldCornerLift: 0.62,
  /** 五龙钮整体抬升 */
  knobLift: 1.05,
  /** 燕尾榫抽出距离（沿槽向） */
  dovetailPull: 0.78,
  /** 印台本体为参照，不动 */
  bodyOffset: 0,
  /** 拆解动画时长（秒） */
  duration: 1.8
} as const;

/**
 * 真实 GLB 资产的拆解位移（与占位几何不同）。
 *
 * 真资产里的燕尾槽是**竖直贯穿**整条印台（这是倒勾的本义：横向拔不出来，
 * 只能顺着槽拔），所以金角的拆解必须沿 +Y 滑出，行程要 ≥ 印台高 1.485，
 * 否则拔不出槽口、穿模。
 */
export const SEAL_GLB_EXPLODE = {
  /** 金角沿 +Y 滑出行程（须 ≥ SEAL_BODY_HEIGHT = 1.485） */
  cornerLift: 1.75,
  /** 滑出时带一点外倾，让人看出"拔"的方向而不是"飘" */
  cornerTiltOut: 0.18,
  /** 五龙钮整体抬升（先摘钮，再拔角，工序不能反） */
  knobLift: 1.05
} as const;

/** 拓印（Stamping）下压参数 */
export const SEAL_STAMP = {
  /** 下压行程（世界单位） */
  drop: 1.6,
  /** 下压 + 回升总时长（秒） */
  duration: 1.35,
  /** 触地（出印）发生在进度 0.45 处 */
  contactAt: 0.45,
  /** 印痕边长 —— 印面方四寸，落到地上正好一格 */
  size: SEAL_SIDE,
  /** 淡入（秒） */
  fadeIn: 0.28,
  /** 保持（秒） */
  hold: 7.0,
  /** 淡出（秒） */
  fadeOut: 2.6,
  /** 同屏最多留几枚印（环形复用） */
  maxStamps: 5,
  /**
   * 默认落印点：**坛体西侧台基上**。
   * 必须落在 PYRAMID_HALF 之外 —— 坛心正下方就是中空方锥的空腔，
   * 印痕盖在那儿只会被锥壳挡住，谁也看不见。
   */
  home: { x: -(PYRAMID_HALF + 2.2), y: 0.04, z: PLINTH_HALF * 0.4 },
  /** 朱砂色 */
  cinnabar: '#c1272d'
} as const;

// ── 材质 ────────────────────────────────────────────────────────────
// MeshStandardMaterial 不支持次表面散射：玉的"油脂光泽"本质是纤维交织的
// 次表面 + 表面绒感，所以这里必须上 MeshPhysicalMaterial，用 sheen 起步。
// transmission（真透射）是**高质档开关**，默认关闭：它要额外一遍帧缓冲，
// 公共仪式 30 分钟长跑不划算。接口留着，导演切档位即可开。

export const SEAL_JADE_MATERIAL = {
  color: 0x9ad9b8,
  roughness: 0.25, // 玉体 0.2~0.3
  metalness: 0.0,
  /** 次表面起步：sheen 表现玉的油脂光泽 */
  sheen: 1.0,
  sheenRoughness: 0.32,
  sheenColor: 0xdff7e9,
  clearcoat: 0.35,
  clearcoatRoughness: 0.28,
  /** 玉的折射率约 1.58~1.62 */
  ior: 1.6,
  specularIntensity: 1.0,
  envMapIntensity: 0.9
} as const;

/** 高质档：透射（默认关）。开档时把这几项并进玉体材质。 */
export const SEAL_TRANSMISSION_PRESET = {
  enabled: false,
  transmission: 0.86,
  thickness: 1.6,
  attenuationDistance: 2.2,
  attenuationColor: 0x6fae8f,
  ior: 1.58
} as const;

/** 黄金补角：真金属，metalness 拉满 */
export const SEAL_GOLD_MATERIAL = {
  color: 0xffd27a,
  metalness: 1.0,
  roughness: 0.18,
  envMapIntensity: 1.2
} as const;

/** 燕尾槽（阴）：暗、不反光，用来衬金角的亮 */
export const SEAL_SOCKET_MATERIAL = {
  color: 0x0a1410,
  roughness: 0.9,
  metalness: 0.1
} as const;

// ── LOD ────────────────────────────────────────────────────────────
// 三级 LOD + DRACO 接口。程序化占位几何本身远低于预算，
// 但接口必须在，等 imperial_seal.glb 进来时直接接管。

export const SEAL_LOD_DISTANCE: Record<SealLod, number> = {
  high: 30,
  medium: 70,
  low: Number.POSITIVE_INFINITY
};

/** 微雕细节全部走 Normal 贴图，不建几何 —— 这是守住 150K tris 的办法 */
export const SEAL_NORMAL_MAP_SIZE = 256;

// ── 资产（暂无产出，接口先立）────────────────────────────────────────

/** 高精资产路径。文件不存在时 loadSealFromGLB 会安全失败并保留占位几何。 */
export const SEAL_GLB_URL = '/models/imperial_seal.glb';
/** DRACO 解码器目录（把 three 的 examples/jsm/libs/draco/ 拷到 public 下） */
export const SEAL_DRACO_PATH = '/draco/';

// ── 机位 ────────────────────────────────────────────────────────────
// ⚠️ AltarScene.animate() 第 1.5 步有硬编码相机安全边界：
//      p.y < 0.3          → 判过低，拉回上一安全位
//      p.length() > 120   → 判过远，拉回上一安全位
// 下面 safeMinY / safeMaxRadius 与之**对齐同值**，所有机位先按这组边界
// 夹一次再落地；边界若改，只改这里（参数化的唯一入口）。
export const SEAL_CAMERA_SAFETY = {
  minY: 0.3,
  maxRadius: 120,
  /** OrbitControls.minDistance = 0.8，特写不能贴得比这更近 */
  minDistance: 0.9
} as const;

/** 三档特写机位（相对悬浮玺台的局部偏移） */
export const SEAL_CAMERA_POSES = {
  /** 全景：斜前方看悬浮玺台 */
  overview: { offset: { x: 6.2, y: 3.4, z: 8.6 }, lookAtY: 0 },
  /** 拆解：推到燕尾倒勾槽口 */
  exploded: { offset: { x: 2.1, y: 0.9, z: 3.0 }, lookAtY: 0.35 },
  /** 拓印：略俯视，看印面与地面印痕 */
  stamping: { offset: { x: 3.4, y: 5.2, z: 6.4 }, lookAtY: -1.8 }
} as const;

/** 机位过渡速度（每秒 lerp 系数） */
export const SEAL_CAMERA_LERP = 2.4;

/** 玉玺自带柔光（悬浮玺台的"供奉光"） */
export const SEAL_LIGHT = {
  color: 0xd8fff0,
  intensity: 6.5,
  distance: 16,
  /** 光位相对悬浮中心的偏移 */
  offsetY: 2.4
} as const;
