import React, { useEffect, useRef } from 'react';
import { AltarScene } from './three/AltarScene';
import { INITIAL_SPIRAL_EVENTS } from './data/spiral_events';

export const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const altar = new AltarScene(containerRef.current, INITIAL_SPIRAL_EVENTS);
    // 当前直入版本不开放游客档：进入即为已认证的观察席，WASD/QE 立刻可用。
    // 真正 OIDC 接入后由身份层覆写此角色；祭坛本体仍只消费 role，不自行验权。
    altar.setRole('authenticated');
    altar.presentImmediately();
    return () => altar.destroy();
  }, []);

  return (
    <main className="ritual-root" aria-label="华夏祭坛">
      <div ref={containerRef} className="ritual-canvas" />
    </main>
  );
};

export default App;
