/**
 * #26 Scenario Assembly 声明式装配
 *
 * 场景以声明式 manifest 装配 kernel 对象与 adapter，
 * 不向对象内部写入场景业务。
 */

import type { WorldObject } from './types';

/** 观察者事件（observer event） */
export interface ObserverEvent {
  /** 时间（unix ms） */
  readonly time: number;
  /** 位置（场景本地坐标） */
  readonly position: { x: number; y: number; z: number };
  /** 朝向（yaw/pitch/roll，弧度） */
  readonly orientation: { yaw: number; pitch: number; roll: number };
  /** 尺度（1=正常） */
  readonly scale: number;
  /** 精度预算（相对误差） */
  readonly precision: number;
  /** 参考系 */
  readonly referenceFrame: string;
}

/** Adapter 端口 */
export interface AdapterPort {
  readonly name: string;
  readonly type: 'renderer' | 'audio' | 'input' | 'storage' | 'network';
  readonly version: string;
}

/** 场景装配 Manifest */
export interface ScenarioManifest {
  /** 场景 ID */
  readonly id: string;
  /** 场景版本 */
  readonly version: string;
  /** 世界对象列表 */
  readonly objects: readonly WorldObject[];
  /** Adapter 列表 */
  readonly adapters: readonly AdapterPort[];
  /** 观察者事件 */
  readonly observer: ObserverEvent;
  /** 依赖图（对象 ID 列表） */
  readonly dependencyGraph: readonly string[];
}

/** 导出依赖图（纯函数） */
export function exportDependencyGraph(manifest: ScenarioManifest): string[] {
  return manifest.objects.map((o) => `${o.id}@${o.version} [${o.epistemicType}]`);
}
