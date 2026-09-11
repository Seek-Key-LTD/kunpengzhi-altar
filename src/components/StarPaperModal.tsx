import React, { useState } from 'react';
import { StarPaperSubmission } from '../types/altar';
import { X, Sparkles, AlertTriangle, ShieldCheck, Flower2, Compass } from 'lucide-react';

interface StarPaperModalProps {
  isOpen: boolean;
  initialSeatId: number;
  totalSeats: number;
  onClose: () => void;
  onSubmit: (data: StarPaperSubmission) => void;
}

export const StarPaperModal: React.FC<StarPaperModalProps> = ({
  isOpen,
  initialSeatId,
  totalSeats,
  onClose,
  onSubmit
}) => {
  const [targetSeatId, setTargetSeatId] = useState(initialSeatId);
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [themeCategory, setThemeCategory] = useState<StarPaperSubmission['themeCategory']>('纪念');
  const [symbolChoice, setSymbolChoice] = useState<StarPaperSubmission['symbolChoice']>('花');
  const [temperament, setTemperament] = useState<StarPaperSubmission['temperament']>('壮阔');
  const [visibility, setVisibility] = useState<StarPaperSubmission['visibility']>('public');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayName.trim()) {
      setErrorMsg('请填写花名/昵称（全员花名制，请勿使用真实姓名）');
      return;
    }
    if (message.trim().length < 5 || message.trim().length > 100) {
      setErrorMsg('寄语长度建议在 5 至 100 字之间');
      return;
    }

    // Prohibited content check
    const sensitiveWords = ['预测', '算命', '八字', '保值', '升值', '回购', '领土', '血统', '真名'];
    for (const w of sensitiveWords) {
      if (message.includes(w) || displayName.includes(w)) {
        setErrorMsg(`内容含有合规限制词汇（“${w}”），本项目仅供创作纪念，禁命理占卜、投资承诺与敏感论断。`);
        return;
      }
    }

    setErrorMsg('');
    onSubmit({
      displayName: displayName.trim(),
      message: message.trim(),
      themeCategory,
      symbolChoice,
      temperament,
      visibility,
      targetSeatId
    });
    onClose();
  };

  const isReserved = targetSeatId <= 8;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl p-6 text-slate-200 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center space-x-2.5 mb-5 pb-3 border-b border-slate-800">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif text-slate-100">题写星笺 · 认领繁花席位</h2>
            <p className="text-xs text-slate-400">将寄语投射至祭坛方格乌兰螺旋水道，生成专属声光与星舰巡礼</p>
          </div>
        </div>

        {/* Prohibited & Privacy Notice */}
        <div className="mb-5 bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200/90 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>全员花名制与合规提示：</strong>
            展示层强制使用花名/昵称，严禁使用真实姓名与机构全称；严禁包含命理占卜、投资收益承诺或领土史学论断。
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Target Seat Selector */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Compass className="w-3.5 h-3.5 text-sky-400" />
                <span>目标席位 (1 - {totalSeats})</span>
              </span>
              {isReserved && (
                <span className="text-amber-400 font-normal">（1–8 席为首发主创预留席，将作角色题注）</span>
              )}
            </label>
            <select
              value={targetSeatId}
              onChange={(e) => setTargetSeatId(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
            >
              {Array.from({ length: totalSeats }, (_, i) => i + 1).map((id) => (
                <option key={id} value={id}>
                  第 #{id} 席 {id <= 8 ? '(首期预留席)' : id === 49 ? '(终卷·归元席)' : '(开放繁花位)'}
                </option>
              ))}
            </select>
          </div>

          {/* Pseudonym */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              花名 / 署名 <span className="text-amber-400">*</span>
              <span className="text-slate-500 font-normal ml-1">（例如：蓬莱客、太白行舟、琴台守夜）</span>
            </label>
            <input
              type="text"
              required
              maxLength={16}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="请输入您的花名（禁真实姓名）"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              星笺寄语 <span className="text-amber-400">*</span>
              <span className="text-slate-500 font-normal ml-1">（建议 10–80 字，将刻印于席位）</span>
            </label>
            <textarea
              required
              rows={3}
              maxLength={120}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="例如：山河万里，终有回甘。愿以此席留白，照见未来星河。"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none font-serif"
            />
            <div className="text-right text-[11px] text-slate-500">{message.length}/120 字</div>
          </div>

          {/* Theme & Symbol */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">主题类别</label>
              <select
                value={themeCategory}
                onChange={(e) => setThemeCategory(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {['纪念', '启程', '生日', '项目', '毕业', '守望', '天地', '归真'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center space-x-1">
                <Flower2 className="w-3 h-3 text-rose-400" />
                <span>图腾意象</span>
              </label>
              <select
                value={symbolChoice}
                onChange={(e) => setSymbolChoice(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {['花', '鸟', '山', '河', '车', '玉', '星', '鼎'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Temperament & Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">气质风格</label>
              <select
                value={temperament}
                onChange={(e) => setTemperament(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {['壮阔', '肃穆', '昂扬', '安静', '温暖', '空灵'].map((tmp) => (
                  <option key={tmp} value={tmp}>
                    {tmp}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">展示范围</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="public">公开全坛可见</option>
                <option value="unlisted">仅链接与巡礼可见</option>
                <option value="private">私密静思</option>
              </select>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center space-x-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>题刻并照见</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
