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

export const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const altarSceneRef = useRef<AltarScene | null>(null);

  const [events, setEvents] = useState<SpiralEvent[]>(INITIAL_SPIRAL_EVENTS);
  const [activeSeatId, setActiveSeatId] = useState<number>(1);
  const [isPatrolling, setIsPatrolling] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  
  // Modals
  const [isSubmitOpen, setIsSubmitOpen] = useState<boolean>(false);
  const [isComplianceOpen, setIsComplianceOpen] = useState<boolean>(false);
  const [isTeaLanternsOpen, setIsTeaLanternsOpen] = useState<boolean>(false);
  const [selectedTeaChapter, setSelectedTeaChapter] = useState<number>(1);
  const [isInteriorPoemsOpen, setIsInteriorPoemsOpen] = useState<boolean>(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('S01');
  const [submitTargetSeat, setSubmitTargetSeat] = useState<number>(1);

  // Initialize 3D Scene
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new AltarScene(
      containerRef.current,
      events,
      (seatId) => {
        setActiveSeatId(seatId);
      },
      (chapterIndex) => {
        setSelectedTeaChapter(chapterIndex);
        setIsTeaLanternsOpen(true);
      },
      (seasonId) => {
        setSelectedSeasonId(seasonId);
        setIsInteriorPoemsOpen(true);
      }
    );
    altarSceneRef.current = scene;

    return () => {
      scene.destroy();
      altarSceneRef.current = null;
    };
  }, []);

  // Sync events to 3D scene
  useEffect(() => {
    if (altarSceneRef.current) {
      altarSceneRef.current.updateEvents(events);
    }
  }, [events]);

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

  // Handle Patrol Mode
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
  };

  // Handle Reset Cycle
  const handleResetCycle = () => {
    setActiveSeatId(1);
    setIsPatrolling(false);
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
          setSelectedTeaChapter(1);
          setIsTeaLanternsOpen(true);
          handleChangeCameraMode('outer_lanterns');
        }}
        onOpenInteriorPoems={() => {
          setSelectedSeasonId('S01');
          setIsInteriorPoemsOpen(true);
          handleChangeCameraMode('interior');
        }}
        activeSeatId={activeSeatId}
      />

      {/* Right Side Detail Panel */}
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

      {/* Bottom Timeline & Controls */}
      <ControlsBar
        currentSeatId={activeSeatId}
        totalSeats={events.length}
        isPatrolling={isPatrolling}
        cameraMode={cameraMode}
        onTogglePatrol={handleTogglePatrol}
        onSelectSeat={(id) => {
          setActiveSeatId(id);
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
        initialChapter={selectedTeaChapter}
        onClose={() => setIsTeaLanternsOpen(false)}
      />

      {/* Interior Cavern Poetry Modal */}
      <InteriorPoetryModal
        isOpen={isInteriorPoemsOpen}
        initialSeasonId={selectedSeasonId}
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
