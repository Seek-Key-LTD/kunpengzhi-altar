import React from 'react';

/**
 * #7 · 静默层 —— 无画路径（`tier='none'`）下换上的那一层。
 *
 * 设计说明书 §2.1：降级下**保留** 1800s 时间轴、雾中字幕（DOM）、音频，
 * 只去掉 3D 画面 ⇒ 默认口径「**有声、有字幕、无画**」。本组件只负责「画」的那部分：
 * 一句定场诗 + 一句副行 + 一行静置。
 *
 * ⚠️ 三条硬规矩（改动前请先看 `docs/design/007-webgl-degradation.md` §2.3）：
 *   1. 上屏文案由**主理人裁定**，工程不得自拟 / 增删 / 改写一字；
 *   2. 不得出现任何工程字样（WebGL / 不支持 / 错误 / 请升级浏览器 / 调试 / 降级 / 重试 …），
 *      并须避开 `scripts/qa-audit-public-entry.mjs` 的 `SCAN_WORDS` 与
 *      `scripts/verify-entry-isolation.mjs` 的 `ADMIN_WORDS / CONSOLE_MARKERS`；
 *   3. 静置行**无按钮、无倒计时、不可点**：不挂 onClick，`cursor: default`，
 *      `.ritual-veil` 整层 `pointer-events: none`。
 *
 * DOM class 一律 `ritual-veil*`（禁用含 `webgl` / `fallback` 的 class 名）。
 * 视觉气质复用 `src/index.css` 的 `.ritual-landing`（radial-gradient 深底 +
 * clamp() 字号 + `ritual-landing-in` 渐入）。
 */
export const WebglFallback: React.FC = () => (
  <div className="ritual-veil">
    <div className="ritual-veil__content">
      <p className="ritual-veil__title">坛不设形，声自往还。</p>
      <p className="ritual-veil__line">此刻唯余字与音。</p>
    </div>
    <p className="ritual-veil__still">静听即可。</p>
  </div>
);

export default WebglFallback;
