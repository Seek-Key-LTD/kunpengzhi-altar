import React from 'react';
import { SpiralEvent } from '../types/altar';
import { Music, Radio, Flower2, Rocket, Clock, Layers, Sparkles, AlertCircle } from 'lucide-react';

interface SeatDetailPanelProps {
  event: SpiralEvent;
  onOpenSubmit: (seatId: number) => void;
  onPlaySound: () => void;
}

export const SeatDetailPanel: React.FC<SeatDetailPanelProps> = ({
  event,
  onOpenSubmit,
  onPlaySound
}) => {
  const isReserved = event.seat_status === 'reserved';

  return (
    <div className="absolute right-6 top-24 bottom-24 w-80 md:w-96 z-20 pointer-events-none flex flex-col justify-between">
      <div className="pointer-events-auto bg-slate-900/85 border border-slate-700/60 backdrop-blur-xl rounded-2xl p-5 shadow-2xl shadow-black/80 flex flex-col space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
        {/* Header Tag */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 font-mono font-bold text-sm border border-amber-500/40">
              #{event.seat_id.toString().padStart(2, '0')}
            </span>
            <div>
              <h3 className="text-lg font-serif font-bold text-slate-100 flex items-center space-x-1.5">
                <span>{event.display_name}</span>
                {event.is_finale && (
                  <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-mono">
                    终卷·归元
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">{event.role_title || '星宿守护者'}</p>
            </div>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isReserved
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {isReserved ? '首期预留席' : '开放繁花席'}
          </span>
        </div>

        {/* Message Excerpt */}
        <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 relative">
          <div className="text-xs text-amber-400/80 font-serif mb-1 flex items-center space-x-1">
            <Sparkles className="w-3 h-3" />
            <span>星笺题字</span>
          </div>
          <p className="text-sm font-serif text-slate-200 leading-relaxed italic">
            "{event.message_excerpt}"
          </p>
        </div>

        {/* Multi-Dimensional Telemetry Grid */}
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          {/* Audio Layer */}
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/50 flex flex-col space-y-1">
            <div className="text-sky-400 flex items-center space-x-1">
              <Music className="w-3.5 h-3.5" />
              <span>12-TET 律吕</span>
            </div>
            <div className="font-mono font-bold text-slate-200 text-sm">{event.midi_note_name}</div>
            <div className="text-[11px] text-slate-400">{event.harmony_event}</div>
          </div>

          {/* Water Dynamics */}
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/50 flex flex-col space-y-1">
            <div className="text-cyan-400 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5" />
              <span>水道水流时刻</span>
            </div>
            <div className="font-mono font-bold text-slate-200 text-sm">
              {event.water_arrival_seconds}s
            </div>
            <div className="text-[11px] text-slate-400">第 {event.water_arrival_beat} 拍抵达</div>
          </div>

          {/* Spatial Layer */}
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/50 flex flex-col space-y-1">
            <div className="text-amber-400 flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5" />
              <span>方坛退台层级</span>
            </div>
            <div className="font-mono font-bold text-slate-200 text-sm">第 {event.layer} 层</div>
            <div className="text-[11px] text-slate-400">标高 +{event.elevation}.0m</div>
          </div>

          {/* Zodiac / Starship */}
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/50 flex flex-col space-y-1">
            <div className="text-indigo-400 flex items-center space-x-1">
              <Radio className="w-3.5 h-3.5" />
              <span>黄道十二宫区</span>
            </div>
            <div className="font-mono font-bold text-slate-200 text-sm">第 {event.zodiac_sector} 分区</div>
            <div className="text-[11px] text-slate-400">乌兰序 #{event.spiral_index}</div>
          </div>
        </div>

        {/* Starship & Flower Assets */}
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center space-x-1.5 text-slate-400">
              <Rocket className="w-3.5 h-3.5 text-sky-400" />
              <span>专属载具</span>
            </span>
            <span className="font-mono text-sky-300">{event.starship_name}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center space-x-1.5 text-slate-400">
              <Flower2 className="w-3.5 h-3.5 text-rose-400" />
              <span>繁花图腾</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: event.flower_color }}
              ></span>
              <span className="capitalize">{event.flower_type}</span>
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 flex items-center space-x-2">
          <button
            onClick={onPlaySound}
            className="flex-1 py-2 px-3 rounded-lg bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 text-xs font-medium transition-all flex items-center justify-center space-x-1.5"
          >
            <Music className="w-3.5 h-3.5" />
            <span>试听发声</span>
          </button>
          {!isReserved && (
            <button
              onClick={() => onOpenSubmit(event.seat_id)}
              className="flex-1 py-2 px-3 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20"
            >
              更新星笺
            </button>
          )}
        </div>

        {/* Non-speculation micro footer */}
        <div className="text-[10px] text-slate-500 flex items-center space-x-1 leading-tight pt-1">
          <AlertCircle className="w-3 h-3 text-slate-400 shrink-0" />
          <span>全员花名制 · 纯数字仪式与创作纪念 · 禁真实机构/个人背书</span>
        </div>
      </div>
    </div>
  );
};
