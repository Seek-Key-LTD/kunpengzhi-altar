// 华夏祭坛 · 无头视觉取证入口（#7 前置）+ 场景 E2E 面（w2/scene-e2e）
//
// 在真浏览器（无头 Chromium，WebGL2 经 ANGLE/SwiftShader）里实例化**真** AltarScene，
// 并把控制权挂到 window.__capture 上，供 tools/capture/capture.mjs（Playwright 驱动）调用。
//
// 两个取样语义：
//   · seek(t) —— 把内部时钟与全部派生状态一次性摆到 t（AltarScene.seekTo），用于 #2 首/中/末席静态取证
//   · start(r) —— 给 1800s 时间轴设回放速率，用于 #7 全程录屏（1800/r 秒真跑）
//
// e2e 子面（`window.__capture.e2e`，w2/scene-e2e 新增，**纯增量**，C 组门禁不感知）：
//   场景级 E2E（scripts/e2e/scene-ceremony.mjs）需要单元测试给不出的东西——
//   真实点击落点换算、销毁-重建链路、活跃席位读数、荣誉三态在页面上下文的真模块驱动。
//   与既有方法共享同一 `altar` 实例（let 重绑定，rebuild 后全部闭包自动指向新实例）。
//
// ⚠️ 不进 dist、不打包进 App：本文件不被 index.html 引用，vite build 只以 index.html 为入口。

import { Vector3 } from 'three';
import { AltarScene } from '../../src/three/AltarScene';
import { INITIAL_SPIRAL_EVENTS } from '../../src/data/spiral_events';
import { PYRAMID_HALF } from '../../src/data/altarGeometry';
import { ritualPhaseAt, ritualLitSeatsAt, RITUAL_TOTAL_SEC } from '../../src/types/altar';
import { detectWebglTier } from '../../src/three/webglCapability';
import { aggregateHonor } from '../../src/honor/aggregate';
import { toPublicView } from '../../src/honor/publicView';
import type { MonthlyRanking, SeatAnchor } from '../../src/honor/types';
import '../../src/index.css'; // 复用生产字幕样式（.ritual-caption），保证取真画面

interface CaptureApi {
  /** 摆位到给定秒（对齐内部时钟）。 */
  seek: (sec: number) => number;
  /** 启动/调整回放速率（真跑）。 */
  start: (rate: number) => number;
  /** 当前仪式时间（秒）。 */
  time: () => number | null;
  /** 当前回放速率。 */
  rate: () => number;
  /** 纯函数：sec → 幕次。 */
  phaseAt: (sec: number) => string;
  /** 纯函数：sec → 已触发席数。 */
  litSeatsAt: (sec: number) => number;
  /** #5 · 启用俯视正交取证相机（半宽，默认 PYRAMID_HALF）。 */
  orthoTopdown: (halfWidth?: number) => number;
  /** #5 · 关闭正交取证相机。 */
  clearOrtho: () => void;
  /** #10 · 实拍位姿读数（真实 camera/controls/fov，非纯函数回显）。 */
  pose: () => RitualPoseReadout;
  /** w2/scene-e2e · 场景级 E2E 面（换席点击落点 / 销毁重建 / 荣誉三态）。 */
  e2e: SceneE2eApi;
  TOTAL: number;
}

/** #10 · 实拍位姿读出结构。 */
interface RitualPoseReadout {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
}

/** w2/scene-e2e · 场景级 E2E 面。全部经真实例/真模块，不发明任何语义。 */
interface SceneE2eApi {
  /** 当前活跃席位（AltarScene.activeSeatId 实读）。 */
  activeSeat: () => number | null;
  /** 容器内 canvas 数（销毁链路断言用）。 */
  canvasCount: () => number;
  /**
   * 席位坐垫世界坐标 → 画布像素（真实 camera 标准投影链）——供 Playwright 真点击。
   * visible=false 表示席垫不在场景图/投影在视锥外（未触发席可能显隐为 false，但仍可投影）。
   */
  screenPosOf: (seatId: number) => { x: number; y: number; visible: boolean };
  /** 场景状态快照（幂等断言用；只含可复现字段，不含墙钟动画相位）。 */
  snapshot: () => {
    elapsed: number;
    phase: string;
    litSeats: number;
    activeSeat: number | null;
    canvasCount: number;
    fogDensity: number;
    camera: RitualPoseReadout;
  };
  /** 真销毁 → 真重建（同一容器、同一构造参数、同一导演档起坛）。 */
  destroyAndRebuild: () => { canvasCount: number };
  /**
   * 荣誉三态：页面上下文里跑**真** aggregateHonor + toPublicView（两套口径对拍）。
   * changed 直通入参 delta —— 喂 up/down/same/new 各至少一条即得三（四）态覆盖。
   */
  honorRun: (
    ranking: MonthlyRanking,
    anchors: readonly SeatAnchor[]
  ) => {
    epochTag: string;
    seatCount: number;
    excludedCount: number;
    adminDeltas: Array<{ seat: number; changed: string }>;
    publicDeltas: Array<{ seat: number; changed: string }>;
    publicFields: string[];
  };
}

declare global {
  interface Window {
    __altar?: AltarScene;
    __altarReady?: boolean;
    __capture?: CaptureApi;
  }
}

const container = document.getElementById('capture-root');
if (!container) {
  throw new Error('capture-root 容器未找到');
}

// 场景级 E2E（w2/scene-e2e）：点击换席链路的前提是 onSeatSelect 回调在位——
// EventHandlers 的拾取段以 `if (seatId && ctx.onSeatSelect)` 为闸，回调缺位时
// setActiveSeat 整段被跳过（App/DirectorApp 均传此回调，harness 先前漏传）。
const onSeatSelect = (seatId: number) => {
  console.log(`[capture] onSeatSelect: ${seatId}`);
};
// #10 C-2：取证 harness 与 #7 同口径 —— 能力探测先行，禁 WebGL 启动时走 tier='none'
// 无画档。同一条 1800s 时间轴照跑（#4 不变量：只停画、不停时钟），取景空转不抛错。
let altar = new AltarScene(container, INITIAL_SPIRAL_EVENTS, onSeatSelect, undefined, undefined, {
  tier: detectWebglTier()
});
// 导演档：公共仪式同一条 1800s 时间轴；速度/取景均按工程入口放开。
altar.setRole('director');
altar.startRitual();
window.__altar = altar;

/** 席位锚点：引用公共侧席位权威（spiral_events）派生，不复制坐标（同 honor/fixture 口径）。 */
const e2eAnchors: readonly SeatAnchor[] = INITIAL_SPIRAL_EVENTS.map((event) => ({
  seatId: event.seat_id,
  status: event.seat_status,
  isPrime: event.is_prime,
  isFinale: event.is_finale
}));

/** 私有成员结构化视口读取 —— 仅本 harness，不进 dist（既有先例：pose()）。 */
function viewport(instance: AltarScene) {
  return instance as unknown as {
    activeSeatId: number | null;
    seatPads: Map<number, { getWorldPosition: (v: Vector3) => void }>;
    scene: { fog: { density: number } | null };
    camera: {
      position: Vector3;
      fov: number;
      projectionMatrix: { elements: number[] };
      matrixWorldInverse: { elements: number[] };
    };
    controls: { target: Vector3 };
  };
}

function buildScene(): AltarScene {
  const next = new AltarScene(container, INITIAL_SPIRAL_EVENTS, onSeatSelect, undefined, undefined, {
    tier: detectWebglTier()
  });
  next.setRole('director');
  next.startRitual();
  window.__altar = next;
  return next;
}

window.__capture = {
  seek: (sec: number) => altar.seekTo(sec),
  start: (rate: number) => altar.setPlaybackRate(rate),
  time: () => altar.currentRitualTime,
  rate: () => altar.playbackRate,
  phaseAt: (sec: number) => ritualPhaseAt(sec),
  litSeatsAt: (sec: number) => ritualLitSeatsAt(sec),
  // #10 实拍位姿读数：读的是**真实** camera/controls/fov（applyCeremonyView 每帧整写
  // 后的落点），不是 ceremonyPoseAt 的纯函数回显 —— 这样 C-3/C-4 才有判别力。
  pose: () => {
    const rig = viewport(altar);
    return {
      x: rig.camera.position.x,
      y: rig.camera.position.y,
      z: rig.camera.position.z,
      tx: rig.controls.target.x,
      ty: rig.controls.target.y,
      tz: rig.controls.target.z,
      fov: rig.camera.fov
    };
  },
  orthoTopdown: (halfWidth: number = PYRAMID_HALF) => {
    const cam = altar.setOrthoTopdown(halfWidth);
    return cam.top; // 半高（世界单位）—— 供驱动换算
  },
  clearOrtho: () => altar.clearOrthoTopdown(),
  e2e: {
    activeSeat: () => viewport(altar).activeSeatId ?? null,
    canvasCount: () => container.querySelectorAll('canvas').length,
    screenPosOf: (seatId: number) => {
      const rig = viewport(altar);
      const pad = rig.seatPads.get(seatId);
      if (!pad) return { x: 0, y: 0, visible: false };
      const world = new Vector3();
      pad.getWorldPosition(world);
      // 标准 three 投影链：world → camera 空间（matrixWorldInverse）→ NDC（projectionMatrix）
      const ndc = world
        .clone()
        .applyMatrix4(rig.camera.matrixWorldInverse as unknown as Matrix4Like)
        .applyMatrix4(rig.camera.projectionMatrix as unknown as Matrix4Like);
      const visible = ndc.z > -1 && ndc.z < 1;
      const rect = container.getBoundingClientRect();
      return {
        x: (ndc.x * 0.5 + 0.5) * rect.width,
        y: (-ndc.y * 0.5 + 0.5) * rect.height,
        visible
      };
    },
    snapshot: () => {
      const rig = viewport(altar);
      const elapsed = altar.currentRitualTime;
      return {
        elapsed,
        phase: ritualPhaseAt(elapsed),
        litSeats: ritualLitSeatsAt(elapsed),
        activeSeat: rig.activeSeatId ?? null,
        canvasCount: container.querySelectorAll('canvas').length,
        fogDensity: rig.scene.fog ? rig.scene.fog.density : 0,
        camera: {
          x: rig.camera.position.x,
          y: rig.camera.position.y,
          z: rig.camera.position.z,
          tx: rig.controls.target.x,
          ty: rig.controls.target.y,
          tz: rig.controls.target.z,
          fov: rig.camera.fov
        }
      };
    },
    destroyAndRebuild: () => {
      altar.destroy();
      altar = buildScene();
      return { canvasCount: container.querySelectorAll('canvas').length };
    },
    honorRun: (ranking: MonthlyRanking, anchors: readonly SeatAnchor[] = e2eAnchors) => {
      const agg = aggregateHonor(ranking, anchors);
      const pub = toPublicView(ranking, anchors);
      return {
        epochTag: agg.epochTag,
        seatCount: agg.seatCount,
        excludedCount: agg.excludedCount,
        adminDeltas: agg.badges.map((b) => ({ seat: b.seatIndex, changed: b.changed })),
        publicDeltas: pub.badges.map((b) => ({ seat: b.seatIndex, changed: b.changed })),
        publicFields: Object.keys(pub)
      };
    }
  },
  TOTAL: RITUAL_TOTAL_SEC
};

/** Matrix4Like：three Matrix4 的最小结构（applyMatrix4 只吃 elements）。 */
interface Matrix4Like {
  elements: number[];
}

window.__altarReady = true;
console.log(`[capture] AltarScene ready; RITUAL_TOTAL_SEC=${RITUAL_TOTAL_SEC}s`);
