import React, { useState } from 'react';
import { SEASON1_POEMS, SeasonPoem } from '../data/season1_poems';
import { X, ChevronLeft, ChevronRight, ScrollText, Sparkles } from 'lucide-react';

interface InteriorPoetryModalProps {
  isOpen: boolean;
  initialSeasonId?: string;
  onClose: () => void;
}

export const InteriorPoetryModal: React.FC<InteriorPoetryModalProps> = ({
  isOpen,
  initialSeasonId = 'S01',
  onClose
}) => {
  const initialIndex = Math.max(
    0,
    SEASON1_POEMS.findIndex((p) => p.seasonId === initialSeasonId)
  );
  const [activeIdx, setActiveIdx] = useState(initialIndex);

  if (!isOpen) return null;

  const currentPoem: SeasonPoem = SEASON1_POEMS[activeIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg animate-fade-in">
      <div className="bg-slate-900 border border-sky-500/40 rounded-3xl w-full max-w-4xl shadow-2xl p-6 md:p-8 text-slate-200 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-lg shadow-sky-500/10">
              <ScrollText className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-serif bg-gradient-to-r from-sky-200 to-indigo-300 bg-clip-text text-transparent">
                金字塔中空地宫 · 第一季诗词歌赋经卷
              </h2>
              <p className="text-xs text-slate-400 tracking-wider">
                三更书场 · 第一季 S01–S12 定场与散场全集 · 悬刻于祭塔内壁
              </p>
            </div>
          </div>
        </div>

        {/* Season Selector Tabs */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-3 custom-scrollbar mb-6">
          {SEASON1_POEMS.map((p, idx) => (
            <button
              key={p.seasonId}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-1.5 rounded-xl text-xs font-serif whitespace-nowrap transition-all ${
                activeIdx === idx
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {p.seasonId} {p.seasonName}
            </button>
          ))}
        </div>

        {/* Active Season Scroll Container */}
        <div className="bg-gradient-to-b from-slate-950/95 to-slate-900/95 rounded-3xl p-6 md:p-8 border border-sky-500/30 shadow-2xl relative">
          <div className="text-center mb-6">
            <span className="inline-block px-3 py-1 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30 text-xs font-mono font-medium mb-2">
              {currentPoem.seasonId} · 主题篇章
            </span>
            <h3 className="text-2xl md:text-3xl font-serif font-bold text-slate-100">
              {currentPoem.seasonName}
            </h3>
            <p className="text-xs text-sky-400/90 mt-1 font-serif">
              {currentPoem.theme}
            </p>
          </div>

          {/* Opening & Closing Dual Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
            {/* Opening Poem (定场) */}
            <div className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="text-xs font-serif font-bold text-amber-300 flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>【定场】{currentPoem.opening.title}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {currentPoem.opening.form} · {currentPoem.opening.author}
                  </span>
                </div>
                <div className="space-y-2.5 font-serif text-sm text-slate-200 leading-relaxed">
                  {currentPoem.opening.text.map((line, lIdx) => (
                    <p key={lIdx} className="tracking-wide">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* Closing Poem (散场) */}
            <div className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="text-xs font-serif font-bold text-sky-300 flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>【散场】{currentPoem.closing.title}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {currentPoem.closing.form} · {currentPoem.closing.author}
                  </span>
                </div>
                <div className="space-y-2.5 font-serif text-sm text-slate-200 leading-relaxed">
                  {currentPoem.closing.text.map((line, lIdx) => (
                    <p key={lIdx} className="tracking-wide">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Philosophy keyNote */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-400 font-serif italic">
            “{currentPoem.keyNote}”
          </div>
        </div>

        {/* Stepper Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setActiveIdx((prev) => (prev > 0 ? prev - 1 : SEASON1_POEMS.length - 1))}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>上一期经卷</span>
          </button>

          <div className="text-xs text-slate-500 font-mono">
            {activeIdx + 1} / {SEASON1_POEMS.length}
          </div>

          <button
            onClick={() => setActiveIdx((prev) => (prev < SEASON1_POEMS.length - 1 ? prev + 1 : 0))}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-all"
          >
            <span>下一期经卷</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
