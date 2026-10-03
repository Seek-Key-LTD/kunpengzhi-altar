// 仪式幕次 → 各视觉单元显隐 纯映射
//
// 输入 RitualPhase，输出每个 group/光/雾该是什么状态。
// 不碰 three.js，可被单元测试断言。AltarScene 只负责把结果写进场景图。
//
// RitualPhase 只有一处定义（types/altar.ts 唯一权威），本模块 import type 复用 ——
// 编译期擦除、零运行时字节；五幕枚举增删时这里自动跟随，不再有第二份会漂移的副本。
import type { RitualPhase } from '../types/altar';

export interface CeremonyVisibility {
  /** 是否暗幕（abyss/silence）：灭环境光、浓雾 */
  isDark: boolean;
  /** 坛体外壳 */
  outerShellVisible: boolean;
  /** 水路/喷泉（暗幕关） */
  waterworksVisible: boolean;
  /** 走马灯茶屏 */
  lanternsVisible: boolean;
  /** 双龙（naming/lanterns 才显） */
  dualDragonVisible: boolean;
  /** 无极点吸光体（abyss 关） */
  wujiAbsorberVisible: boolean;
  /** 无极点顶光强度（熄灭/寂静时 2.4，其余 0） */
  wujiLightIntensity: number;
  /** 雾密度 */
  fogDensity: number;
  /** 环境光强度 */
  ambientLight: number;
  /** 日光强度 */
  sunLight: number;
  /** 轮廓光强度 */
  rimLight: number;
  /** 顶光强度 */
  apexLight: number;
}

export function ceremonyVisibility(phase: RitualPhase): CeremonyVisibility {
  const isDark = phase === 'abyss' || phase === 'silence';
  return {
    isDark,
    outerShellVisible: phase !== 'abyss',
    waterworksVisible: !isDark,
    lanternsVisible: phase === 'lanterns' || phase === 'extinguishing',
    dualDragonVisible: phase === 'naming' || phase === 'lanterns',
    wujiAbsorberVisible: phase !== 'abyss',
    wujiLightIntensity: phase === 'extinguishing' || phase === 'silence' ? 2.4 : 0,
    fogDensity: isDark ? 0.07 : 0.006,
    ambientLight: isDark ? 0 : 0.18,
    sunLight: isDark ? 0 : 1.35,
    rimLight: isDark ? 0 : 0.82,
    apexLight: isDark ? 0 : 0.62
  };
}
