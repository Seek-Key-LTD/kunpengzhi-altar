import React, { useEffect, useState } from 'react';
import { TEA_POEM_16_CHAPTERS, TEA_POEM_PREFACE, TeaChapter } from '../data/tea_poem_16';
import { X, ChevronLeft, ChevronRight, BookOpen, Sparkles, Feather } from 'lucide-react';

interface TeaLanternsModalProps {
  isOpen: boolean;
  initialChapter?: number;
  onClose: () => void;
}

const CHAPTER_COUNT = TEA_POEM_16_CHAPTERS.length;
const LAST_CHAPTER_IDX = CHAPTER_COUNT - 1;

/** chapter（1 起）→ 数组下标：非有限值/越界一律钳回有效区间。 */
function chapterToIdx(chapter: number): number {
  if (!Number.isFinite(chapter)) return 0;
  return Math.min(LAST_CHAPTER_IDX, Math.max(0, Math.round(chapter) - 1));
}

export const TeaLanternsModal: React.FC<TeaLanternsModalProps> = ({
  isOpen,
  initialChapter = 1,
  onClose
}) => {
  const [activeIdx, setActiveIdx] = useState(() => chapterToIdx(initialChapter));

  // initialChapter 只在 mount 时被 useState 快照一次；导演台两次打开之间
  // 点了不同的灯面（DirectorApp 以状态变量传参）会让弹窗停在上一面的位置。
  // 与 InteriorPoetryModal 的换期对位修复同款：在「每次打开」时按最新值重新对位。
  useEffect(() => {
    if (isOpen) setActiveIdx(chapterToIdx(initialChapter));
  }, [isOpen, initialChapter]);

  const [showPreface, setShowPreface] = useState(false);

  if (!isOpen) return null;

  // 防御：数据面为空或下标越界时回落第 1 面，而不是让 currentChapter 解引用崩溃。
  const currentChapter: TeaChapter | undefined =
    TEA_POEM_16_CHAPTERS[activeIdx] ?? TEA_POEM_16_CHAPTERS[0];
  if (!currentChapter) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-4xl shadow-2xl p-6 md:p-8 text-slate-200 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
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
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/10">
              <BookOpen className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-serif bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
                十六面转经走马大茶灯 · 《茶史五绝赋》
              </h2>
              <p className="text-xs text-slate-400 tracking-wider">
                最外围回廊 · 16 章 256 句 1280 言 · 一韵到底 · 双栏对位
              </p>
            </div>
          </div>

          {/* Toggle Preface */}
          <button
            onClick={() => setShowPreface(!showPreface)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-amber-300 transition-all self-start md:self-auto"
          >
            <Feather className="w-3.5 h-3.5" />
            <span>{showPreface ? '返回正文' : '查看原序'}</span>
          </button>
        </div>

        {showPreface ? (
          /* Preface View */
          <div className="bg-slate-950/70 rounded-2xl p-6 border border-slate-800/80 space-y-4">
            <h3 className="text-lg font-serif font-bold text-amber-300 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>《茶史五绝赋》序</span>
            </h3>
            <div className="text-sm font-serif text-slate-300 leading-relaxed whitespace-pre-line space-y-3">
              {TEA_POEM_PREFACE}
            </div>
            <div className="pt-4 border-t border-slate-800/60 text-xs text-slate-400 italic">
              "玉玺问的是‘谁有资格统治’，茶问的是‘谁是自己人’。一个把秩序压进金石，一个把秩序泡进草木！"
            </div>
          </div>
        ) : (
          /* Chapter Carousel View */
          <div className="space-y-6">
            {/* Chapter Tabs */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-2 custom-scrollbar">
              {TEA_POEM_16_CHAPTERS.map((ch, idx) => (
                <button
                  key={ch.chapterIndex}
                  onClick={() => setActiveIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-serif whitespace-nowrap transition-all ${
                    activeIdx === idx
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                      : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  第{ch.chapterIndex}面 · {ch.title.split(' · ')[1]}
                </button>
              ))}
            </div>

            {/* Main Double Column Hanging Screen (走马灯垂帘双栏) */}
            <div className="bg-gradient-to-b from-slate-950/90 to-slate-900/90 rounded-3xl p-6 md:p-8 border border-amber-500/30 shadow-2xl relative overflow-hidden">
              {/* Watermark */}
              <div className="absolute right-4 bottom-4 text-8xl font-serif text-amber-500/5 select-none pointer-events-none font-black">
                {currentChapter.chapterIndex}
              </div>

              {/* Title & Historical Theme */}
              <div className="mb-6 text-center">
                <span className="inline-block px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono font-medium mb-2">
                  灯屏第 {currentChapter.chapterIndex} 面 / 共 {CHAPTER_COUNT} 面
                </span>
                <h3 className="text-2xl font-serif font-bold text-amber-200">
                  {currentChapter.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  历史脉络：{currentChapter.historicalTheme}
                </p>
              </div>

              {/* Double Column Display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 my-4">
                {/* Left Column (起承) */}
                <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/80">
                  <div className="space-y-3 font-serif text-base text-slate-200 leading-loose">
                    {currentChapter.leftColumn.map((line, lIdx) => (
                      <div key={lIdx} className="tracking-widest flex items-center space-x-2">
                        <span className="text-xs text-amber-500/50 font-mono">{lIdx + 1}.</span>
                        <span className="font-medium">{line}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column (转合) */}
                <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/80">
                  <div className="space-y-3 font-serif text-base text-slate-200 leading-loose">
                    {currentChapter.rightColumn.map((line, rIdx) => (
                      <div key={rIdx} className="tracking-widest flex items-center space-x-2">
                        <span className="text-xs text-sky-500/50 font-mono">{rIdx + 5}.</span>
                        <span className="font-medium">{line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Inverse Walker Philosophy Note */}
              <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-400 font-serif italic">
                “灯恒转，人逆着灯的方向走，相对静止，方能读完一面灯屏。” —— 只有逆着历史走的人，才能看清一段历史。
              </div>
            </div>

            {/* Stepper Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveIdx((prev) => (prev > 0 ? prev - 1 : LAST_CHAPTER_IDX))}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>上一面灯屏</span>
              </button>

              <div className="text-xs text-slate-500 font-mono">
                {activeIdx + 1} / {CHAPTER_COUNT}
              </div>

              <button
                onClick={() => setActiveIdx((prev) => (prev < LAST_CHAPTER_IDX ? prev + 1 : 0))}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-all"
              >
                <span>下一面灯屏</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
