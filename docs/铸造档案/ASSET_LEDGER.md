# 华夏祭坛资产总账（ASSET LEDGER）

> Issue: #12
> 版本：v1
> 最后更新：2026-09-21

## 核心资产清单

| 资产 | 类型 | 源文件 | 产物 | 首次引入 commit | 当前 hash |
|---|---|---|---|---|---|
| 传国玉玺 GLB | 3D 模型 | `tools/seal-asset/build_blender.py`、`tools/seal-asset/build_seal.py`、`tools/seal-asset/seal_mechanical.scad` | `public/models/imperial_seal.glb` | `fc51c0f` | `34ad46b6e79bce41184ace1be2f0bd5cd49d066d2df6800c8d5bad04256f0934` |
| 祭坛几何 | 代码 | `src/data/altarGeometry.ts` | - | - | - |
| 双桶水梯 | 代码 | `src/three/AltarWaterLiftEngine.ts`、`src/three/MechanicsRig.ts` | - | - | - |
| 走马灯 | 代码 | `src/three/MaglevRig.ts` | - | - | - |
| 声音系统 | 代码 | `src/audio/altarAudio.ts`、`src/audio/phaseEnvelope.ts` | - | - | - |
| 五绝赋朗诵 | 音频 | Cloudflare Worker `/ritual-audio/chap_NN.mp3` | - | - | - |
| 剧本 | 数据 | `src/data/tea_poem_16.ts` | - | - | - |
| 部署包 | 构建 | `npm run build` | `dist/` | - | - |

## 设计规格文档

| 文档 | 路径 |
|---|---|
| 核心规范 | `docs/祭坛核心规范_v2.0_长歌当哭双龙咬合与三十分钟仪式导演台本.md` |
| 荣誉座次表 | `docs/荣誉座次表规范.md` |
| 身份与相机权限 | `docs/身份与相机权限规范.md` |
| 双桶水梯 RFC | `docs/RFC-007-中空神索_双体变质量阿特伍德振子.md` |
| 走马灯 RFC | `docs/RFC-008-外环超导磁通钉扎悬浮走马灯动力系统.md` |
| 发布拓扑 | `docs/release/topology.md` |
| 环境契约 | `docs/release/environment-contract.md` |
