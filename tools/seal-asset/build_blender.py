import bpy, math, os

REMOTE = "/tmp/seal_build"
OUT_GLB = "/tmp/seal_build/imperial_seal.glb"

# Blender 是 Z-up：这里所有 z 就是最终的"高"。
BODY_Z0 = -1.35        # 印台底（印面）
BODY_Z1 = 0.135        # 印台顶
KNOB_H = 1.215         # 五龙钮高 ⟹ 通高 = 2.7，整尊 z ∈ [-1.35, 1.35]

bpy.ops.wm.read_factory_settings(use_empty=True)

# ── 字体：nuc 有霞鹜文楷与 Noto CJK（无小篆/汉隶专体，降级用楷）────────
FONT_CANDIDATES = [
    "/home/ben/.local/share/fonts/lxgw-wenkai/LXGWWenKai-Regular.ttf",
    "/usr/share/fonts/google-noto-serif-cjk-vf-fonts/NotoSerifCJK-VF.ttc",
]
FONT = next((p for p in FONT_CANDIDATES if os.path.exists(p)), "")
print("FONT =", FONT)

def import_stl(path, name):
    bpy.ops.wm.stl_import(filepath=path)
    obj = bpy.context.selected_objects[0]
    obj.name = name
    obj.data.name = name
    # OpenSCAD 的 z ∈ [0, BH] 平移到 [BODY_Z0, BODY_Z1]；Z-up 对 Z-up，不旋转
    obj.location = (0.0, 0.0, BODY_Z0)
    return obj

jade = import_stl(f"{REMOTE}/jade_body.stl", "jade_body")
gold = import_stl(f"{REMOTE}/gold_corner.stl", "gold_corner")
print("jade tris =", len(jade.data.polygons))
print("gold tris =", len(gold.data.polygons))

# ── 五龙钮（有机部分用 Blender）：钮座 + 5 条管状龙身 + 锥形龙头 ──────
knob_parts = []

def add_cone(r1, r2, h, z, verts=20, name="knob_seg"):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r1, radius2=r2, depth=h, location=(0, 0, z + h / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    knob_parts.append(o)
    return o

add_cone(0.66, 0.62, 0.26, BODY_Z1, name="knob_base")            # 钮座
add_cone(0.62, 0.42, 0.50, BODY_Z1 + 0.26, name="knob_waist")    # 束腰
add_cone(0.42, 0.30, 0.24, BODY_Z1 + 0.76, name="knob_neck")     # 颈

bpy.ops.mesh.primitive_uv_sphere_add(
    segments=16, ring_count=10, radius=0.30, location=(0, 0, BODY_Z1 + 1.02))
cap = bpy.context.active_object
cap.name = "knob_cap"
cap.data.name = "knob_cap"
knob_parts.append(cap)

def dragon_tube(points, radius, u_res, name):
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3        # 6 边管，压面数
    curve.resolution_u = u_res
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for i, p in enumerate(points):
        spline.points[i].co = (p[0], p[1], p[2], 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object

def dragon_head(pos, name):
    bpy.ops.mesh.primitive_cone_add(
        vertices=6, radius1=0.085, radius2=0.0, depth=0.24, location=pos)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o

dragons = []
for i in range(5):
    is_crown = (i == 4)
    if is_crown:
        ang0, radius, z0, rise = 0.0, 0.14, BODY_Z1 + 1.02, 0.30
    else:
        ang0 = i * math.pi / 2
        radius, z0, rise = 0.56, BODY_Z1 + 0.10, 0.86
    pts = []
    for s in range(7):
        t = s / 6.0
        a = ang0 + (t * math.pi * 1.7 if is_crown else t * 1.35 - 0.55)
        r = radius + math.sin(t * math.pi) * (0.18 if is_crown else 0.12)
        pts.append((math.cos(a) * r, math.sin(a) * r, z0 + t * rise))
    dragons.append(dragon_tube(pts, 0.055, 12, f"dragon_{i}"))
    dragons.append(dragon_head(pts[-1], f"dragon_head_{i}"))

bpy.ops.object.select_all(action="DESELECT")
for o in knob_parts + dragons:
    o.select_set(True)
bpy.context.view_layer.objects.active = knob_parts[0]
bpy.ops.object.join()
knob = bpy.context.active_object
knob.name = "dragon_knob"
knob.data.name = "dragon_knob"

# 龙身盘绕的曲线是"估着摆"的，实际高度未必正好等于 KNOB_H；
# 这里按实测包围盒等比缩到**恰好** KNOB_H，并把底面重新贴回印台顶 ——
# 通高 2.7 是规格，不能因为一条龙多冒 0.2 就破了。
from mathutils import Vector  # noqa: E402
bpy.context.view_layer.update()
bb = [knob.matrix_world @ Vector(c) for c in knob.bound_box]
zmin = min(v.z for v in bb)
zmax = max(v.z for v in bb)
actual = zmax - zmin
k = KNOB_H / actual
bpy.ops.object.select_all(action="DESELECT")
knob.select_set(True)
bpy.context.view_layer.objects.active = knob
bpy.ops.object.transform_apply(location=False, rotation=False, scale=False)
knob.scale = (k, k, k)
bpy.context.view_layer.update()
bb = [knob.matrix_world @ Vector(c) for c in knob.bound_box]
new_min = min(v.z for v in bb)
knob.location.z += BODY_Z1 - new_min
bpy.context.view_layer.update()
bb = [knob.matrix_world @ Vector(c) for c in knob.bound_box]
print("knob tris =", len(knob.data.polygons),
      "| 缩放", round(k, 4), "| z 范围", round(min(v.z for v in bb), 4),
      "→", round(max(v.z for v in bb), 4))

# ── 刻痕：CJK 文本 → 网格 ─────────────────────────────────────────────
INK = bpy.data.materials.new("seal_ink")
INK.use_nodes = True
bsdf = INK.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.05, 0.11, 0.08, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0

def make_text(text, name, width, height, location, rotation, extrude=0.0):
    """宽高**双约束**取小者：只按宽度会把两行文字撑出印台顶。"""
    bpy.ops.object.text_add(location=(0, 0, 0))
    to = bpy.context.active_object
    to.data.body = text
    to.data.font = bpy.data.fonts.load(FONT)
    to.data.align_x = "CENTER"
    to.data.align_y = "CENTER"
    to.data.size = 1.0
    to.data.resolution_u = 3          # 低分辨率，压面数
    to.data.extrude = extrude
    to.data.bevel_depth = 0.0
    to.data.space_line = 1.15
    bpy.context.view_layer.objects.active = to
    to.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    d = obj.dimensions
    s = min(width / max(d[0], 1e-6), height / max(d[1], 1e-6))
    obj.scale = (s, s, 1.0)
    obj.rotation_euler = rotation
    obj.location = location
    print(f"  {name}: 宽度 {d[0] * s:.3f} × 高 {d[1] * s:.3f}")
    return obj

# 秦 · 印面「受命于天，既寿永昌」：**真阴刻** —— 布尔从玉体挖掉。
# 挖出来的刻痕与玉体同体（秦刻是原刻，历代不磨，所以本就不该被断代层关掉）。
cutter = make_text("受命于天\n既寿永昌", "cutter_qin", 2.6, 2.6,
                   (0, 0, BODY_Z0 + 0.03), (0, math.radians(180), 0), extrude=0.03)
if cutter is not None:
    mod = jade.modifiers.new("inscription_qin", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.context.view_layer.objects.active = jade
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    print("boolean qin ok, jade tris =", len(jade.data.polygons))

# 魏晋 · 曹丕八分汉隶「大魏受汉传国之宝」：玺肩，glTF +Z 面对应 Blender −Y 面。
# 命名统一用 era_ 前缀 —— 千万别叫 inscription_weijin_*：
# 名字里带 'jin' 会被"含 jin 即金"的材质规则误判成黄金。
make_text("大魏受汉\n传国之宝", "era_wei_a", 1.9, 0.95,
          (0, -1.505, -0.45), (math.radians(90), 0, 0))
# 魏晋 · 石勒魏碑「天命在赵」：玺肩 +X 面
make_text("天命在赵", "era_wei_b", 2.3, 0.55,
          (1.505, 0, -0.35), (math.radians(90), 0, math.radians(90)))
for nm in ("era_wei_a", "era_wei_b"):
    o = bpy.data.objects.get(nm)
    if o:
        o.data.materials.append(INK)

# 汉新（金镶玉）就是 gold_corner 自身；辽金（桑干河水蚀）属微雕，
# 在 Three.js 侧由 applyEra 把玉体 roughness 调哑来表现，不建几何。

print("OBJECTS =", [o.name for o in bpy.data.objects])
print("TOTAL TRIS =", sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH"))

os.makedirs(REMOTE, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format="GLB",
    export_apply=True, export_yup=True,
    export_materials="EXPORT", export_normals=True)
print("EXPORT DONE", OUT_GLB)
