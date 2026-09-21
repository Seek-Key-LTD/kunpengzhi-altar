import React, { useEffect, useRef, useState } from 'react';
import { AltarScene } from './three/AltarScene';
import { detectWebglTier, type WebglTier } from './three/webglCapability';
import { WebglFallback } from './components/WebglFallback';
import { INITIAL_SPIRAL_EVENTS } from './data/spiral_events';

/**
 * 公共入口 · 观察席（#5 纯净渲染树）。
 *
 * 设计不变量（QA 门禁 verify-audio-envelope / qa-verify-audio-envelope）：
 * 公共 App 与公共 UI 树**不得**含任何交互控件/回调（无倍速入口可挂、
 * 公共 DOM 无座次/工程文案）。所有“活”都发生在 3D 场景与声音里：
 * 自运维演示循环（点名→定格→逆熄→留白→重生）、双龙前锋珠、走马灯巡礼、
 * 首次手势后的逐席编钟 —— 访客不需要点任何按钮就能看到装置在说话。
 */
export const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * #7：静默层是否在场。`tier='none'`（无 WebGL / 运行中上下文丢失）时置真。
   * 探测在副作用里做，故首帧未知 —— 那一帧页面本就是纯暗底，观众看不出接缝。
   */
  const [veiled, setVeiled] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // #7 §1.4：能力探测**先于** `new AltarScene`，把「渲染分支」与「3D 构造」解耦。
    const tier: WebglTier = detectWebglTier();

    // 以给定档位起坛。抽成局部函数只为让下面两级兜底共用同一段构造代码。
    const raise = (t: WebglTier): AltarScene =>
      new AltarScene(container, INITIAL_SPIRAL_EVENTS, undefined, undefined, undefined, {
        tier: t
      });

    // §2.4：3D 构造**任何**异常都兜进无画档，绝不冒泡成 React 错误边界 / 白屏。
    let altar: AltarScene | null = null;
    try {
      altar = raise(tier);
    } catch {
      try {
        altar = raise({ tier: 'none', reason: 'no-context' });
      } catch {
        altar = null;
      }
    }
    if (!altar) {
      // 连无画档都起不来：留静默层，不抛、不弹、不留空页。
      setVeiled(true);
      return;
    }

    // 公共入口采用自由观察席：进入即开放鼠标 OrbitControls 与 WASD/QE。
    // 真正 OIDC 接入后由身份层覆写此角色；祭坛本体仍只消费 role，不自行验权。
    altar.setRole('guest'); // #20 公共入口禁止飞行

    // 公共页启动 1800s 五幕正典时间轴（#16 修复：时钟自走，手势只影响音频增益）
    altar.startRitual();

    // #7 T5：**只换画面层**。时间轴 / 雾中字幕 / 音频由 AltarScene 的**同一个**
    // animate 循环继续推进 —— 这里不新建第二套时间轴，也不新建计时器（#4 不变量）。
    setVeiled(altar.isDrawless);
    // 运行中上下文丢失 → 换静默层；恢复 → 按丢失前档位撤层。
    altar.setOnDegrade((next: WebglTier) => setVeiled(next.tier === 'none'));

    const scene = altar;
    return () => scene.destroy();
  }, []);

  return (
    <main className="ritual-root" aria-label="华夏祭坛">
      <div ref={containerRef} className="ritual-canvas" />
      <aside
        aria-label="观察席"
        className="pointer-events-none absolute right-4 top-4 z-20 w-52 rounded-xl border border-slate-700/70 bg-slate-950/75 px-3 py-2.5 text-[11px] leading-5 text-slate-300 shadow-xl backdrop-blur-md"
      >
        <div className="mb-1 font-semibold tracking-wide text-amber-300">观察席快捷键</div>
        <div className="grid grid-cols-2 gap-x-3">
          <span><kbd className="rounded bg-slate-800 px-1 font-mono text-amber-200">W</kbd> 前进</span>
          <span><kbd className="rounded bg-slate-800 px-1 font-mono text-amber-200">S</kbd> 后退</span>
          <span><kbd className="rounded bg-slate-800 px-1 font-mono text-amber-200">A</kbd> 左移</span>
          <span><kbd className="rounded bg-slate-800 px-1 font-mono text-amber-200">D</kbd> 右移</span>
          <span><kbd className="rounded bg-slate-800 px-1 font-mono text-amber-200">Q</kbd> 下降</span>
          <span><kbd className="rounded bg-slate-800 px-1 font-mono text-amber-200">E</kbd> 上升</span>
          <span><kbd className="rounded bg-slate-800 px-1 font-mono text-amber-200">Shift</kbd> 加速</span>
          <span><kbd className="rounded bg-slate-800 px-1 font-mono text-amber-200">R</kbd> 复位</span>
        </div>
        <div className="mt-1 border-t border-slate-800 pt-1 text-slate-400">鼠标拖拽旋转 · 滚轮缩放 · 右键拖拽平移</div>
      </aside>
      {veiled && <WebglFallback />}
    </main>
  );
};

export default App;
