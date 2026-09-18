// 华夏祭坛 · 无头视觉取证入口（#7 前置）
//
// 在真浏览器（无头 Chromium，WebGL2 经 ANGLE/SwiftShader）里实例化**真** AltarScene，
// 并把控制权挂到 window.__capture 上，供 tools/capture/capture.mjs（Playwright 驱动）调用。
//
// 两个取样语义：
//   · seek(t) —— 把内部时钟与全部派生状态一次性摆到 t（AltarScene.seekTo），用于 #2 首/中/末席静态取证
//   · start(r) —— 给 1800s 时间轴设回放速率，用于 #7 全程录屏（1800/r 秒真跑）
//
// ⚠️ 不进 dist、不打包进 App：本文件不被 index.html 引用，vite build 只以 index.html 为入口。

import { AltarScene } from '../../src/three/AltarScene';
import { INITIAL_SPIRAL_EVENTS } from '../../src/data/spiral_events';
import { ritualPhaseAt, ritualLitSeatsAt, RITUAL_TOTAL_SEC } from '../../src/types/altar';
import '../../src/index.css'; // 复用生产字幕样式（.ritual-caption），保证取真画面

interface CaptureApi {
  /** 摆位到给定秒（对齐内部时钟）。 */
  seek: (sec: number) => number;
  /** 启动/调整回放速率（真跑）。 */
  start: (rate: number) => number;
  /** 当前仪式时间（秒）。 */
  time: () => number | null;
  /** 当前回放速率。 */
  rate: () => number;
  /** 纯函数：sec → 幕次。 */
  phaseAt: (sec: number) => string;
  /** 纯函数：sec → 已触发席数。 */
  litSeatsAt: (sec: number) => number;
  TOTAL: number;
}

declare global {
  interface Window {
    __altar?: AltarScene;
    __altarReady?: boolean;
    __capture?: CaptureApi;
  }
}

const container = document.getElementById('capture-root');
if (!container) {
  throw new Error('capture-root 容器未找到');
}

const altar = new AltarScene(container, INITIAL_SPIRAL_EVENTS);
// 导演档：公共仪式同一条 1800s 时间轴；速度/取景均按工程入口放开。
altar.setRole('director');
altar.startRitual();
window.__altar = altar;

window.__capture = {
  seek: (sec: number) => altar.seekTo(sec),
  start: (rate: number) => altar.setPlaybackRate(rate),
  time: () => altar.currentRitualTime,
  rate: () => altar.playbackRate,
  phaseAt: (sec: number) => ritualPhaseAt(sec),
  litSeatsAt: (sec: number) => ritualLitSeatsAt(sec),
  TOTAL: RITUAL_TOTAL_SEC
};

window.__altarReady = true;
console.log(`[capture] AltarScene ready; RITUAL_TOTAL_SEC=${RITUAL_TOTAL_SEC}s`);
