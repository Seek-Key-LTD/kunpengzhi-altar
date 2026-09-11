import React from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Compass, BookOpen, ScrollText, Sparkles } from 'lucide-react';
import { TEA_POEM_16_CHAPTERS } from '../data/tea_poem_16';
import { SEASON1_POEMS } from '../data/season1_poems';

export type DramaTrack = 'tea_lanterns' | 'altar_spiral' | 'interior_poems';

interface DramaTheaterHUDProps {
  track: DramaTrack;
  onChangeTrack: (track: DramaTrack) => void;
  // Tea Lanterns State
  activeTeaChapter: number;
  onSelectTeaChapter: (ch: number) => void;
  // Spiral Seats State
  activeSeatId: number;
  onSelectSeat: (seatId: number) => void;
  // Interior Poems State
  activeSeasonIndex: number;
  onSelectSeasonIndex: (idx: number) => void;
  // Playback & Speed
  isPlaying: boolean;
  onTogglePlay: () => void;
  speedMode: 'pause' | 'ultra_slow' | 'slow';
  onChangeSpeed: (mode: 'pause' | 'ultra_slow' | 'slow') => void;
  // Expand full modal
  onOpenFullModal: () => void;
}

export const DramaTheaterHUD: React.FC<DramaTheaterHUDProps> = ({
  track,
  onChangeTrack,
  activeTeaChapter,
  onSelectTeaChapter,
  activeSeatId,
  onSelectSeat,
  activeSeasonIndex,
  onSelectSeasonIndex,
  isPlaying,
  onTogglePlay,
  speedMode,
  onChangeSpeed,
  onOpenFullModal
}) => {
  const currentTea = TEA_POEM_16_CHAPTERS[activeTeaChapter - 1] || TEA_POEM_16_CHAPTERS[0];
  const currentSeason = SEASON1_POEMS[activeSeasonIndex] || SEASON1_POEMS[0];

  return (
    <div className="absolute top-20 left-6 z-20 pointer-events-none w-full max-w-md">
      <div className="pointer-events-auto bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-4 shadow-2xl shadow-black/80 flex flex-col space-y-3.5 animate-fade-in">
        {/* Track Selector Tabs */}
        <div className="flex items-center space-x-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => onChangeTrack('tea_lanterns')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-serif flex items-center justify-center space-x-1 transition-all ${
              track === 'tea_lanterns'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>外围16走马灯</span>
          </button>

          <button
            onClick={() => onChangeTrack('interior_poems')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-serif flex items-center justify-center space-x-1 transition-all ${
              track === 'interior_poems'
                ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5 text-sky-400" />
            <span>中空地宫经卷</span>
          </button>

          <button
            onClick={() => onChangeTrack('altar_spiral')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-serif flex items-center justify-center space-x-1 transition-all ${
              track === 'altar_spiral'
                ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>49席繁花水运</span>
          </button>
        </div>

        {/* Content Preview based on Track */}
        {track === 'tea_lanterns' && (
          <div className="bg-slate-950/70 rounded-xl p-3.5 border border-amber-500/30 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-amber-400 font-bold">
                第 {currentTea.chapterIndex} 面 · 共 16 面
              </span>
              <span className="text-[11px] text-slate-400">{currentTea.historicalTheme}</span>
            </div>
            <h4 className="text-base font-serif font-bold text-amber-200 mb-2">
              {currentTea.title}
            </h4>

            {/* Two Column Verse Snippet */}
            <div className="grid grid-cols-2 gap-2 text-xs font-serif leading-relaxed text-slate-200 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
              <div>
                <div className="text-[10px] text-amber-400/80 mb-1">【起承】</div>
                {currentTea.leftColumn.slice(0, 2).map((l, i) => (
                  <div key={i} className="truncate">{l}</div>
                ))}
              </div>
              <div>
                <div className="text-[10px] text-sky-400/80 mb-1">【转合】</div>
                {currentTea.rightColumn.slice(0, 2).map((l, i) => (
                  <div key={i} className="truncate">{l}</div>
                ))}
              </div>
            </div>

            <button
              onClick={onOpenFullModal}
              className="w-full mt-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-serif flex items-center justify-center space-x-1 transition-all"
            >
              <Sparkles className="w-3 h-3" />
              <span>展开 16 句全赋研读</span>
            </button>
          </div>
        )}

        {track === 'interior_poems' && (
          <div className="bg-slate-950/70 rounded-xl p-3.5 border border-sky-500/30 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-sky-400 font-bold">
                {currentSeason.seasonId} {currentSeason.seasonName}
              </span>
              <span className="text-[11px] text-slate-400">{currentSeason.theme.split(' · ')[0]}</span>
            </div>
            <h4 className="text-base font-serif font-bold text-sky-200 mb-1.5">
              {currentSeason.opening.title}
            </h4>
            <div className="text-xs font-serif text-slate-300 line-clamp-2 italic leading-relaxed">
              "{currentSeason.opening.text[0]}"
            </div>

            <button
              onClick={onOpenFullModal}
              className="w-full mt-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-serif flex items-center justify-center space-x-1 transition-all"
            >
              <Sparkles className="w-3 h-3" />
              <span>展开本期定场与散场诗卷</span>
            </button>
          </div>
        )}

        {track === 'altar_spiral' && (
          <div className="bg-slate-950/70 rounded-xl p-3.5 border border-emerald-500/30 relative text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-emerald-400 font-bold font-mono">第 #{activeSeatId} 席繁花</span>
              <span className="text-slate-400">乌兰方形螺旋序列</span>
            </div>
            <p className="text-slate-300 font-serif leading-relaxed">
              水流顺七级退台逐席下行灌溉，触发 12-TET 编钟与和声声场。
            </p>
          </div>
        )}

        {/* Stepper Controls & Rotation Speed */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-xs">
          {/* Prev / Play / Next */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => {
                if (track === 'tea_lanterns') {
                  onSelectTeaChapter(activeTeaChapter > 1 ? activeTeaChapter - 1 : 16);
                } else if (track === 'interior_poems') {
                  onSelectSeasonIndex(activeSeasonIndex > 0 ? activeSeasonIndex - 1 : SEASON1_POEMS.length - 1);
                } else {
                  onSelectSeat(Math.max(1, activeSeatId - 1));
                }
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="上一章/上一席"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={onTogglePlay}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center space-x-1 transition-all shadow-sm ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? '暂停剧本' : '自动巡读'}</span>
            </button>

            <button
              onClick={() => {
                if (track === 'tea_lanterns') {
                  onSelectTeaChapter(activeTeaChapter < 16 ? activeTeaChapter + 1 : 1);
                } else if (track === 'interior_poems') {
                  onSelectSeasonIndex(activeSeasonIndex < SEASON1_POEMS.length - 1 ? activeSeasonIndex + 1 : 0);
                } else {
                  onSelectSeat(Math.min(49, activeSeatId + 1));
                }
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="下一章/下一席"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Speed Mode Selector */}
          <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => onChangeSpeed('pause')}
              className={`px-2 py-1 rounded text-[11px] transition-all ${
                speedMode === 'pause'
                  ? 'bg-red-500/20 text-red-300 font-bold border border-red-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="静止灯屏，从容阅读"
            >
              静止
            </button>
            <button
              onClick={() => onChangeSpeed('ultra_slow')}
              className={`px-2 py-1 rounded text-[11px] transition-all ${
                speedMode === 'ultra_slow'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="极缓转动"
            >
              极缓
            </button>
            <button
              onClick={() => onChangeSpeed('slow')}
              className={`px-2 py-1 rounded text-[11px] transition-all ${
                speedMode === 'slow'
                  ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="慢速悠游"
            >
              慢游
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
