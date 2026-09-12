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
// 砖 = 半格（BRICK = 1.5），每层高 1 砖、每边内收 1 砖 ⟹ 坡度恒为 1:1 = 精确 45°。
// 只砌每层最外面那一圈（暴露带），**中间 91 格全部空着** ⟹ 外壳是一座中空的
// 七级方锥，内部是一座递收的空腔（阴），镜头可入。
//
// 第 n 层每边 2n 砖，外圈一圈砖数 = 8n − 4，正好是席位数 2n − 1 的 4 倍
// （每席 = 4 块砖 = 1 格²）。

export const BRICK = 1.5; // 立方砖边长 = 半格
export const CELL = BRICK * 2; // 一格 = 2 砖 = 3.0
export const LAYERS = 7; // 七层
export const PYRAMID_HALF = (LAYERS * CELL) / 2; // 底座半宽 = 10.5
export const PYRAMID_TOP = LAYERS * BRICK; // 总高 = 10.5（= 半底，故 45°）

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
