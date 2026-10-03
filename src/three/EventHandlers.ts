/**
 * EventHandlers —— 输入事件处理
 *
 * 职责：只负责把 DOM 事件翻译成场景操作。
 * 不做：渲染、动画、状态管理——那些归 AltarScene。
 */

import * as THREE from 'three';

export interface EventContext {
  readonly container: HTMLElement;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer | null;
  readonly raycaster: THREE.Raycaster;
  readonly mouse: THREE.Vector2;
  readonly lanternPanels: Map<number, THREE.Mesh>;
  readonly interiorStelae: Map<string, THREE.Mesh>;
  readonly seatPads: Map<number, THREE.Mesh>;
  readonly relic: {
    readonly object3D: THREE.Object3D;
    readonly pickables: () => THREE.Object3D[];
  } | null;
  readonly caps: {
    readonly freeCamera: boolean;
    readonly pickLanterns: boolean;
    readonly pickStelae: boolean;
    readonly pickSeats: boolean;
    readonly sealStamp: boolean;
    readonly sealExploded: boolean;
  };
  readonly pressedKeys: Set<string>;
  readonly onLanternSelect?: (chapterIndex: number) => void;
  readonly onInteriorPoemSelect?: (seasonId: string) => void;
  readonly onSeatSelect?: (seatId: number) => void;
  readonly onRelicSelect?: (relicId: string) => void;
  readonly focusTeaLantern: (chapterIndex: number) => void;
  readonly focusInteriorPoem: (seasonId: string) => void;
  readonly setActiveSeat: (seatId: number) => void;
  readonly selectRelic: () => void;
  readonly resetCamera: () => void;
  readonly activateGuestRoutine: () => void;
  readonly role: string;
  readonly transitioning: boolean;
  readonly setTransitioning: (v: boolean) => void;
}

/** 窗口尺寸变化 */
export function onWindowResize(ctx: EventContext): void {
  if (!ctx.container) return;
  const width = ctx.container.clientWidth;
  const height = ctx.container.clientHeight;
  // 容器瞬时折叠为 0（display:none / 布局切换）时跳过本次：aspect = width/0
  // = Infinity 会把透视投影矩阵污染成退化矩阵，且若容器恢复时不伴随 window
  // resize 事件就再无人写回 —— 保持上一次的有效投影更稳。
  if (width <= 0 || height <= 0) return;
  ctx.camera.aspect = width / height;
  ctx.camera.updateProjectionMatrix();
  ctx.renderer?.setSize(width, height);
}

/** 鼠标按下（拾取 + 游客例行） */
export function onPointerDown(ctx: EventContext, event: MouseEvent): void {
  // 访客不是自动播放的被动摄像机：每次鼠标/触摸才唤起一条固定路线。
  if (ctx.role === 'guest') {
    ctx.activateGuestRoutine();
    return;
  }
  if (!ctx.caps.freeCamera) return;

  // 用户一按鼠标，立刻放弃自动机位过渡
  ctx.setTransitioning(false);

  const rect = ctx.container.getBoundingClientRect();
  ctx.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ctx.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  ctx.raycaster.setFromCamera(ctx.mouse, ctx.camera);

  // 1. Check Outer Tea Lanterns
  if (ctx.caps.pickLanterns) {
    const lanterns = Array.from(ctx.lanternPanels.values());
    const lanternHits = ctx.raycaster.intersectObjects(lanterns);
    if (lanternHits.length > 0) {
      const hit = lanternHits[0].object;
      const chIdx = hit.userData?.chapterIndex;
      if (chIdx) {
        ctx.focusTeaLantern(chIdx);
        ctx.onLanternSelect?.(chIdx);
        return;
      }
    }
  }

  // 2. Check Interior Stelae
  if (ctx.caps.pickStelae) {
    const stelae = Array.from(ctx.interiorStelae.values());
    const stelaHits = ctx.raycaster.intersectObjects(stelae);
    if (stelaHits.length > 0) {
      const hit = stelaHits[0].object;
      const sId = hit.userData?.seasonId;
      if (sId) {
        ctx.focusInteriorPoem(sId);
        ctx.onInteriorPoemSelect?.(sId);
        return;
      }
    }
  }

  // 3. Check Seat Pads
  if (ctx.caps.pickSeats) {
    const pads = Array.from(ctx.seatPads.values());
    const seatHits = ctx.raycaster.intersectObjects(pads);
    if (seatHits.length > 0) {
      const hit = seatHits[0].object;
      const seatId = hit.userData?.seatId;
      if (seatId && ctx.onSeatSelect) {
        ctx.onSeatSelect(seatId);
        ctx.setActiveSeat(seatId);
        return;
      }
    }
  }

  // 4. 玉玺拾取
  if (ctx.caps.sealStamp || ctx.caps.sealExploded) {
    if (ctx.relic) {
      const relicHits = ctx.raycaster.intersectObjects(ctx.relic.pickables(), true);
      if (relicHits.length > 0) {
        ctx.selectRelic();
        ctx.onRelicSelect?.('imperial_seal');
      }
    }
  }
}

/** 键盘按下 */
export function onKeyDown(ctx: EventContext, event: KeyboardEvent): void {
  if (!ctx.caps.freeCamera) return;
  const key = event.key.toLowerCase();
  if (key === 'r') {
    ctx.resetCamera();
    event.preventDefault();
    return;
  }
  if (!['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(key)) return;
  ctx.pressedKeys.add(key);
  event.preventDefault();
}

/** 键盘松开 */
export function onKeyUp(ctx: EventContext, event: KeyboardEvent): void {
  ctx.pressedKeys.delete(event.key.toLowerCase());
}

/** 窗口失焦 */
export function onWindowBlur(ctx: EventContext): void {
  ctx.pressedKeys.clear();
}
