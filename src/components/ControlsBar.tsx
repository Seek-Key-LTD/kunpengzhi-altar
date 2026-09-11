import React from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Eye, RefreshCw, Compass, ArrowUpCircle, BookOpen, ScrollText } from 'lucide-react';
import { CameraMode } from '../types/altar';

interface ControlsBarProps {
  currentSeatId: number;
  totalSeats: number;
  isPatrolling: boolean;
  cameraMode: CameraMode;
  onTogglePatrol: () => void;
  onSelectSeat: (seatId: number) => void;
  onChangeCameraMode: (mode: CameraMode) => void;
  onResetCycle: () => void;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({
  currentSeatId,
  totalSeats,
  isPatrolling,
  cameraMode,
  onTogglePatrol,
  onSelectSeat,
  onChangeCameraMode,
  onResetCycle
}) => {
  const cameraModes: Array<{ id: CameraMode; label: string; icon: React.ReactNode }> = [
    { id: 'orbit', label: '自由环绕', icon: <Compass className="w-3.5 h-3.5" /> },
    { id: 'yin', label: '入阴', icon: <ScrollText className="w-3.5 h-3.5" /> },
    { id: 'interior', label: '俯瞰全坛', icon: <Eye className="w-3.5 h-3.5" /> },
    { id: 'outer_lanterns', label: '外围16灯', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'patrol', label: '水道巡礼', icon: <Eye className="w-3.5 h-3.5" /> },
    { id: 'topdown', label: '俯视九宫', icon: <ArrowUpCircle className="w-3.5 h-3.5" /> },
    { id: 'fountain', label: '泉眼无极', icon: <RefreshCw className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-11/12 max-w-3xl">
      <div className="pointer-events-auto bg-slate-900/90 border border-slate-700/70 backdrop-blur-xl rounded-2xl px-5 py-3.5 shadow-2xl shadow-black/80 flex flex-col space-y-3">
        {/* Main Transport Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Play / Step Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onSelectSeat(Math.max(1, currentSeatId - 1))}
              disabled={currentSeatId <= 1}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="前一席"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={onTogglePatrol}
              className={`px-4 py-2 rounded-lg font-medium text-xs flex items-center space-x-2 transition-all shadow-md ${
                isPatrolling
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              {isPatrolling ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>暂停巡礼</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>启动乌兰巡礼</span>
                </>
              )}
            </button>

            <button
              onClick={() => onSelectSeat(Math.min(totalSeats, currentSeatId + 1))}
              disabled={currentSeatId >= totalSeats}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="后一席"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={onResetCycle}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all ml-1"
              title="复位回环至泉眼"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
            </button>
          </div>

          {/* Camera Presets */}
          <div className="flex items-center flex-wrap gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            {cameraModes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => onChangeCameraMode(mode.id)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                  cameraMode === mode.id
                    ? 'bg-sky-500/20 text-sky-300 font-medium border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode.icon}
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Spiral Timeline Scrubber */}
        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <span className="font-mono text-amber-300 font-semibold w-12">#{currentSeatId} 席</span>
          <div className="flex-1 relative flex items-center">
            <input
              type="range"
              min={1}
              max={totalSeats}
              value={currentSeatId}
              onChange={(e) => onSelectSeat(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>
          <span className="font-mono text-slate-500 w-12 text-right">#{totalSeats} 席</span>
        </div>
      </div>
    </div>
  );
};
