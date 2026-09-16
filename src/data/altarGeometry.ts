// 华夏祭坛 · 几何常量（全坛唯一建材：立方砖）
//
// ── 为什么必须是完全平方数 ───────────────────────────────────────────
// 七层，第 n 层（n = 1 顶 … 7 底）是边长 n 格的正方形。相邻两层**每边差 1/2 格**：
//     1 与 2 差 1/2，2 与 3 差 1/2 …… 6 与 7 差 1/2
// 于是第 n 层朝天暴露出来的那圈带子 = n² − (n−1)² = 2n − 1：
//     1、3、5、7、9、11、13     ← 一共 49 席
// 这就是 7² 的伸缩和：(7²−6²) + (6²−5²) + … + (1²) = 49。
// 标称实心 7 层方锥 = 1²+2²+…+7² = 140 格；其中暴露带 49 格、内部 91 格（= 1²+…+6²）。
//
// ── 砌法 ────────────────────────────────────────────────────────────
// 一个格就是一个 Cube：横向、纵向、深度严格同边长。49 根柱的顶面恰好拼成
// 7×7 无缝平面，不存在“席位之间漏一条黑缝”的第二种砖。

export const BRICK = 3.0; // 全坛唯一基本能量 Cube 的边长
export const CELL = BRICK; // 一席 = 一 Cube；相邻 Cube 面贴面
export const LAYERS = 7; // 七层
export const PYRAMID_HALF = (LAYERS * CELL) / 2; // 底座半宽 = 10.5
export const PYRAMID_TOP = LAYERS * BRICK; // 总高 = 21，七层 Cube

export const PLINTH_HALF = 15; // 台基半宽
export const PLINTH_THICKNESS = 1.2;
export const RIVER_WIDTH = CELL; // 河宽 = 1 格
export const RIVER_HALF_LENGTH = PLINTH_HALF + 3;

/** 第 n 层（1 = 顶 … 7 = 底）的层顶高程 */
export function layerTop(n: number): number {
  return (LAYERS - n + 1) * BRICK;
}

/** 第 n 层每边砖数 */
export function layerSideBricks(n: number): number {
  return 2 * n;
}

/** 第 n 层暴露带上的席位数 = 2n − 1 */
export function layerSeatCount(n: number): number {
  return 2 * n - 1;
}

/**
 * 第 n 层外圈砖块，按环形顺序返回（砖坐标 bx,bz ∈ [0, 2n−1]）。
 * 砖数 = 8n − 4 = 4 × 席位数。
 */
export function layerRingBricks(n: number): Array<{ bx: number; bz: number }> {
  const side = layerSideBricks(n);
  const out: Array<{ bx: number; bz: number }> = [];
  for (let bx = 0; bx < side; bx++) out.push({ bx, bz: 0 });
  for (let bz = 1; bz < side; bz++) out.push({ bx: side - 1, bz });
  for (let bx = side - 2; bx >= 0; bx--) out.push({ bx, bz: side - 1 });
  for (let bz = side - 2; bz >= 1; bz--) out.push({ bx: 0, bz });
  return out;
}

/** 砖坐标 → 世界坐标（格为单位，以坛心为原点） */
export function brickToCell(bx: number, bz: number, n: number): { x: number; z: number } {
  const half = (layerSideBricks(n) - 1) / 2;
  return { x: (bx - half) / 2, z: (bz - half) / 2 };
}

/**
 * 方环中心线上的取点：从南边中点 (0, +a) 出发，逆时针（先向 +x）。
 * a = 半宽，周长 = 8a。
 */
export function pointOnSquareRing(a: number, s: number): { x: number; z: number } {
  const side = 2 * a;
  const P = 8 * a;
  let t = ((s % P) + P) % P;

  if (t < a) return { x: t, z: a }; // 南边 右半
  t -= a;
  if (t < side) return { x: a, z: a - t }; // 东边
  t -= side;
  if (t < side) return { x: a - t, z: -a }; // 北边
  t -= side;
  if (t < side) return { x: -a, z: -a + t }; // 西边
  t -= side;
  return { x: -a + t, z: a }; // 南边 左半
}

// ── 席位：7×7 方形螺旋，等距 ─────────────────────────────────────────
//
// 49 席铺在 7×7 的整数格上，按**方形螺旋序**编号：第 1 席在正中，
// 然后一路绕出去。方形螺旋每走一步正好 1 格，
// 所以「从头到尾、任意相邻两席之间的距离」恒等于 1 格 —— 这才是间距相等。
//
// 49 = 7 级 × 每级 7 席。沿螺旋连续 7 步算一级，每级比上一级低 1 砖，
// 水从第 1 席一路绕到第 49 席；注意它走的是嵌入 Cube 阴腔的蝎子楔，
// 而不是阳 Cube 的外露顶面。

/** 7×7 方形螺旋坐标（1 在正中，每步 1 格） */
export function ulamCoords(total: number): Array<{ x: number; z: number }> {
  const coords: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
  let x = 0;
  let z = 0;
  let step = 1;

  while (coords.length < total) {
    for (let i = 0; i < step && coords.length < total; i++) { x += 1; coords.push({ x, z }); }
    for (let i = 0; i < step && coords.length < total; i++) { z += 1; coords.push({ x, z }); }
    step += 1;
    for (let i = 0; i < step && coords.length < total; i++) { x -= 1; coords.push({ x, z }); }
    for (let i = 0; i < step && coords.length < total; i++) { z -= 1; coords.push({ x, z }); }
    step += 1;
  }

  return coords.slice(0, total);
}

/** 每级台阶几席（49 = 7 × 7） */
export const SEATS_PER_LEVEL = 7;

/**
 * 每级台阶的累计席号上界。
 *
 * 方形螺旋的四圈分别是 1、8、16、24 席（第 1 席 + 三圈）。
 * 切成 7 级、每级都是螺旋上连续的一段，只能这样切：
 *   1 ｜ 4 4 ｜ 8 8 ｜ 12 12
 * 于是**每一圈都横跨两级**，同一圈沿螺旋走半圈就下沉一截 —— 这就是"下垂的弧度"。
 */
export const LEVEL_BOUNDS = [1, 5, 9, 17, 25, 37, 49];

/** 席号（1..49）→ 台阶级号（1 = 顶 … 7 = 底） */
export function seatLevel(seatId: number): number {
  for (let i = 0; i < LEVEL_BOUNDS.length; i++) {
    if (seatId <= LEVEL_BOUNDS[i]) return i + 1;
  }
  return LEVEL_BOUNDS.length;
}

/**
 * 每席沿螺旋下沉的量。
 *
 * 第 1 席最高（塔顶），第 49 席最低（贴台基），中间 48 步均分。
 * 高程属于**内部水路**，不是把阳 Cube 外表面削成斜坡。
 */
export const DROP_PER_SEAT = (PYRAMID_TOP - BRICK) / (SEATS_PER_LEVEL * 7 - 1);

/** 席号 → 该席台面高程（连续螺旋坡） */
export function seatElevation(seatId: number): number {
  return PYRAMID_TOP - (seatId - 1) * DROP_PER_SEAT;
}

/** 台面沿螺旋方向的坡度（弧度）—— 物理台面与视觉台面用同一个值 */
/**
 * 阴蝎子楔：嵌入每个阳 Cube 的连续水工内件。
 *
 * 外壳仍是完整等边 Cube；楔的光滑腹面、两侧收水壁和尾针接口都藏在阴腔中。
 * 每一席的管芯中心固定在顶层 Cube 内部，不得越过任何外露面。
 */
export const SCORPION_BORE_RADIUS = BRICK * 0.075;
export const SCORPION_CASING_RADIUS = BRICK * 0.13;
export const SCORPION_EMBED_DEPTH = BRICK * 0.56;

/** 席位 n 的蝎子楔水芯高程；严格随 n 增大而下降。 */
export function scorpionWaterElevation(seatId: number): number {
  return seatElevation(seatId) - SCORPION_EMBED_DEPTH;
}

/**
 * 穿坛河的七个方位：不是随手画出的中轴线，而是 Ulam 方阵的 x = 0 轴。
 * 46→23→8→1 为暗渠提升段；1→4→15→34 为坛面重力明渠。
 */
export const RIVER_AXIS_SEATS = [46, 23, 8, 1, 4, 15, 34] as const;
export const RIVER_LIFT_SEATS = [46, 23, 8, 1] as const;
export const RIVER_GRAVITY_SEATS = [1, 4, 15, 34] as const;

/** 横向兔子洞：缩尺访客从 40 进、穿过 1、从 28 出。 */
export const RABBIT_HOLE_SEATS = [40, 19, 6, 1, 2, 11, 28] as const;
