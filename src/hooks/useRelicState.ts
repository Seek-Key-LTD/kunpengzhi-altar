// 玉玺状态订阅：10Hz 节流轮询
//
// ── 为什么是轮询，不是 React state 镜像 ──────────────────────────────
// 玉玺状态的唯一真源是 `AltarScene.getRelicState()`（也就是 3D 里的那一尊）。
// 若在 React 侧再建一份镜像 state，就等于同一个事实存两处：
// 3D 每帧改一次、React 再 setState 一次，既会每帧重渲染，也迟早会漂移。
// 所以这里只做一件事：**按固定频率去 3D 那儿读一次**，且读出来发现
// 没变就**不 setState**（浅比较），把重渲染压到真正变化的那一帧。
//
// 顺带说明：10Hz 是给人看的节奏（面板读数），不是给渲染的，
// 3D 侧的动画仍然是 rAF 每帧跑，不受这个频率影响。

import { useEffect, useRef, useState } from 'react';
import type { AltarScene } from '../three/AltarScene';
import type { ImperialSealState } from '../types/relic';

/** 两个状态是否等价（只比较本 hook 关心的字段） */
function sameState(a: ImperialSealState | null, b: ImperialSealState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.mode === b.mode &&
    a.era === b.era &&
    a.visible === b.visible &&
    a.selected === b.selected &&
    a.glb_loaded === b.glb_loaded &&
    a.lod === b.lod &&
    a.transmission_enabled === b.transmission_enabled &&
    a.hover_y === b.hover_y &&
    a.stamp_count === b.stamp_count &&
    // 连续量只在"肉眼可辨"的粒度上比较，避免小数点后抖动引发重渲染
    Math.abs(a.exploded_progress - b.exploded_progress) < 0.005 &&
    Math.abs(a.stamp_progress - b.stamp_progress) < 0.005
  );
}

/**
 * 订阅玉玺状态。
 * @param sceneRef 持有 AltarScene 实例的 ref
 * @param hz       轮询频率，默认 10Hz
 */
export function useRelicState(
  sceneRef: React.RefObject<AltarScene | null>,
  hz: number = 10
): ImperialSealState | null {
  const [state, setState] = useState<ImperialSealState | null>(null);
  const latest = useRef<ImperialSealState | null>(null);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    const interval = Math.max(16, Math.round(1000 / Math.max(1, hz)));

    const tick = () => {
      const next = sceneRef.current?.getRelicState() ?? null;
      if (!sameState(next, latest.current)) {
        latest.current = next;
        setState(next);
      }
    };

    tick(); // 首帧立刻读一次，别让面板空着
    const timer = window.setInterval(tick, interval);
    return () => window.clearInterval(timer);
  }, [sceneRef, hz]);

  return state;
}
