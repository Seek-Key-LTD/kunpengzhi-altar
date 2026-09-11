import React from 'react';
import { X, Shield, Droplets, BookOpen, AlertCircle, Sparkles } from 'lucide-react';

interface ComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ComplianceModal: React.FC<ComplianceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl p-6 text-slate-200 relative max-h-[85vh] overflow-y-auto custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-800">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif text-slate-100">
              《无人值守·自运维·华夏祭坛》实施规范与合规声明
            </h2>
            <p className="text-xs text-slate-400">三更道场 · 第十二期《黄道》终卷散场留白交互装置 (v1.2 规范)</p>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-6 text-xs text-slate-300 leading-relaxed font-sans">
          {/* Section 1 */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
            <h3 className="text-sm font-bold text-amber-300 flex items-center space-x-1.5 font-serif">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>一、 总原则与大衍结构</span>
            </h3>
            <p className="text-slate-300">
              <strong>“水道即路径，路径即乐谱，乐谱即镜头，镜头即巡礼。”</strong>
            </p>
            <p className="text-slate-400">
              数学约束遵循 <span className="font-mono text-amber-400">50 = 1 + 49</span>：
              <br />• <strong>无极点（第 50 / 0 位）</strong>：坛心正上方不可触及的纵向泉眼，不占格上席位，不可认领、不可出售、不可冠名。
              <br />• <strong>七级退台 49 席</strong>：满足严格伸缩求和（Telescoping Sum）形成的 49 个朝天繁花位，由乌兰方螺旋自中心展开遍历。
            </p>
          </div>

          {/* Section 2 */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
            <h3 className="text-sm font-bold text-sky-300 flex items-center space-x-1.5 font-serif">
              <Droplets className="w-4 h-4 text-sky-400" />
              <span>二、 重力水利回环（严禁永动机修辞）</span>
            </h3>
            <p className="text-slate-400">
              系统是“在持续虚拟/外部水源与重力落差条件下运行的自复位水利回环”：
              <br />
              <span className="font-mono text-sky-300">
                外部来水输入 → 翻斗蓄水 → 越阈翻转 → 提水至顶层泉眼 → 乌兰螺旋逐席下行灌溉 → 回收渠蓄水 → 机构复位
              </span>
              <br />
              <strong>“没有无源的永动；没有无代价的繁荣；没有不维护就能永续的文明。”</strong>
            </p>
          </div>

          {/* Section 3 */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
            <h3 className="text-sm font-bold text-emerald-300 flex items-center space-x-1.5 font-serif">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <span>三、 全员花名制与席位管理</span>
            </h3>
            <p className="text-slate-400">
              • <strong>全员花名制</strong>：展示层强制花名/角色名，严禁使用真实姓名与真实机构全称。
              <br />• <strong>预留席（1–8 席）</strong>：挂节目主创与学者角色名（青衣、峨眉、乐山、渔阳等），不作为个人或机构背书。
              <br />• <strong>水筹与积分</strong>：仅通过站内任务与活动发放，<strong>禁止任何充值入口、禁止转让变现</strong>。
            </p>
          </div>

          {/* Section 4 */}
          <div className="bg-amber-950/30 p-4 rounded-xl border border-amber-500/30 space-y-2">
            <h3 className="text-sm font-bold text-amber-300 flex items-center space-x-1.5 font-serif">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>四、 免责、真钱隔离与合规声明</span>
            </h3>
            <p className="text-amber-100/90 leading-normal">
              本项目不提供命理、占卜、投资、收益、保值、升值、回购或未来变现承诺。所有星舰、音乐、花位、文本与视觉生成均为创作、纪念、互动与节目世界观体验。
              <br />
              测试网见证仅作为数字凭证，不具备法币或主网资产价值。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            已知晓并返回
          </button>
        </div>
      </div>
    </div>
  );
};
