#!/usr/bin/env python3
"""传国玉玺资产生成器 —— 走 nuc 节点上的 Blender + OpenSCAD MCP 服务。

为什么要留这个脚本：`public/models/imperial_seal.glb` 是**生成物**，不是美术交付物。
生成的二进制不把生成器一起入库，下次要改尺寸/改刻痕就只能靠逆向 —— 那是维护陷阱。

用法:
    MCP_HOST=https://<blender-mcp-endpoint>/mcp python3 build_seal.py

流程（全部在 nuc 上执行，产物 base64 回传本机）:
    1. openscad_compile  → 玉体 / 金镶角 STL（CSG：方四寸 − 缺角 − 燕尾倒钩槽）
    2. blender_export    → 导入 STL + 建五龙钮 + 刻痕，导出 GLB
    3. base64 回传       → 写入 public/models/imperial_seal.glb

坐标系：OpenSCAD 与 Blender **都是 Z-up**，由 glTF 导出器的 export_yup=True
转成 Y-up（Blender Z → glTF Y）。所以脚本里所有 z 就是最终的"高"。
glTF 的 +Z 对应 Blender 的 −Y —— 缺角落在 glTF (+x, +z) 角，就是靠这条映射定的。
"""
import base64
import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SCAD = os.path.join(HERE, "seal_mechanical.scad")
BLENDER_SCRIPT = os.path.join(HERE, "build_blender.py")
LOCAL_OUT = os.path.join(REPO, "public", "models", "imperial_seal.glb")
REMOTE = "/tmp/seal_build"

HOST = os.environ.get("MCP_HOST", "").rstrip("/")
if not HOST:
    sys.exit("请用 MCP_HOST=<blender MCP endpoint> 指定服务地址（内网 tailnet 与公网地址见项目交接说明）")

# ── MCP streamable-http 极简客户端 ────────────────────────────────────
_sid = ""


def _post(body, sid=""):
    req = urllib.request.Request(
        HOST,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            **({"Mcp-Session-Id": sid} if sid else {}),
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=900) as resp:
        raw = resp.read().decode("utf-8", "replace")
        new_sid = resp.headers.get("Mcp-Session-Id")
    payload = None
    for line in raw.splitlines():
        if line.startswith("data: "):
            payload = json.loads(line[6:])
    return payload, new_sid


def init():
    global _sid
    payload, _sid = _post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "seal-builder", "version": "1"}},
    })
    print("session =", _sid)
    return payload


def call(tool, args, req_id=10):
    payload, _ = _post({
        "jsonrpc": "2.0", "id": req_id, "method": "tools/call",
        "params": {"name": tool, "arguments": args},
    }, _sid)
    if payload is None or "error" in payload:
        sys.exit(f"!! {tool} 调用失败: {payload}")
    result = payload.get("result", {})
    text = "".join(c.get("text", "") for c in result.get("content", []))
    try:
        return result, json.loads(text)
    except Exception:
        return result, {"stdout": text}


def fetch(remote_path, local_path, req_id=99):
    """借 blender_execute 把 nuc 上的文件 base64 回传（本机无 SSH 凭据）。"""
    script = (
        "import base64\n"
        f"data = open({remote_path!r}, 'rb').read()\n"
        "print('B64BEGIN' + base64.b64encode(data).decode() + 'B64END')\n"
    )
    _, info = call("blender_execute", {"script": script}, req_id)
    stdout = info.get("stdout", "")
    if "B64BEGIN" not in stdout:
        sys.exit("!! 未取到 base64：" + stdout[:600])
    blob = base64.b64decode("".join(stdout.split("B64BEGIN", 1)[1].split("B64END", 1)[0].split()))
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    open(local_path, "wb").write(blob)
    print(f"回传 OK -> {local_path} ({len(blob)} bytes)")


def main():
    init()
    _, sysinfo = call("get_system_info", {}, 2)
    print("nuc:", sysinfo.get("result", sysinfo))

    scad = open(SCAD).read()
    gold = scad.replace("\njade_body();\n", "\ngold_corner();\n")
    assert "gold_corner();" in gold and "jade_body();" not in gold

    print("== OpenSCAD: 玉体 ==")
    call("openscad_compile", {"scad_code": scad, "output_path": f"{REMOTE}/jade_body.stl"}, 3)
    print("== OpenSCAD: 金镶角 ==")
    call("openscad_compile", {"scad_code": gold, "output_path": f"{REMOTE}/gold_corner.stl"}, 4)

    print("== Blender: 组装 + 导出 ==")
    _, info = call("blender_export", {
        "script": open(BLENDER_SCRIPT).read(),
        "output_model_path": f"{REMOTE}/imperial_seal.glb",
        "export_format": "glb",
    }, 5)
    stdout = info.get("stdout", "")
    for line in stdout.splitlines():
        if any(k in line for k in ("FONT", "tris", "TOTAL", "OBJECTS", "缩放", "宽度", "EXPORT DONE")):
            print("   ", line.strip())

    fetch(f"{REMOTE}/imperial_seal.glb", LOCAL_OUT)

    # 本地复核：对象名 / 三角面 / 世界包围盒
    check = os.path.join(HERE, "check_glb.py")
    if os.path.exists(check) and not os.environ.get("SKIP_CHECK"):
        print("== 本地复核 ==")
        subprocess.run([sys.executable, check, LOCAL_OUT], check=False)


if __name__ == "__main__":
    main()
