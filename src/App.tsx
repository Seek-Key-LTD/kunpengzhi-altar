import React, { useEffect, useRef } from 'react';
import { AltarScene } from './three/AltarScene';
import { INITIAL_SPIRAL_EVENTS } from './data/spiral_events';

export const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const altar = new AltarScene(containerRef.current, INITIAL_SPIRAL_EVENTS);
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
