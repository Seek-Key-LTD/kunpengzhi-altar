import React, { useEffect, useRef, useState } from 'react';
import { AltarScene } from './three/AltarScene';
import { INITIAL_SPIRAL_EVENTS } from './data/spiral_events';
import { altarAudio } from './audio/altarAudio';
import { TEA_POEM_16_CHAPTERS } from './data/tea_poem_16';

type RitualPhase = 'abyss' | 'naming' | 'lanterns' | 'extinguishing' | 'silence';

const TIMELINE = { abyss: 180, naming: 840, lanterns: 420, extinguishing: 311, silence: 49 } as const;
const TOTAL_SECONDS = Object.values(TIMELINE).reduce((sum, value) => sum + value, 0);

function frameAt(seconds: number) {
  if (seconds < TIMELINE.abyss) return { phase: 'abyss' as RitualPhase, litSeats: 0, activeSeatId: null };
  const namingEnd = TIMELINE.abyss + TIMELINE.naming;
  if (seconds < namingEnd) {
    const seat = Math.min(49, Math.floor((seconds - TIMELINE.abyss) / (TIMELINE.naming / 49)) + 1);
    return { phase: 'naming' as RitualPhase, litSeats: seat, activeSeatId: seat };
  }
  const lanternEnd = namingEnd + TIMELINE.lanterns;
  if (seconds < lanternEnd) return { phase: 'lanterns' as RitualPhase, litSeats: 49, activeSeatId: 49 };
  const extinguishEnd = lanternEnd + TIMELINE.extinguishing;
  if (seconds < extinguishEnd) {
    const extinguished = Math.min(49, Math.floor((seconds - lanternEnd) / (TIMELINE.extinguishing / 49)) + 1);
    return { phase: 'extinguishing' as RitualPhase, litSeats: 49 - extinguished, activeSeatId: null };
  }
  return { phase: 'silence' as RitualPhase, litSeats: 0, activeSeatId: null };
}

export const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const altarRef = useRef<AltarScene | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const lastSeatRef = useRef<number | null>(null);
  const [started, setStarted] = useState(false);
  const [frame, setFrame] = useState(() => frameAt(0));

  useEffect(() => {
    if (!containerRef.current) return;
    const altar = new AltarScene(containerRef.current, INITIAL_SPIRAL_EVENTS);
    altarRef.current = altar;
    altar.setRitualState('abyss', 0, null);
    return () => {
      altar.destroy();
      altarRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!started) return;
    let animationFrame = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(TOTAL_SECONDS, (now - (startedAtRef.current ?? now)) / 1000);
      const next = frameAt(elapsed);
      altarRef.current?.setRitualState(next.phase, next.litSeats, next.activeSeatId);
      const seatId = next.activeSeatId;
      if (next.phase === 'naming' && seatId !== null && seatId !== lastSeatRef.current) {
        lastSeatRef.current = seatId;
        const event = INITIAL_SPIRAL_EVENTS[seatId - 1];
        if (event) altarAudio.triggerSeatEvent(event);
      }
      setFrame(next);
      if (elapsed < TOTAL_SECONDS) animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [started]);

  const begin = async () => {
    await altarAudio.init();
    startedAtRef.current = performance.now();
    lastSeatRef.current = null;
    setStarted(true);
  };

  const poem = TEA_POEM_16_CHAPTERS[(Math.max(frame.activeSeatId ?? 1, 1) - 1) % 16];

  return (
    <main className="ritual-root">
      <div ref={containerRef} className="ritual-canvas" aria-hidden="true" />
      {!started && <button className="ritual-enter" onClick={begin} aria-label="进入祭坛">入坛</button>}
      {started && frame.phase === 'lanterns' && <p className="ritual-caption">{poem?.leftColumn[0]}</p>}
      {started && frame.phase === 'silence' && <button className="ritual-return" onClick={() => window.location.reload()}>复位</button>}
    </main>
  );
};

export default App;
