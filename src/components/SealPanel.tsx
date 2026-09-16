// 玉玺控制面板（右侧固定）
//
// ── 这个面板只下发意图，不持有状态 ───────────────────────────────────
// 状态唯一真源是 `AltarScene.getRelicState()`，由 useRelicState 10Hz 读进来。
// 面板本身**不保存** mode / era / 进度，只负责把人的意图转成一句调用。
//
// ── 法统边界 ────────────────────────────────────────────────────────
// · 本文件**不 import** `spiral_events` —— 玉玺是器物，与 49 席没有半点关系。
// · 传入的 ImperialSealState 带编译期断言，塞席位语义字段会编译不过。
// · 断代的史事注脚（SealEraLayer.note）**不在本面板直接展示**：
//   展示层不得自动承载史学论断，要点开合规弹窗由 director 主动唤出。

import React from 'react';
import { Gem, Hammer, Stamp, Crosshair, ScrollText, Lock } from 'lucide-react';
import type { ImperialSealState, SealEra, SealMode } from '../types/relic';
import type { AltarCapabilities } from '../types/altar';
import { SEAL_ERA_LAYERS, SEAL_ERA_ORDER } from '../data/sealSpec';

interface SealPanelProps {
  /** 玉玺当前状态（10Hz 轮询得来，可能为 null：场景还没起来） */
  state: ImperialSealState | null;
  /** 当前身份的能力表：权限判定只在 UI 侧做一次，3D 侧还会再验一次 */
  caps: AltarCapabilities;
  onSetMode: (mode: SealMode) => void;
  onSetEra: (era: SealEra) => void;
  onFocus: () => void;
  onStamp: () => void;
  onExplodedProgress: (progress: number) => void;
  /** 唤出合规弹窗看当前断代的史事注脚（director 主动唤出，不自动进公共画面） */
  onOpenEraNote: () => void;
}

const ERA_LABEL: Record<SealEra, string> = {
  qin: '秦',
  xin: '汉新',
  weijin: '魏晋十六国',
  liaojin: '辽金'
};

export const SealPanel: React.FC<SealPanelProps> = ({
  state,
  caps,
  onSetMode,
  onSetEra,
  onFocus,
  onStamp,
  onExplodedProgress,
  onOpenEraNote
}) => {
  // 场景还没起来时给个占位，避免 null 判得到处都是
  const mode: SealMode = state?.mode ?? 'normal';
  const era: SealEra = state?.era ?? 'qin';
  const exploded = state?.exploded_progress ?? 0;
  const stampCount = state?.stamp_count ?? 0;

  const modeButtons: Array<{ id: SealMode; label: string; enabled: boolean; hint: string }> = [
    { id: 'normal', label: '合', enabled: true, hint: '复原为完整一尊' },
    {
      id: 'exploded',
      label: '拆解',
      enabled: caps.sealExploded,
      hint: caps.sealExploded ? '拔出金镶角，推近燕尾倒勾槽' : '需导演权限'
    },
    {
      id: 'stamping',
      label: '拓印',
      enabled: caps.sealStamp,
      hint: caps.sealStamp ? '按下一枚朱砂印痕（只写器物计数，不落座次表）' : '需认证权限'
    }
  ];

  return (
    <div className="absolute right-6 top-24 z-20 w-72 pointer-events-none">
      <div className="pointer-events-auto bg-slate-900/85 border border-amber-500/30 backdrop-blur-xl rounded-2xl p-4 shadow-2xl shadow-black/80 flex flex-col space-y-3.5 max-h-[70vh] overflow-y-auto custom-scrollbar">
        {/* 标题 */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
              <Gem className="w-4 h-4 text-emerald-300" />
            </span>
            <div>
              <h3 className="text-sm font-serif font-bold text-slate-100">传国玉玺</h3>
              <p className="text-[10px] text-slate-500">
                方四寸 · 高三寸六 · 悬浮于坛心正上方
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              state?.selected
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}
          >
            {state?.selected ? '已选中' : '未选中'}
          </span>
        </div>

        {/* 读数：全部来自 getRelicState，面板自己不存 */}
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-400">
          <div className="bg-slate-950/60 rounded-lg px-2 py-1.5">
            形态 <span className="text-amber-300">{mode}</span>
          </div>
          <div className="bg-slate-950/60 rounded-lg px-2 py-1.5">
            断代 <span className="text-amber-300">{ERA_LABEL[era]}</span>
          </div>
          <div className="bg-slate-950/60 rounded-lg px-2 py-1.5">
            拆解 <span className="text-sky-300">{exploded.toFixed(2)}</span>
          </div>
          <div className="bg-slate-950/60 rounded-lg px-2 py-1.5">
            已拓 <span className="text-rose-300">{stampCount}</span> 枚
          </div>
        </div>

        {/* 机位 */}
        <button
          onClick={onFocus}
          className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-sky-950/70 hover:bg-sky-900/80 border border-sky-500/50 text-sky-300 text-xs font-serif transition-all active:scale-95"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>推近悬浮玺台</span>
        </button>

        {/* 形态：normal 全开；拆解仅 director；拓印 authenticated 起 */}
        <div>
          <div className="text-[10px] text-slate-500 mb-1.5 flex items-center space-x-1">
            <Hammer className="w-3 h-3" />
            <span>形态（只走面板，点击场景只做选中）</span>
          </div>
          <div className="flex items-center gap-1.5">
            {modeButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => onSetMode(btn.id)}
                disabled={!btn.enabled}
                title={btn.hint}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs transition-all border ${
                  !btn.enabled
                    ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                    : mode === btn.id
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-medium'
                      : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {!btn.enabled && <Lock className="w-3 h-3 inline mr-1" />}
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* 拆解进度：仅 director */}
        <div>
          <div className="text-[10px] text-slate-500 mb-1.5">拆解进度（导演）</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(exploded * 100)}
            disabled={!caps.sealExploded}
            onChange={(e) => onExplodedProgress(Number(e.target.value) / 100)}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-amber-400 disabled:opacity-30"
          />
        </div>

        {/* 断代：仅 director */}
        <div>
          <div className="text-[10px] text-slate-500 mb-1.5 flex items-center justify-between">
            <span>断代层（导演）</span>
            <button
              onClick={onOpenEraNote}
              disabled={!caps.sealEra}
              className="inline-flex items-center space-x-1 text-amber-400/80 hover:text-amber-300 disabled:text-slate-600 disabled:cursor-not-allowed"
              title="史事注脚：展示层不自动承载史学论断，需主动唤出"
            >
              <ScrollText className="w-3 h-3" />
              <span>注脚</span>
            </button>
          </div>
          <div className="flex items-center flex-wrap gap-1">
            {SEAL_ERA_ORDER.map((id) => (
              <button
                key={id}
                onClick={() => onSetEra(id)}
                disabled={!caps.sealEra}
                title={SEAL_ERA_LAYERS[id].dynasty}
                className={`px-2 py-1 rounded-lg text-[11px] transition-all border ${
                  !caps.sealEra
                    ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                    : era === id
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-medium'
                      : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {ERA_LABEL[id]}
              </button>
            ))}
          </div>
        </div>

        {/* 拓印：authenticated 起 */}
        <button
          onClick={onStamp}
          disabled={!caps.sealStamp}
          className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/50 text-rose-200 text-xs font-serif transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          title="只写器物自身的拓印计数，不落座次表、不进 credits、不发音"
        >
          <Stamp className="w-3.5 h-3.5" />
          <span>落一枚朱砂印</span>
        </button>
      </div>
    </div>
  );
};

export default SealPanel;
