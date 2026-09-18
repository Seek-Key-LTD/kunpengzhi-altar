/**
 * #7 · WebGL 能力三态探测 —— 设计说明书 `docs/design/007-webgl-degradation.md` §1.2 / §1.3。
 *
 * 三件事，且**只有**这三件：
 *   1. 把「能不能画 / 能画但要不要降质」判成一个判别联合（discriminated union）；
 *   2. 判定必须**先于** `new AltarScene(...)`（§1.4），以便 3D 构造失败时兜进 `none`；
 *   3. 判定本身**绝不抛错** —— 无 DOM / 无 canvas / 无上下文一路退到 `none`，
 *      由调用方换静默层，本模块不参与 UI 决策。
 *
 * ⚠️ 语义澄清（沿用 `AltarScene.kickAudio` 的既有口径）：本仓「静默」= **不抛错 / 不弹错**，
 *    与「静音」无关。`tier='none'` 只表示**无画**，时间轴 / 雾中字幕 / 音频照旧（#4 不变量）。
 *
 * 纯函数与副作用**分离**：`classifyWebglCapability()` 是纯函数（可在 Node 中断言），
 * `probeWebglCapability()` / `detectWebglTier()` 才碰 `document`。
 */

/** 能力三态（判别联合；字面量类型与 §1.2 逐字一致，不得改写）。 */
export type WebglTier =
  | { tier: 'full' }                                        // WebGL2 且非软栅格
  | { tier: 'degraded'; reason: 'no-webgl2' | 'software' }  // 可用但降质：仍渲染、降档
  | { tier: 'none';     reason: 'no-context' | 'context-lost' }; // 不可用：换静默层

/** 一次探测的原始读数（与渲染器实现无关，便于纯函数断言）。 */
export interface WebglCapabilityProbe {
  /** `canvas.getContext('webgl2')` 是否拿到了上下文。 */
  webgl2: boolean;
  /** `canvas.getContext('webgl')` 是否拿到了上下文（WebGL1）。 */
  webgl1: boolean;
  /** 渲染器是否为软件光栅（SwiftShader / llvmpipe / softpipe …）。 */
  software: boolean;
}

/**
 * 软栅格渲染器名特征。
 *
 * 无头 Chromium（`--use-angle=swiftshader`）、多数 CI/VM、以及禁用硬件加速的桌面
 * 浏览器都会落在这几个字串上。`WEBGL_debug_renderer_info` 被屏蔽时退回 `gl.RENDERER`。
 */
const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

/** 渲染器名 → 是否软栅格。非字串 / 空串一律按**非**软栅格处理（不冤枉真机）。 */
export function isSoftwareRenderer(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  return SOFTWARE_RENDERER_RE.test(name);
}

/**
 * 三态判别（**纯函数**，无 DOM 依赖）。
 *
 * 边界（§1.3）：
 *   · 连 WebGL1 都拿不到        ⇒ `none` / `no-context` —— 换静默层，不建 3D。
 *   · 软栅格                    ⇒ `degraded` / `software` —— 仍渲染，降 pixelRatio / 关阴影。
 *   · 无 WebGL2 但有 WebGL1     ⇒ `degraded` / `no-webgl2` —— **不是** `none`，走降档。
 *   · 其余（WebGL2 且非软栅格）  ⇒ `full`。
 */
export function classifyWebglCapability(probe: WebglCapabilityProbe): WebglTier {
  // 1) 一个上下文都拿不到 —— 唯一通向 none 的静态路径（'context-lost' 由运行时事件给出）。
  if (!probe.webgl2 && !probe.webgl1) return { tier: 'none', reason: 'no-context' };
  // 2) 软栅格：能画，但帧率与配额都扛不住全特效。
  if (probe.software) return { tier: 'degraded', reason: 'software' };
  // 3) 只有 WebGL1：降档渲染，不换页。
  if (!probe.webgl2) return { tier: 'degraded', reason: 'no-webgl2' };
  return { tier: 'full' };
}

/**
 * 读渲染器名：`WEBGL_debug_renderer_info` 优先（未被隐私策略屏蔽时最准），
 * 否则退回 `gl.RENDERER`。任何异常都按「未知」处理 —— 未知 ≠ 软栅格。
 */
function readRendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as
      | { UNMASKED_RENDERER_WEBGL?: number }
      | null
      | undefined;
    if (ext && typeof ext.UNMASKED_RENDERER_WEBGL === 'number') {
      const unmasked = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      if (typeof unmasked === 'string' && unmasked.length > 0) return unmasked;
    }
    const plain = gl.getParameter(gl.RENDERER);
    return typeof plain === 'string' ? plain : '';
  } catch {
    return '';
  }
}

/**
 * 释放探测用上下文。
 *
 * 浏览器同时存活的 WebGL 上下文只有十来个；探测若不释放，就等于白占一个配额
 * （历史上这直接导致热更新若干次后白屏）。`WEBGL_lose_context` 是标准扩展。
 */
function releaseProbeContext(gl: WebGLRenderingContext | WebGL2RenderingContext | null): void {
  if (!gl) return;
  try {
    const ext = gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null | undefined;
    if (ext && typeof ext.loseContext === 'function') ext.loseContext();
  } catch {
    /* 释放失败不改写判定：探测上下文最终由 GC 回收 */
  }
}

/**
 * 探测一次真实能力（**唯一**碰 `document` 的函数）。
 *
 * 无 DOM（SSR / Node 断言）或任何异常 ⇒ 全 false ⇒ 由 `classifyWebglCapability`
 * 落到 `none` / `no-context`。**绝不抛错。**
 */
export function probeWebglCapability(doc?: Document | null): WebglCapabilityProbe {
  const host: Document | null = doc ?? (typeof document !== 'undefined' ? document : null);
  const empty: WebglCapabilityProbe = { webgl2: false, webgl1: false, software: false };
  if (!host) return empty;

  let gl2: WebGL2RenderingContext | null = null;
  let gl1: WebGLRenderingContext | null = null;
  try {
    const canvas = host.createElement('canvas');
    gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    // 只有拿不到 WebGL2 才回落 WebGL1：同一张 canvas 不能先后取两种上下文。
    gl1 = gl2 ? null : (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl2 && !gl1) return empty;

    const gl: WebGLRenderingContext | WebGL2RenderingContext = (gl2 ?? gl1) as WebGLRenderingContext;
    const software = isSoftwareRenderer(readRendererName(gl));
    releaseProbeContext(gl);
    return { webgl2: gl2 !== null, webgl1: gl1 !== null, software };
  } catch {
    releaseProbeContext((gl2 ?? gl1) as WebGLRenderingContext | null);
    return empty;
  }
}

/** 一步到位：`document` → 三态。异常安全，供 `App` 在构造 3D **之前**调用。 */
export function detectWebglTier(doc?: Document | null): WebglTier {
  return classifyWebglCapability(probeWebglCapability(doc));
}
