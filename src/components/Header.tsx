import React from 'react';
import { Volume2, VolumeX, ShieldAlert, Sparkles, Droplets } from 'lucide-react';

interface HeaderProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenSubmit: () => void;
  onOpenCompliance: () => void;
  activeSeatId: number;
}

export const Header: React.FC<HeaderProps> = ({
  isMuted,
  onToggleMute,
  onOpenSubmit,
  onOpenCompliance,
  activeSeatId
}) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between pointer-events-none bg-gradient-to-b from-[#05070d]/90 via-[#05070d]/40 to-transparent">
      {/* Title & Lore */}
      <div className="pointer-events-auto">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-sky-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shadow-lg shadow-amber-500/10">
            <Droplets className="w-5 h-5 text-sky-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-wider font-serif bg-gradient-to-r from-amber-200 via-slate-100 to-sky-300 bg-clip-text text-transparent">
              无人值守·自运维·华夏祭坛
            </h1>
            <p className="text-xs text-slate-400 tracking-widest font-sans flex items-center space-x-2">
              <span>三更道场·第十二期《黄道》终卷交互装置</span>
              <span className="text-amber-500/60">•</span>
              <span className="text-amber-400">大衍之数五十，其用四十有九</span>
            </p>
          </div>
        </div>
      </div>

      {/* Global Status & Quick Actions */}
      <div className="pointer-events-auto flex items-center space-x-3 mt-3 md:mt-0">
        <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 text-xs text-slate-300 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>水利回环：第 <strong className="text-sky-300 font-mono">#{activeSeatId}</strong> 席灌溉中</span>
        </div>

        <button
          onClick={onOpenSubmit}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600/80 to-amber-500/80 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-medium text-xs tracking-wide shadow-md shadow-amber-500/20 transition-all active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>递交星笺</span>
        </button>

        <button
          onClick={onOpenCompliance}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-xs backdrop-blur-md transition-colors"
          title="实施规范与合规声明"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">规范与声明</span>
        </button>

        <button
          onClick={onToggleMute}
          className={`p-2 rounded-lg border text-xs backdrop-blur-md transition-all ${
            isMuted
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
          }`}
          title={isMuted ? '开启十二律吕发声' : '静音'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
