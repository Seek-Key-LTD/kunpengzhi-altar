import React, { useState, useEffect, useRef } from 'react';
import { INITIAL_SPIRAL_EVENTS } from './data/spiral_events';
import { SpiralEvent, CameraMode, StarPaperSubmission } from './types/altar';
import { AltarScene } from './three/AltarScene';
import { altarAudio } from './audio/altarAudio';
import { Header } from './components/Header';
import { ControlsBar } from './components/ControlsBar';
import { SeatDetailPanel } from './components/SeatDetailPanel';
import { StarPaperModal } from './components/StarPaperModal';
import { ComplianceModal } from './components/ComplianceModal';
import { TeaLanternsModal } from './components/TeaLanternsModal';
import { InteriorPoetryModal } from './components/InteriorPoetryModal';
import { DramaTheaterHUD, DramaTrack } from './components/DramaTheaterHUD';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { SEASON1_POEMS } from './data/season1_poems';

export const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const altarSceneRef = useRef<AltarScene | null>(null);

  const [events, setEvents] = useState<SpiralEvent[]>(INITIAL_SPIRAL_EVENTS);
  const [activeSeatId, setActiveSeatId] = useState<number>(1);
  const [isPatrolling, setIsPatrolling] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState<boolean>(false); // default collapsed for clean view!

  // Drama Theater state
  const [dramaTrack, setDramaTrack] = useState<DramaTrack>('tea_lanterns');
  const [activeTeaChapter, setActiveTeaChapter] = useState<number>(1);
  const [activeSeasonIndex, setActiveSeasonIndex] = useState<number>(0);
  const [isDramaPlaying, setIsDramaPlaying] = useState<boolean>(false);
  const [speedMode, setSpeedMode] = useState<'pause' | 'ultra_slow' | 'slow'>('ultra_slow');

  // Modals
  const [isSubmitOpen, setIsSubmitOpen] = useState<boolean>(false);
  const [isComplianceOpen, setIsComplianceOpen] = useState<boolean>(false);
  const [isTeaLanternsOpen, setIsTeaLanternsOpen] = useState<boolean>(false);
  const [isInteriorPoemsOpen, setIsInteriorPoemsOpen] = useState<boolean>(false);
  const [submitTargetSeat, setSubmitTargetSeat] = useState<number>(1);

  // Initialize 3D Scene
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new AltarScene(
      containerRef.current,
      events,
      (seatId) => {
        setActiveSeatId(seatId);
        setDramaTrack('altar_spiral');
        setIsDetailPanelOpen(true);
      },
      (chapterIndex) => {
        setActiveTeaChapter(chapterIndex);
        setDramaTrack('tea_lanterns');
      }
    );
    altarSceneRef.current = scene;

    return () => {
      scene.destroy();
      altarSceneRef.current = null;
    };
  }, []);

  // Sync events
  useEffect(() => {
    if (altarSceneRef.current) {
      altarSceneRef.current.updateEvents(events);
    }
  }, [events]);

  // Sync speed mode
  useEffect(() => {
    if (altarSceneRef.current) {
      altarSceneRef.current.setSpeedMode(speedMode);
    }
  }, [speedMode]);

  // When activeSeatId changes, trigger audio & highlight
  useEffect(() => {
    if (altarSceneRef.current) {
      altarSceneRef.current.setActiveSeat(activeSeatId);
    }
    const currentEvent = events.find((e) => e.seat_id === activeSeatId);
    if (currentEvent) {
      altarAudio.triggerSeatEvent(currentEvent);
    }
  }, [activeSeatId]);

  // Drama auto-stepper timer (Relaxed reading pace: 10s per chapter)
  useEffect(() => {
    if (!isDramaPlaying) return;

    const timer = setInterval(() => {
      if (dramaTrack === 'tea_lanterns') {
        setActiveTeaChapter((prev) => {
          const next = prev < 16 ? prev + 1 : 1;
          altarSceneRef.current?.focusTeaLantern(next);
          return next;
        });
      } else if (dramaTrack === 'interior_poems') {
        setActiveSeasonIndex((prev) => (prev < SEASON1_POEMS.length - 1 ? prev + 1 : 0));
        setCameraMode('interior');
        altarSceneRef.current?.setCameraMode('interior');
      } else if (dramaTrack === 'altar_spiral') {
        setActiveSeatId((prev) => (prev < 49 ? prev + 1 : 1));
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [isDramaPlaying, dramaTrack]);

  // Handle Tea Chapter Selection
  const handleSelectTeaChapter = (ch: number) => {
    setActiveTeaChapter(ch);
    setDramaTrack('tea_lanterns');
    if (altarSceneRef.current) {
      altarSceneRef.current.focusTeaLantern(ch);
    }
    altarAudio.init();
  };

  // Handle Season Index Selection
  const handleSelectSeasonIndex = (idx: number) => {
    setActiveSeasonIndex(idx);
    setDramaTrack('interior_poems');
    setCameraMode('interior');
    if (altarSceneRef.current) {
      altarSceneRef.current.setCameraMode('interior');
    }
    altarAudio.init();
  };

  // Handle Track Change
  const handleChangeDramaTrack = (track: DramaTrack) => {
    setDramaTrack(track);
    if (track === 'tea_lanterns') {
      handleSelectTeaChapter(activeTeaChapter);
    } else if (track === 'interior_poems') {
      handleSelectSeasonIndex(activeSeasonIndex);
    } else if (track === 'altar_spiral') {
      setCameraMode('patrol');
      altarSceneRef.current?.setCameraMode('patrol');
    }
  };

  // Handle Patrol Toggle
  const handleTogglePatrol = () => {
    const nextPatrol = !isPatrolling;
    setIsPatrolling(nextPatrol);
    if (altarSceneRef.current) {
      altarSceneRef.current.setAutoPatrol(nextPatrol);
      if (nextPatrol) {
        setCameraMode('patrol');
        altarSceneRef.current.setCameraMode('patrol');
      }
    }
    altarAudio.init();
  };

  // Handle Audio Mute
  const handleToggleMute = () => {
    altarAudio.init();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    altarAudio.setMuted(nextMuted);
  };

  // Handle Camera Mode Change
  const handleChangeCameraMode = (mode: CameraMode) => {
    setCameraMode(mode);
    if (altarSceneRef.current) {
      altarSceneRef.current.setCameraMode(mode);
    }
    if (mode === 'outer_lanterns') {
      setDramaTrack('tea_lanterns');
    } else if (mode === 'interior') {
      setDramaTrack('interior_poems');
    } else if (mode === 'patrol') {
      setDramaTrack('altar_spiral');
    }
  };

  // Handle Reset Cycle
  const handleResetCycle = () => {
    setActiveSeatId(1);
    setIsPatrolling(false);
    setIsDramaPlaying(false);
    if (altarSceneRef.current) {
      altarSceneRef.current.setAutoPatrol(false);
      altarSceneRef.current.setActiveSeat(1);
    }
    altarAudio.triggerFountainPulse();
  };

  // Handle Star Paper Submission
  const handleStarPaperSubmit = (data: StarPaperSubmission) => {
    setEvents((prev) =>
      prev.map((ev) => {
        if (ev.seat_id === data.targetSeatId) {
          return {
            ...ev,
            display_name: data.displayName,
            message_excerpt: data.message,
            seat_status: 'claimed',
            role_title: `星笺作者 · ${data.themeCategory}之意`,
            flower_type: data.symbolChoice === '花' ? 'peony' : 'lotus',
            starship_name: `${data.displayName}之舟`
          };
        }
        return ev;
      })
    );
    setActiveSeatId(data.targetSeatId);
    setIsDetailPanelOpen(true);
  };

  const currentEvent = events.find((e) => e.seat_id === activeSeatId) || events[0];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#05070d]">
      {/* 3D WebGL Canvas Mount Container */}
      <div ref={containerRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />

      {/* Top Header */}
      <Header
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onOpenSubmit={() => {
          setSubmitTargetSeat(activeSeatId);
          setIsSubmitOpen(true);
        }}
        onOpenCompliance={() => setIsComplianceOpen(true)}
        onOpenTeaLanterns={() => {
          handleSelectTeaChapter(activeTeaChapter);
          setIsTeaLanternsOpen(true);
        }}
        onOpenInteriorPoems={() => {
          handleSelectSeasonIndex(activeSeasonIndex);
          setIsInteriorPoemsOpen(true);
        }}
        activeSeatId={activeSeatId}
      />

      {/* Drama Theater HUD */}
      <DramaTheaterHUD
        track={dramaTrack}
        onChangeTrack={handleChangeDramaTrack}
        activeTeaChapter={activeTeaChapter}
        onSelectTeaChapter={handleSelectTeaChapter}
        activeSeatId={activeSeatId}
        onSelectSeat={(id) => {
          setActiveSeatId(id);
          setIsDetailPanelOpen(true);
        }}
        activeSeasonIndex={activeSeasonIndex}
        onSelectSeasonIndex={handleSelectSeasonIndex}
        isPlaying={isDramaPlaying}
        onTogglePlay={() => setIsDramaPlaying(!isDramaPlaying)}
        speedMode={speedMode}
        onChangeSpeed={setSpeedMode}
        onOpenFullModal={() => {
          if (dramaTrack === 'tea_lanterns') {
            setIsTeaLanternsOpen(true);
          } else if (dramaTrack === 'interior_poems') {
            setIsInteriorPoemsOpen(true);
          } else {
            setIsDetailPanelOpen(true);
          }
        }}
      />

      {/* Toggle Right Side Detail Panel Button */}
      <div className="absolute right-6 top-20 z-30">
        <button
          onClick={() => setIsDetailPanelOpen(!isDetailPanelOpen)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium backdrop-blur-xl transition-all shadow-lg ${
            isDetailPanelOpen
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-700/60'
          }`}
          title={isDetailPanelOpen ? '收起席位面板（无遮挡全屏观察）' : '展开席位详细信息'}
        >
          {isDetailPanelOpen ? (
            <>
              <PanelRightClose className="w-3.5 h-3.5" />
              <span>收起面板</span>
            </>
          ) : (
            <>
              <PanelRightOpen className="w-3.5 h-3.5" />
              <span>席位详情</span>
            </>
          )}
        </button>
      </div>

      {/* Right Side Detail Panel (Optional, collapsible to avoid blocking view) */}
      {isDetailPanelOpen && (
        <SeatDetailPanel
          event={currentEvent}
          onOpenSubmit={(seatId) => {
            setSubmitTargetSeat(seatId);
            setIsSubmitOpen(true);
          }}
          onPlaySound={() => {
            altarAudio.init();
            altarAudio.triggerSeatEvent(currentEvent);
          }}
        />
      )}

      {/* Bottom Timeline & Controls */}
      <ControlsBar
        currentSeatId={activeSeatId}
        totalSeats={events.length}
        isPatrolling={isPatrolling}
        cameraMode={cameraMode}
        onTogglePatrol={handleTogglePatrol}
        onSelectSeat={(id) => {
          setActiveSeatId(id);
          setIsDetailPanelOpen(true);
          altarAudio.init();
        }}
        onChangeCameraMode={handleChangeCameraMode}
        onResetCycle={handleResetCycle}
      />

      {/* Star Paper Modal */}
      <StarPaperModal
        isOpen={isSubmitOpen}
        initialSeatId={submitTargetSeat}
        totalSeats={events.length}
        onClose={() => setIsSubmitOpen(false)}
        onSubmit={handleStarPaperSubmit}
      />

      {/* Outer 16 Tea Lanterns Modal */}
      <TeaLanternsModal
        isOpen={isTeaLanternsOpen}
        initialChapter={activeTeaChapter}
        onClose={() => setIsTeaLanternsOpen(false)}
      />

      {/* Interior Cavern Poetry Modal */}
      <InteriorPoetryModal
        isOpen={isInteriorPoemsOpen}
        initialSeasonId={SEASON1_POEMS[activeSeasonIndex]?.seasonId || 'S01'}
        onClose={() => setIsInteriorPoemsOpen(false)}
      />

      {/* Compliance Modal */}
      <ComplianceModal
        isOpen={isComplianceOpen}
        onClose={() => setIsComplianceOpen(false)}
      />
    </div>
  );
};
export default App;
