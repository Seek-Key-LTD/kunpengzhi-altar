#!/usr/bin/env python3
"""校验 GLB：对象名、三角面、各部件世界 AABB（含 rotation/scale）。"""
import json
import os
import struct
import sys


def load_glb(path):
    d = open(path, "rb").read()
    assert d[:4] == b"glTF", "不是 GLB"
    off, chunks = 12, {}
    while off < len(d):
        ln, kind = struct.unpack("<I4s", d[off:off + 8])
        chunks[kind] = d[off + 8:off + 8 + ln]
        off += 8 + ln + (-ln % 4)
    return json.loads(chunks[b"JSON"])


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    # v' = v + 2w(q×v) + 2q×(q×v)
    cx = y * vz - z * vy
    cy = z * vx - x * vz
    cz = x * vy - y * vx
    c2x = y * cz - z * cy
    c2y = z * cx - x * cz
    c2z = x * cy - y * cx
    return [vx + 2 * w * cx + 2 * c2x, vy + 2 * w * cy + 2 * c2y, vz + 2 * w * cz + 2 * c2z]


def main(path):
    j = load_glb(path)
    tot = 0
    print(f"{'对象':24s} {'三角面':>8s}  世界 AABB (min → max)")
    for n in j["nodes"]:
        if "mesh" not in n:
            continue
        m = j["meshes"][n["mesh"]]
        t = n.get("translation", [0, 0, 0])
        r = n.get("rotation", [0, 0, 0, 1])
        s = n.get("scale", [1, 1, 1])
        mn = [1e9] * 3
        mx = [-1e9] * 3
        tris = 0
        for p in m["primitives"]:
            a = j["accessors"][p["attributes"]["POSITION"]]
            tris += j["accessors"][p["indices"]]["count"] // 3
            for corner in (a["min"], a["max"]):
                v = [corner[i] * s[i] for i in range(3)]
                v = qrot(r, v)
                v = [v[i] + t[i] for i in range(3)]
                mn = [min(mn[i], v[i]) for i in range(3)]
                mx = [max(mx[i], v[i]) for i in range(3)]
        tot += tris
        print(f"{m.get('name'):24s} {tris:8d}  "
              f"[{', '.join(f'{v:7.3f}' for v in mn)}] → [{', '.join(f'{v:7.3f}' for v in mx)}]")
    print(f"\n总三角面 = {tot}")
    print(f"预算 150000 → {'OK' if tot <= 150000 else '超预算!'}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1
         else os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "..", "..", "public", "models", "imperial_seal.glb"))
