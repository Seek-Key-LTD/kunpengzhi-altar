import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Props for {@link RitualLanding}.
 *
 * The Landing layer itself owns nothing about the ritual: it merely intercepts
 * the first interaction (so the altar canvas behind it can never be touched by
 * accident) and then delegates to the existing entry semantics via `onEnter`.
 */
export interface RitualLandingProps {
  /**
   * Entry handler. Reuses the exact semantics of the legacy `begin()` in
   * `App.tsx` (init audio buffer, arm the ritual clock, reset the seat cursor).
   * May be async; its resolution does not gate the fade-out.
   */
  onEnter: () => void | Promise<void>;
  /**
   * Invoked once the fade-out transition has finished so the host can unmount
   * this layer. Never called while the overlay is still opaque.
   */
  onExited: () => void;
}

/** Fade-out duration in milliseconds; kept in sync with `.ritual-landing`. */
const FADE_OUT_MS = 1200;

/**
 * Reads `prefers-reduced-motion` with a safe default of `false` during SSR and
 * whenever `matchMedia` is unavailable, so the animation never blocks render.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Full-screen entry overlay for the public altar page.
 *
 * Responsibilities:
 *  - Cover the whole viewport at a higher stacking layer than the canvas and
 *    swallow all pointer events, preventing accidental interaction with the
 *    ritual scene ("防止触碰").
 *  - Present the identity line, the centered `进入祭坛` call-to-action and the
 *    darkness/no-audio warning, sized purely with `clamp()` + `vw` so the type
 *    scale tracks the viewport instead of any fixed pixel value.
 *  - On activation, run `onEnter()` and fade itself out (~1.2s), disabling hit
 *    testing immediately so the ritual proper receives input right away.
 */
export const RitualLanding: React.FC<RitualLandingProps> = ({ onEnter, onExited }) => {
  const [leaving, setLeaving] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const exitedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Clean up the pending unmount timer if the host tears the layer down first.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleEnter = useCallback(() => {
    if (leaving) return;
    setLeaving(true);

    // Preserve the existing begin() semantics: fire immediately on click.
    void Promise.resolve(onEnter()).catch(() => {
      /* Audio init may be rejected by autoplay policy; the ritual still begins. */
    });

    const delay = reducedMotion ? 0 : FADE_OUT_MS;
    timerRef.current = window.setTimeout(() => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      onExited();
    }, delay + 60);
  }, [leaving, onEnter, onExited, reducedMotion]);

  return (
    <div
      className={`ritual-landing${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="华夏祭坛 · 入口"
    >
      <div className="ritual-landing__content">
        <h1 className="ritual-landing__title">无人值守 · 自运维 · 华夏祭坛</h1>
        <button
          type="button"
          className="ritual-landing__enter"
          onClick={handleEnter}
          aria-label="进入祭坛"
        >
          进入祭坛
        </button>
      </div>
      <p className="ritual-landing__hint">入坛后前 3 分钟为绝对黑暗，请开启声音</p>
    </div>
  );
};

export default RitualLanding;
