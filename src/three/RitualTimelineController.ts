/**
 * RitualTimelineController —— 仪式时间轴子系统
 *
 * 职责：只负责 1800s 五幕时间轴的推进、幕次切换、#00 显形阈值结算、音频包络。
 * 不做：演示循环、相机切换、玉玺交互——那些归 AltarScene / DemoController / RelicController。
 */

import * as THREE from 'three';
import type { RitualPhase } from '../types/altar';
import { altarAudio } from '../audio/altarAudio';
import { phaseProgress } from '../audio/phaseEnvelope';
import {
  ritualPhaseAt,
  ritualLitSeatsAt,
  isTimelineDrivenPhase,
  RITUAL_TOTAL_SEC,
  wujiRevealStateAt,
  WUJI_REVEAL_SEC,
  WUJI_SILENCE_SEC,
  SEAT_ID_MAX
} from '../types/altar';
import { broadcastStateAt } from '../data/broadcastSchedule';
import { ceremonyVisibility, type CeremonyVisibility } from '../data/ceremonyVisibility';
import type { RitualClock } from './RitualClock';
import type { CameraRig } from './CameraRig';
import type { DualDragonRig } from './DualDragonRig';
import type { SeatLotusRig } from './SeatLotusRig';
import type { StarshipRig } from './StarshipRig';

export const RITUAL_PLAYBACK_MIN = 0.25;
export const RITUAL_PLAYBACK_MAX = 64;
export const RITUAL_PLAYBACK_DEFAULT = 1;

export interface RitualTimelineControllerOptions {
  readonly clock: RitualClock;
  readonly scene: THREE.Scene;
  readonly ambientLight: THREE.AmbientLight | null;
  readonly sunLight: THREE.DirectionalLight | null;
  readonly rimLight: THREE.DirectionalLight | null;
  readonly apexLight: THREE.PointLight | null;
  readonly wujiLight: THREE.SpotLight | null;
  readonly outerShellGroup: THREE.Group;
  readonly hollowInteriorGroup: THREE.Group;
  readonly waterworksGroup: THREE.Group;
  readonly fountainGroup: THREE.Group;
  readonly lanternsGroup: THREE.Group;
  readonly seatTrailsGroup: THREE.Group | null;
  readonly seatTrails: THREE.Line[];
  readonly wujiAbsorber: THREE.Object3D | null;
  readonly relic: { object3D: THREE.Object3D } | null;
  readonly relicDecal: { object3D: THREE.Object3D } | null;
  readonly dragon: DualDragonRig;
  readonly lotus: SeatLotusRig;
  readonly starship: StarshipRig;
  readonly rig: CameraRig;
  readonly controls: { enabled: boolean };
  readonly activeSeatId: number | null;
  readonly onKickAudio: () => void;
}

export class RitualTimelineController {
  private readonly clock: RitualClock;
  private readonly scene: THREE.Scene;
  private readonly ambientLight: THREE.AmbientLight | null;
  private readonly sunLight: THREE.DirectionalLight | null;
  private readonly rimLight: THREE.DirectionalLight | null;
  private readonly apexLight: THREE.PointLight | null;
  private readonly wujiLight: THREE.SpotLight | null;
  private readonly outerShellGroup: THREE.Group;
  private readonly hollowInteriorGroup: THREE.Group;
  private readonly waterworksGroup: THREE.Group;
  private readonly fountainGroup: THREE.Group;
  private readonly lanternsGroup: THREE.Group;
  private readonly seatTrailsGroup: THREE.Group | null;
  private readonly seatTrails: THREE.Line[];
  private readonly wujiAbsorber: THREE.Object3D | null;
  private readonly relic: { object3D: THREE.Object3D } | null;
  private readonly relicDecal: { object3D: THREE.Object3D } | null;
  private readonly dragon: DualDragonRig;
  private readonly lotus: SeatLotusRig;
  private readonly starship: StarshipRig;
  private readonly rig: CameraRig;
  private readonly controls: { enabled: boolean };
  private readonly onKickAudio: () => void;

  ritualMode = false;
  ritualLitSeats = 0;
  wujiRevealState: 'hidden' | 'revealed' | 'silent' = 'hidden';
  /** 最近一次实际落到场景的 #00 档位签名（revealed 档含 activeSeatId，换席需重放）。 */
  private lastWujiAppliedSig: string | null = null;

  // ── 每帧零分配 ──────────────────────────────────────────────────────
  // setRitualState 在 extinguishing（1440→1751）与 silence（1751→1800）两幕会被
  // setRitualTime **逐帧**调用（#00 阈值结算是唯一时间注入点）。早先每帧
  // `new THREE.Color` + `new THREE.FogExp2` + ceremonyVisibility 对象，一轮仪式
  // 仅这两幕就白产 ~460s×fps 个堆对象。背景色恒黑、雾型恒 FogExp2，故复用同一
  // 实例只改 density；visibility 纯映射按幕缓存（五幕各一份）。
  private readonly blackBackground = new THREE.Color(0x000000);
  private readonly ritualFog = new THREE.FogExp2(0x000000, 0.006);
  private readonly visibilityByPhase = new Map<RitualPhase, CeremonyVisibility>();

  private visibilityFor(phase: RitualPhase): CeremonyVisibility {
    let v = this.visibilityByPhase.get(phase);
    if (!v) {
      v = ceremonyVisibility(phase);
      this.visibilityByPhase.set(phase, v);
    }
    return v;
  }

  constructor(options: RitualTimelineControllerOptions) {
    this.clock = options.clock;
    this.scene = options.scene;
    this.ambientLight = options.ambientLight;
    this.sunLight = options.sunLight;
    this.rimLight = options.rimLight;
    this.apexLight = options.apexLight;
    this.wujiLight = options.wujiLight;
    this.outerShellGroup = options.outerShellGroup;
    this.hollowInteriorGroup = options.hollowInteriorGroup;
    this.waterworksGroup = options.waterworksGroup;
    this.fountainGroup = options.fountainGroup;
    this.lanternsGroup = options.lanternsGroup;
    this.seatTrailsGroup = options.seatTrailsGroup;
    this.seatTrails = options.seatTrails;
    this.wujiAbsorber = options.wujiAbsorber;
    this.relic = options.relic;
    this.relicDecal = options.relicDecal;
    this.dragon = options.dragon;
    this.lotus = options.lotus;
    this.starship = options.starship;
    this.rig = options.rig;
    this.controls = options.controls;
    this.onKickAudio = options.onKickAudio;
  }

  /** 当前注入的仪式时间（秒）；null = 尚未注入。 */
  get currentRitualTime(): number | null {
    return this.clock.timeSec;
  }

  /** 当前回放速率。 */
  get playbackRate(): number {
    return this.clock.rate;
  }

  /** 幕次切换的视觉落地。 */
  setRitualState(
    phase: RitualPhase,
    litSeats: number,
    activeSeatId: number | null
  ): void {
    this.ritualMode = true;
    this.ritualLitSeats = Math.max(0, Math.min(SEAT_ID_MAX, litSeats));
    this.rig.guestTimer = 0;
    this.rig.guestIndex = 0;
    this.controls.enabled = false;
    // 复用同一 Color / FogExp2 实例：本方法在幕内可能被多次调用，逐帧 new 会堆积分配。
    this.scene.background = this.blackBackground;
    const v = this.visibilityFor(phase);
    this.ritualFog.density = v.fogDensity;
    this.scene.fog = this.ritualFog;

    if (this.ambientLight) this.ambientLight.intensity = v.ambientLight;
    if (this.sunLight) this.sunLight.intensity = v.sunLight;
    if (this.rimLight) this.rimLight.intensity = v.rimLight;
    if (this.apexLight) this.apexLight.intensity = v.apexLight;
    if (this.wujiLight) this.wujiLight.intensity = v.wujiLightIntensity;

    this.outerShellGroup.visible = v.outerShellVisible;
    this.hollowInteriorGroup.visible = v.outerShellVisible;
    this.waterworksGroup.visible = v.waterworksVisible;
    this.fountainGroup.visible = v.waterworksVisible;
    this.lanternsGroup.visible = v.lanternsVisible;
    this.starship.hideAll();
    this.dragon.setRitual(this.ritualLitSeats, v.dualDragonVisible);

    if (this.seatTrailsGroup) this.seatTrailsGroup.visible = v.dualDragonVisible;
    this.seatTrails.forEach((trail, idx) => {
      trail.visible = v.dualDragonVisible && idx + 1 <= this.ritualLitSeats;
    });

    if (this.wujiAbsorber) this.wujiAbsorber.visible = v.wujiAbsorberVisible;
    if (this.relic) this.relic.object3D.visible = false;
    if (this.relicDecal) this.relicDecal.object3D.visible = false;

    this.lotus.setRitual(this.ritualLitSeats, v.isDark, activeSeatId);
  }

  /** 注入仪式时间（秒）—— 24:00 显形 / 29:11 静默的唯一驱动入口。 */
  setRitualTime(sec: number): void {
    const t = Number.isFinite(sec) ? Math.max(0, sec) : 0;
    this.clock.timeSec = t;

    const next = wujiRevealStateAt(t);
    const changed = next !== this.wujiRevealState;
    this.wujiRevealState = next;

    // 重放门控：与 AltarScene.setRitualTime 同约定——extinguishing/silent 幕的
    // setRitualState 是全量重写，签名不变时不重放（本入口不接 activeSeatId，恒 null）。
    const replay = next !== this.lastWujiAppliedSig;
    this.lastWujiAppliedSig = next;

    if (next === 'silent') {
      if (replay) this.setRitualState('silence', SEAT_ID_MAX, null);
      if (changed) {
        console.log(`[无极] #00 静默 t=${t.toFixed(0)}s ≥ ${WUJI_SILENCE_SEC}s(29:11)：除冷顶光外全坛寂灭`);
      }
      return;
    }
    if (next === 'revealed') {
      if (replay) this.setRitualState('extinguishing', SEAT_ID_MAX, null);
      if (changed) {
        console.log(`[无极] #00 显形 t=${t.toFixed(0)}s ≥ ${WUJI_REVEAL_SEC}s(24:00)：窄角冷色顶光点亮吸光体`);
      }
      return;
    }

    if (this.wujiLight) this.wujiLight.intensity = 0;
    if (this.wujiAbsorber) this.wujiAbsorber.visible = false;
    if (changed) {
      console.log(`[无极] #00 未显形 t=${t.toFixed(0)}s < 24:00：吸光体隐藏、冷顶光熄灭`);
    }
  }

  /** 启动 1800s 五幕时间轴。 */
  startRitual(): void {
    this.clock.running = true;
    const broadcast = broadcastStateAt(new Date());
    const startSec = broadcast.mode === 'live' ? broadcast.showSec ?? 0 : 0;
    this.clock.elapsed = startSec;
    this.clock.phase = ritualPhaseAt(startSec);
    this.clock.namingLitSeats = -1;
    this.setRitualTime(startSec);
    // litSeats 按接续时刻的稳态席数落位（与 AltarScene.startRitual 同口径）：
    // 直播中段入场时恒置 0 会让 lanterns 等后段各幕停在空坛且无逐帧结算点可救。
    this.setRitualState(this.clock.phase, ritualLitSeatsAt(startSec), null);
    // 门控自愈边界：复位签名，强制下一帧按当前时间/幕次重放（与 AltarScene.startRitual 同约定）。
    this.lastWujiAppliedSig = null;
    this.onKickAudio();
  }

  /** 受控回放速率。 */
  setPlaybackRate(rate: number): number {
    if (!Number.isFinite(rate)) {
      this.clock.rate = RITUAL_PLAYBACK_DEFAULT;
    } else {
      this.clock.rate = Math.min(
        RITUAL_PLAYBACK_MAX,
        Math.max(RITUAL_PLAYBACK_MIN, rate)
      );
    }
    return this.clock.rate;
  }

  /** 定位仪式时间（秒）。 */
  seekTo(sec: number): number {
    const t = Number.isFinite(sec) ? Math.max(0, Math.min(RITUAL_TOTAL_SEC, sec)) : 0;
    this.clock.elapsed = t;
    const phase = ritualPhaseAt(t);
    this.clock.phase = phase;
    const litSeats = ritualLitSeatsAt(t);
    this.clock.namingLitSeats = litSeats;
    if (isTimelineDrivenPhase(phase)) {
      this.setRitualState(phase, litSeats, null);
    }
    this.setRitualTime(t);
    return t;
  }

  /** 每帧推进 1800s 五幕时间轴。 */
  update(dt: number, activeSeatId: number): void {
    if (!this.clock.running) return;
    const step = Number.isFinite(dt) ? dt : 0;
    this.clock.elapsed = Math.min(
      RITUAL_TOTAL_SEC,
      this.clock.elapsed + step * this.clock.rate
    );

    const phase = ritualPhaseAt(this.clock.elapsed);
    if (phase !== this.clock.phase) {
      const prev = this.clock.phase;
      this.clock.phase = phase;
      if (isTimelineDrivenPhase(phase)) {
        if (phase === 'abyss') {
          this.setRitualState('abyss', 0, null);
        } else if (phase === 'naming') {
          this.clock.namingLitSeats = -1;
          this.setRitualState('naming', 0, activeSeatId);
        } else {
          this.setRitualState('lanterns', SEAT_ID_MAX, activeSeatId);
        }
      }
      console.log(`[仪式] 幕次 ${prev} → ${phase} @ ${this.clock.elapsed.toFixed(0)}s / 1800s`);
    }

    if (phase === 'naming') {
      const litSeats = ritualLitSeatsAt(this.clock.elapsed);
      if (litSeats !== this.clock.namingLitSeats) {
        this.clock.namingLitSeats = litSeats;
        this.setRitualState('naming', litSeats, activeSeatId);
      }
    }

    this.setRitualTime(this.clock.elapsed);
    altarAudio.applyPhaseEnvelope(phase, phaseProgress(this.clock.elapsed));
  }
}
