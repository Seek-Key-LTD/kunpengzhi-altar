// 传国玉玺 · 机械部分（CSG）—— 单位：1 寸 = 0.75
//
// 坐标：X/Y 水平，Z 向上。OpenSCAD 与 Blender **都是 Z-up**，无需旋转。
// 燕尾槽沿 Z 贯穿 —— 金角只能**沿槽向（竖直）**滑进滑出，
// 这正是"倒勾"的意义：横向拔不出来，只能顺着槽拔。Exploded 位移据此定。

SIDE = 3.0;      // 方四寸
BH = 1.485;      // 印台高（通高 2.7 的 55%）
NOTCH = 0.9;     // 缺角边长（1.2 寸）
HALF = SIDE / 2; // 1.5
R = 0.12;        // 外角圆角
OVER = 2;        // 贯穿切余量

DT_D = 0.18;     // 燕尾槽深（沿壁法向伸入玉体）
DT_M = 0.40;     // 槽口宽
DT_W = 0.60;     // 槽底宽（> 口宽 ⟹ 倒勾）
DT_C = 1.05;     // 槽中心（沿另一水平轴）

/** 圆角方柱：四角各一根圆柱取 hull */
module rounded_prism(s, h, r) {
  hull() {
    for (sx = [-1, 1]) for (sy = [-1, 1])
      translate([sx * (s / 2 - r), sy * (s / 2 - r), 0])
        cylinder(h = h, r = r, $fn = 12);
  }
}

/** 缺角所在的象限：x > 0.6 且 **y < -0.6**
 *  注意符号：glTF 导出时 Blender 的 +Y → glTF 的 −Z，
 *  所以想让缺角落在 glTF 的 (+x, +z) 角，Blender 侧必须放在 −y。 */
module corner_quadrant(z_extra) {
  translate([1.8, -1.8, BH / 2])
    cube([2.4, 2.4, BH + z_extra], center = true);
}

/** 燕尾槽 A：开在 x = +0.6 壁面（该壁只在缺口一侧存在），槽底朝 -x 伸入玉体。
 *  槽中心线必须**跟着缺口方位**走到 y = −1.05，否则会挖进玉体内部成暗腔。 */
module dovetail_slot_x() {
  xm = HALF - NOTCH;              // 0.60 壁面
  xi = xm - DT_D;                 // 0.42 槽底
  yc = -(HALF - NOTCH / 2);       // −1.05 槽中心（跟随缺口）
  polygon(points = [
    [xm, yc - DT_M / 2],
    [xi, yc - DT_W / 2],
    [xi, yc + DT_W / 2],
    [xm, yc + DT_M / 2]
  ]);
}

/** 燕尾槽 B：开在 y = −0.6 壁面，槽底朝 +y 伸入玉体（与缺口侧对称） */
module dovetail_slot_y() {
  ym = -(HALF - NOTCH);   // −0.60 壁面
  yi = ym + DT_D;         // −0.42 槽底
  polygon(points = [
    [DT_C - DT_M / 2, ym],
    [DT_C - DT_W / 2, yi],
    [DT_C + DT_W / 2, yi],
    [DT_C + DT_M / 2, ym]
  ]);
}

/** 玉体：方柱 − 缺角 − 两道燕尾槽 */
module jade_body() {
  difference() {
    rounded_prism(SIDE, BH, R);
    corner_quadrant(OVER);
    translate([0, 0, -OVER / 2]) linear_extrude(height = BH + OVER) dovetail_slot_x();
    translate([0, 0, -OVER / 2]) linear_extrude(height = BH + OVER) dovetail_slot_y();
  }
}

/** 金镶角：缺角补形 + 两枚燕尾榫。**只取印台高度**，不做贯穿余量 */
module gold_corner() {
  union() {
    intersection() {
      rounded_prism(SIDE, BH, R);
      corner_quadrant(OVER);
    }
    linear_extrude(height = BH) dovetail_slot_x();
    linear_extrude(height = BH) dovetail_slot_y();
  }
}

jade_body();
