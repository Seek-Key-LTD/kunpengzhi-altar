/**
 * SceneDisposer —— 场景销毁子系统
 *
 * 职责：只负责场景的完整销毁（rAF/事件/DOM/几何/材质/贴图/音频）。
 * 不做：场景构建、动画循环、仪式逻辑——那些归 AltarScene。
 */

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { altarAudio } from '../audio/altarAudio';

export interface SceneDisposerOptions {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer | null;
  readonly controls: OrbitControls;
  readonly container: HTMLElement;
  readonly animationFrameId: number | null;
  readonly onWindowResize: EventListener;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onKeyUp: (event: KeyboardEvent) => void;
  readonly onWindowBlur: EventListener;
  readonly onPointerDown: (event: MouseEvent) => void;
  readonly fogCaptionEl: HTMLDivElement | null;
  readonly onWebglContextLost: EventListener;
  readonly onWebglContextRestored: EventListener;
  readonly audioResumeHandler: EventListener | null;
  readonly disposeRelic: () => void;
  readonly clearIndexes: () => void;
}

export class SceneDisposer {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly controls: OrbitControls;
  private readonly container: HTMLElement;
  private readonly animationFrameId: number | null;
  private readonly onWindowResize: EventListener;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private readonly onWindowBlur: EventListener;
  private readonly onPointerDown: (event: MouseEvent) => void;
  private readonly fogCaptionEl: HTMLDivElement | null;
  private readonly onWebglContextLost: EventListener;
  private readonly onWebglContextRestored: EventListener;
  private readonly audioResumeHandler: EventListener | null;
  private readonly disposeRelic: () => void;
  private readonly clearIndexes: () => void;

  constructor(options: SceneDisposerOptions) {
    this.scene = options.scene;
    this.renderer = options.renderer;
    this.controls = options.controls;
    this.container = options.container;
    this.animationFrameId = options.animationFrameId;
    this.onWindowResize = options.onWindowResize;
    this.onKeyDown = options.onKeyDown;
    this.onKeyUp = options.onKeyUp;
    this.onWindowBlur = options.onWindowBlur;
    this.onPointerDown = options.onPointerDown;
    this.fogCaptionEl = options.fogCaptionEl;
    this.onWebglContextLost = options.onWebglContextLost;
    this.onWebglContextRestored = options.onWebglContextRestored;
    this.audioResumeHandler = options.audioResumeHandler;
    this.disposeRelic = options.disposeRelic;
    this.clearIndexes = options.clearIndexes;
  }

  /** 完整销毁场景。 */
  dispose(): void {
    // 0. 先撤玉玺子系统
    this.disposeRelic();

    // 1. rAF
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // 2. 事件监听
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.container.removeEventListener('pointerdown', this.onPointerDown);

    // 3. 雾中字幕行
    if (this.fogCaptionEl?.parentElement) {
      this.fogCaptionEl.parentElement.removeChild(this.fogCaptionEl);
    }

    // 4. 控制器
    this.controls.dispose();

    // 5. 场景全量回收
    this.disposeSceneResources();

    // 6. 索引表与回调断开
    this.clearIndexes();

    // 7. 渲染器
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onWebglContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.onWebglContextRestored);
      this.renderer.setRenderTarget(null);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }

    // 8. Web Audio 手势兜底
    if (this.audioResumeHandler) {
      window.removeEventListener('pointerdown', this.audioResumeHandler);
      window.removeEventListener('keydown', this.audioResumeHandler);
    }

    // 9. Tone.js
    try {
      altarAudio.dispose();
    } catch (err) {
      console.warn('音频资源释放失败（不影响场景释放）：', err);
    }
  }

  /** 遍历场景，按类别回收几何/材质/贴图。 */
  private disposeSceneResources(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    const collectMaterial = (material: THREE.Material) => {
      materials.add(material);
      const record = material as unknown as Record<string, unknown>;
      Object.keys(record).forEach((key) => {
        const value = record[key];
        if (value instanceof THREE.Texture) {
          textures.add(value);
        }
      });
    };

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        if (obj.geometry) geometries.add(obj.geometry);
        if (Array.isArray(obj.material)) {
          obj.material.forEach(collectMaterial);
        } else if (obj.material) {
          collectMaterial(obj.material);
        }
      }
    });

    // 光源阴影贴图
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Light) {
        const anyLight = obj as unknown as { shadow?: { map?: THREE.RenderTarget } };
        if (anyLight.shadow?.map) {
          textures.add(anyLight.shadow.map.texture);
          anyLight.shadow.map.dispose();
        }
      }
    });

    // 场景级贴图
    if (this.scene.background instanceof THREE.Texture) {
      textures.add(this.scene.background);
    }
    if (this.scene.environment instanceof THREE.Texture) {
      textures.add(this.scene.environment);
    }

    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  }
}
