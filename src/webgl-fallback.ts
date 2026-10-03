/**
 * #7 WebGL 无 React 降级页（遗留导出，运行时已由 tier 声幕接管）
 *
 * ⚠️ 归属说明（防双实现漂移）：
 *   - 运行时降级路径 = `src/three/webglCapability.ts` 三态探测 + `App.tsx` 兜底 +
 *     `src/components/WebglFallback.tsx`（`tier='none'` 声幕层）。
 *   - 本文件的 `renderSilentFallback()` 只服务无 React 的静态宿主场景；
 *     其上屏文案**逐字复用** `WebglFallback.tsx` 的主理人裁定版
 *     （docs/design/007-webgl-degradation.md §2.3：上屏文案工程不得自拟/增删/改写）。
 *     历史上这里曾另写一套「静默。此身未具观象之器。」—— 与正典文案冲突，已收编对齐。
 *   - 与声幕同款三条硬规矩：不得出现任何工程字样；静置层无按钮、不可点。
 */

/** 检测是否支持 WebGL（纯函数） */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/**
 * 渲染无 React 降级页（纯函数，无副作用）。
 * 文案 = `WebglFallback.tsx` 声幕层逐字拷贝，两处必须同步修改。
 */
export function renderSilentFallback(): string {
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>三更道场 · 黄道</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #000;
          color: #666;
          font-family: serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          text-align: center;
        }
        .ritual-veil-content {
          max-width: 400px;
          line-height: 2;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="ritual-veil-content">
        <p>坛不设形，声自往还。</p>
        <p>此刻唯余字与音。</p>
        <p>静听即可。</p>
      </div>
    </body>
    </html>
  `;
}
