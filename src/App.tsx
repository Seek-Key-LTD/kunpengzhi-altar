import React, { useEffect, useRef, useState } from 'react';
import { AltarScene } from './three/AltarScene';
import { detectWebglTier, type WebglTier } from './three/webglCapability';
import { WebglFallback } from './components/WebglFallback';
import { INITIAL_SPIRAL_EVENTS } from './data/spiral_events';

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
      new AltarScene(container, INITIAL_SPIRAL_EVENTS, undefined, undefined, undefined, { tier: t });

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

    // 当前直入版本不开放游客档：进入即为已认证的观察席，WASD/QE 立刻可用。
    // 真正 OIDC 接入后由身份层覆写此角色；祭坛本体仍只消费 role，不自行验权。
    altar.setRole('authenticated');
    // #8：公共入口改由 1800s 五幕时间轴驱动（abyss→naming→lanterns→extinguishing→silence）。
    // presentImmediately() 保留不删，供导演 / 直入路径（#5）另用。
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
      {veiled && <WebglFallback />}
    </main>
  );
};

export default App;
