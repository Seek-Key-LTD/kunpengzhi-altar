/**
 * #7 WebGL 静默降级页
 *
 * 无 WebGL 时呈现静默降级页，不显示报错或工程说明。
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

/** 渲染静默降级页（纯函数，无副作用） */
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
        .silence {
          max-width: 400px;
          line-height: 2;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="silence">
        静默。<br>
        此身未具观象之器。<br>
        可待夜阑，换一器再来。
      </div>
    </body>
    </html>
  `;
}
