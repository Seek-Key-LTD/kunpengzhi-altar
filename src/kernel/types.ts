/**
 * #26 World Kernel 基础类型
 *
 * 纯 TypeScript，不依赖 Three.js/DOM/React/Tone。
 * 所有世界对象必须声明：身份/版本、认识论类型、前提、输入/输出、单位与坐标系、适用域、失效条件、provenance。
 */

/** 认识论类型（#25 正典分类契约） */
export type EpistemicType =
  | '史'  // 历史事实（有文献/考古证据）
  | '模'  // 模型（科学模型/物理模型）
  | '推'  // 推论（基于模型的推论）
  | '设'  // 设定（虚构/美学设定）
  | '演'  // 演绎（逻辑演绎）
  | '工'; // 工程实现（代码实现）

/** 坐标系 */
export type CoordinateSystem =
  | 'ENU'      // East-North-Up（本地地平）
  | 'ECEF'     // Earth-Centered Earth-Fixed
  | 'ECI'      // Earth-Centered Inertial
  | 'LOCAL';  // 场景本地坐标

/** 单位 */
export interface UnitContract {
  readonly length: 'm' | 'km' | 'px';
  readonly time: 's' | 'ms' | 'unix';
  readonly angle: 'rad' | 'deg';
}

/** Provenance（来源） */
export interface Provenance {
  readonly source: string;       // 来源文献/URL
  readonly author: string;      // 作者
  readonly version: string;     // 版本
  readonly timestamp: number;   // unix ms
}

/** 失效条件 */
export interface FailureCondition {
  readonly condition: string;    // 失效条件描述
  readonly fallback: string;     // 降级方案
}

/** 世界对象契约 */
export interface WorldObject {
  /** 身份 */
  readonly id: string;
  /** 版本 */
  readonly version: string;
  /** 认识论类型 */
  readonly epistemicType: EpistemicType;
  /** 前提条件 */
  readonly prerequisites: readonly string[];
  /** 输入单位契约 */
  readonly inputUnits: UnitContract;
  /** 输出单位契约 */
  readonly outputUnits: UnitContract;
  /** 坐标系 */
  readonly coordinateSystem: CoordinateSystem;
  /** 适用域 */
  readonly domain: string;
  /** 失效条件 */
  readonly failureConditions: readonly FailureCondition[];
  /** 可用用途 */
  readonly allowedUses: readonly string[];
  /** 禁用用途 */
  readonly forbiddenUses: readonly string[];
  /** 来源 */
  readonly provenance: Provenance;
}

/** 非法转换拒绝：[设] 或 [推] 不能被静默提升为 [史] */
export function assertNoImplicitPromotion(
  from: EpistemicType,
  to: EpistemicType
): void {
  const promotions: Record<EpistemicType, EpistemicType[]> = {
    '史': ['史'],
    '模': ['模', '史'],       // 模型可以提升为历史事实（经过验证后）
    '推': ['推', '模'],       // 推论可以提升为模型（经过验证后）
    '设': ['设'],             // 设定不能提升为事实
    '演': ['演', '推'],       // 演绎可以提升为推论
    '工': ['工'],             // 工程实现不能提升为事实
  };
  if (!promotions[from].includes(to)) {
    throw new Error(`非法认识论提升：${from} → ${to}（显式转换不允许静默提升）`);
  }
}
