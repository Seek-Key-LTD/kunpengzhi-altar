// 导演路由壳（#/director）
//
// ── 与公共入口的关系 ────────────────────────────────────────────────
// 这个壳与 AltarScene **平级**，不进 App.tsx 那部 30 分钟不可交互的仪式：
// 公共入口（`#/` 或空 hash）继续走 App，一行不改。
// 路由一律走 hash —— v2 清单明令禁止 `?role=` 这类公共 query 裸露。
//
// ── 认证 ────────────────────────────────────────────────────────────
// 前端伪认证：hash + localStorage 一次性确认，不引 OIDC、不引后端。
// **已知局限**：这只是挡住误入，不是真的身份校验；
// 任何看到这个地址的人都能点"确认"。真认证要等后端接进来。
//
// ── 权限 ────────────────────────────────────────────────────────────
// 拓印 → authenticated 起；拆解与断代 → 仅 director。
// 断代的史事注脚只在合规弹窗里由 director 主动唤出，不自动进公共画面。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AltarScene } from '../three/AltarScene';
import { INITIAL_SPIRAL_EVENTS } from '../data/spiral_events';
import { altarAudio } from '../audio/altarAudio';
import { useRelicState } from '../hooks/useRelicState';
import { ROLE_CAPABILITIES, type AltarRole, type CameraMode } from '../types/altar';
import type { SealEra, SealMode } from '../types/relic';
import { SEAL_ERA_LAYERS } from '../data/sealSpec';
import { Header } from '../components/Header';
import { ControlsBar } from '../components/ControlsBar';
import { ComplianceModal } from '../components/ComplianceModal';
import { SeatDetailPanel } from '../components/SeatDetailPanel';
import { InteriorPoetryModal } from '../components/InteriorPoetryModal';
import { TeaLanternsModal } from '../components/TeaLanternsModal';
import { SealPanel } from '../components/SealPanel';

/** 一次性确认的落点（仅本浏览器） */
const CONFIRM_KEY = 'altar.director.confirmed';

export const DirectorApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const altarRef = useRef<AltarScene | null>(null);

  const [entered, setEntered] = useState<boolean>(
    () => window.localStorage.getItem(CONFIRM_KEY) === '1'
  );
  const [role] = useState<AltarRole>('director');
  const [isMuted, setIsMuted] = useState(false);
  const [activeSeatId, setActiveSeatId] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [isPatrolling, setIsPatrolling] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [eraNoteOpen, setEraNoteOpen] = useState(false);
  const [lanternsOpen, setLanternsOpen] = useState(false);
  const [interiorOpen, setInteriorOpen] = useState(false);
  const [initialChapter, setInitialChapter] = useState(1);
  const [initialSeasonId, setInitialSeasonId] = useState('S01');

  // 玉玺状态：唯一真源在 3D 侧，这里 10Hz 读一次
  const relicState = useRelicState(altarRef, 10);
  const caps = ROLE_CAPABILITIES[role];

  // ── 建场 ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!entered || !containerRef.current) return;
    const altar = new AltarScene(
      containerRef.current,
      INITIAL_SPIRAL_EVENTS,
      (seatId) => setActiveSeatId(seatId),
      (chapterIndex) => {
        setInitialChapter(chapterIndex);
        setLanternsOpen(true);
      },
      (seasonId) => {
        setInitialSeasonId(seasonId);
        setInteriorOpen(true);
      }
    );
    altarRef.current = altar;
    altar.setRole(role);
    altar.setCameraMode('orbit');

    return () => {
      altar.destroy();
      altarRef.current = null;
    };
  }, [entered, role]);

  // ── 意图下发：面板只喊话，状态仍在 3D ───────────────────────────────
  const handleSetMode = useCallback((mode: SealMode) => altarRef.current?.setSealMode(mode), []);
  const handleSetEra = useCallback((era: SealEra) => altarRef.current?.setSealEra(era), []);
  const handleFocus = useCallback(() => altarRef.current?.focusRelic(), []);
  const handleStamp = useCallback(() => altarRef.current?.setSealMode('stamping'), []);
  const handleExploded = useCallback(
    (progress: number) => altarRef.current?.setSealExploded(progress),
    []
  );
  const handleOpenEraNote = useCallback(() => {
    setEraNoteOpen(true);
    setComplianceOpen(true);
  }, []);

  const handleChangeCameraMode = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    altarRef.current?.setCameraMode(mode);
  }, []);

  const handleTogglePatrol = useCallback(() => {
    setIsPatrolling((prev) => {
      const next = !prev;
      altarRef.current?.setAutoPatrol(next);
      return next;
    });
  }, []);

  const handleSelectSeat = useCallback((seatId: number) => {
    setActiveSeatId(seatId);
    altarRef.current?.setActiveSeat(seatId);
  }, []);

  const handleResetCycle = useCallback(() => {
    setActiveSeatId(1);
    altarRef.current?.setActiveSeat(1);
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      altarAudio.setMuted(next);
      return next;
    });
  }, []);

  /** 入导演台：借这次点击手势把音频起起来（Tone.js 必须由用户手势启动） */
  const enter = async () => {
    window.localStorage.setItem(CONFIRM_KEY, '1');
    try {
      await altarAudio.init();
    } catch (err) {
      console.warn('音频初始化失败，静音继续：', err);
    }
    setEntered(true);
  };

  const activeEvent = INITIAL_SPIRAL_EVENTS[Math.min(48, Math.max(0, activeSeatId - 1))];

  // ── 未确认：先挡一道 ───────────────────────────────────────────────
  if (!entered) {
    return (
      <main className="ritual-root flex items-center justify-center">
        <div className="max-w-md px-8 py-7 rounded-2xl bg-slate-900/90 border border-amber-500/30 text-slate-200 shadow-2xl">
          <h1 className="text-lg font-serif font-bold text-amber-200 mb-3">导演 / 认证台</h1>
          <p className="text-xs leading-relaxed text-slate-400 mb-5">
            本路由用于讲解、核验与器物操作，<strong className="text-amber-300">不是公共入口</strong>。
            <br />
            拓印只写器物自身的计数（不落座次表、不进 credits、不发音）；
            拆解与断代属导演讲解权。
            <br />
            <span className="text-slate-500">
              注：这是前端伪认证（hash + localStorage），不具真正身份校验能力。
            </span>
          </p>
          <button
            onClick={enter}
            className="w-full py-2.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-slate-950 text-sm font-bold tracking-wide transition-all"
          >
            我已知晓，进入
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="ritual-root">
      <div ref={containerRef} className="ritual-canvas" aria-hidden="true" />

      <Header
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onOpenCompliance={() => setComplianceOpen(true)}
        onOpenTeaLanterns={() => setLanternsOpen(true)}
        onOpenInteriorPoems={() => setInteriorOpen(true)}
        activeSeatId={activeSeatId}
      />

      <SealPanel
        state={relicState}
        caps={caps}
        onSetMode={handleSetMode}
        onSetEra={handleSetEra}
        onFocus={handleFocus}
        onStamp={handleStamp}
        onExplodedProgress={handleExploded}
        onOpenEraNote={handleOpenEraNote}
      />

      {activeEvent && (
        <SeatDetailPanel
          event={activeEvent}
          onPlaySound={() => altarAudio.triggerSeatEvent(activeEvent)}
        />
      )}

      <ControlsBar
        currentSeatId={activeSeatId}
        totalSeats={49}
        isPatrolling={isPatrolling}
        cameraMode={cameraMode}
        onTogglePatrol={handleTogglePatrol}
        onSelectSeat={handleSelectSeat}
        onChangeCameraMode={handleChangeCameraMode}
        onResetCycle={handleResetCycle}
      />

      <ComplianceModal
        isOpen={complianceOpen}
        onClose={() => {
          setComplianceOpen(false);
          setEraNoteOpen(false);
        }}
        relicEra={eraNoteOpen && relicState ? SEAL_ERA_LAYERS[relicState.era] : null}
      />

      <TeaLanternsModal
        isOpen={lanternsOpen}
        initialChapter={initialChapter}
        onClose={() => setLanternsOpen(false)}
      />

      <InteriorPoetryModal
        isOpen={interiorOpen}
        initialSeasonId={initialSeasonId}
        onClose={() => setInteriorOpen(false)}
      />
    </main>
  );
};

export default DirectorApp;
