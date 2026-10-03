import * as Tone from 'tone';
import { SpiralEvent, RitualPhase } from '../types/altar';
import type { LayerGains } from './phaseEnvelope';
import { applyPhaseEnvelope as computePhaseEnvelope } from './phaseEnvelope';

class AltarAudioEngine {
  private isInitialized = false;
  private isMuted = false;
  /** 进行中的 init()：合并并发调用，避免重复造一整套乐器（Tone 节点不会自动回收）。 */
  private initPromise: Promise<void> | null = null;
  
  // Synthesizers
  private bellSynth: Tone.PolySynth | null = null;
  private plucker: Tone.PluckSynth | null = null;
  private padSynth: Tone.PolySynth | null = null;
  private waterNoise: Tone.NoiseSynth | null = null;
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private lowpass: Tone.Filter | null = null;

  // ── #4 五阶段包络：三条声链各自的 gain 节点 ──────────────────────────
  /** 水声链增益（waterNoise → waterGain → reverb）。 */
  private waterGain: Tone.Gain | null = null;
  /** 翻斗链条链增益（bucketChain → bucketFilter → bucketGain → reverb）。 */
  private bucketGain: Tone.Gain | null = null;
  /** 低频空间混响链增益（reverb → reverbGain → destination，兼作总空间总线）。 */
  private reverbGain: Tone.Gain | null = null;
  /** #4 翻斗链条声源（新增）：死点/翻斗一记金属链条声。 */
  private bucketChain: Tone.NoiseSynth | null = null;
  private bucketFilter: Tone.Filter | null = null;
  /**
   * 当前三层包络目标增益。默认 {1,1,1} = 未调制（导演/工程直入无时间轴时不淡出）；
   * 公共仪式由 AltarScene 逐帧按 ritualPhaseAt 注入，silence 幕落到 {0,0,0}。
   * 未起声时仅缓存，`init()` 完成后由 doInit 落地。
   */
  private layerGains: LayerGains = { water: 1, bucket: 1, reverb: 1 };
  /**
   * 最近一次真正落到 Tone 节点的目标增益（ramp 去抖用）。
   * AltarScene 逐帧调用 applyPhaseEnvelope —— 包络在幕内两点间是线性的，
   * 同一帧间隔内目标往往纹丝不动；不判重就会每帧 `rampTo` 重启一次
   * 0.25s 自动化调度，事件在 AudioParam 时间线上白耗 CPU。null = 尚无落地值。
   */
  private appliedGains: LayerGains | null = null;

  /**
   * 幂等且**并发安全**的初始化：多次调用共享同一个进行中的 Promise。
   *
   * Web Audio 需要用户手势；公共页在仪式开始时先尽力 init()，被浏览器挂起时
   * 由首次 pointerdown/keydown 再调一次。若不做单飞，两次并发 init() 会各造
   * 一整套 synth —— 旧的没断开就泄漏在 destination 上。
   */
  public init(): Promise<void> {
    if (this.isInitialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    await Tone.start();
    
    // Ambient spatial reverb —— 低频空间混响链。末端 reverbGain 受 #4 包络调制，
    // 兼作整条空间总线（bell/pluck/pad 也都汇入 reverb）。
    this.reverbGain = new Tone.Gain(this.layerGains.reverb).toDestination();
    this.reverb = new Tone.Reverb({
      decay: 6.5,
      preDelay: 0.08,
      wet: 0.45
    }).connect(this.reverbGain);
    await this.reverb.generate();

    this.lowpass = new Tone.Filter(120, 'lowpass').connect(this.reverb);

    this.delay = new Tone.FeedbackDelay({
      delayTime: '8n.',
      feedback: 0.25,
      wet: 0.2
    }).connect(this.lowpass);

    // High crystalline chime / bell synth
    this.bellSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 8,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 2.5, sustain: 0.1, release: 3.0 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 1.2 }
    }).connect(this.delay);
    this.bellSynth.volume.value = -10;

    // Guqin / bronze resonance pluck
    this.plucker = new Tone.PluckSynth({
      attackNoise: 1.2,
      dampening: 3500,
      resonance: 0.92
    }).connect(this.delay);
    this.plucker.volume.value = -8;

    // Warm deep modal pad
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.8, decay: 1.5, sustain: 0.6, release: 4.0 }
    }).connect(this.reverb);
    this.padSynth.volume.value = -16;

    // Water ripple subtle noise —— 水声链（经 waterGain 受包络调制）
    this.waterGain = new Tone.Gain(this.layerGains.water).connect(this.reverb);
    this.waterNoise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0 }
    }).connect(this.waterGain);
    this.waterNoise.volume.value = -24;

    // #4 翻斗链条（新增声源）：RFC-007 死点/翻斗一记金属链条声。
    // 走 bandpass 噪声 —— 轻量、像链条撞击；经 bucketGain 受包络调制。
    this.bucketGain = new Tone.Gain(this.layerGains.bucket).connect(this.reverb);
    this.bucketFilter = new Tone.Filter({ frequency: 1600, type: 'bandpass', Q: 1.6 }).connect(this.bucketGain);
    this.bucketChain = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.002, decay: 0.22, sustain: 0 }
    }).connect(this.bucketFilter);
    this.bucketChain.volume.value = -14;

    // 落地 init 前已注入的包络（AltarScene 期间可能先调用过 applyPhaseEnvelope）
    this.rampLayerGains(this.layerGains, 0);
    this.appliedGains = { ...this.layerGains };
    this.isInitialized = true;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    Tone.getDestination().mute = muted;
  }

  public getMuted() {
    return this.isMuted;
  }

  public triggerSeatEvent(event: SpiralEvent) {
    if (!this.isInitialized || this.isMuted) return;

    // C2 起逐半音上升：第 49 席回到 C6。不要从展示数据反推，
    // 这里直接保留十二平均律的物理定义。
    const noteName = Tone.Frequency('C2').transpose(event.seat_id - 1).toNote();
    const isFinale = event.is_finale;
    const now = Tone.now();

    // 1. Water drop noise
    this.waterNoise?.triggerAttack(now);

    // 2. Chime / Bell note
    if (this.bellSynth) {
      const duration = isFinale ? '2n' : '8n';
      this.bellSynth.triggerAttackRelease(noteName, duration, now + 0.02, event.midi_velocity / 127);
    }

    // 3. Bronze / Guqin Pluck resonance
    if (this.plucker) {
      this.plucker.triggerAttack(noteName, now + 0.05);
    }

    // 4. Pad chord underpinning every tier shift or special harmonic marker
    if (this.padSynth && (event.seat_id % 7 === 1 || isFinale)) {
      if (isFinale) {
        // Finale Grand Pentatonic Cadence (C - G - D - A - C)
        this.padSynth.triggerAttackRelease(['C3', 'G3', 'D4', 'E4', 'G4', 'C5'], '1n', now + 0.1);
      } else {
        const rootOctave = Math.max(2, Math.floor(event.midi_note / 12) - 2);
        this.padSynth.triggerAttackRelease([`C${rootOctave}`, `G${rootOctave}`, `D${rootOctave + 1}`], '2n', now + 0.1);
      }
    }
  }

  public triggerFountainPulse() {
    if (!this.isInitialized || this.isMuted) return;
    const now = Tone.now();
    this.padSynth?.triggerAttackRelease(['D2', 'A2', 'E3'], '2n', now);
    this.waterNoise?.triggerAttack(now);
  }

  /**
   * #4 翻斗链条：RFC-007 水梯每次死点/翻斗（`handleDiscretePhaseTransitions`）给一记链条声。
   * 顶死点(黄钟，明亮) / 底死点(林钟，低沉) 用带通中心频率区分音色。
   */
  public triggerBucketChain(tone: 'HUANG_ZHONG' | 'LIN_ZHONG' = 'HUANG_ZHONG'): void {
    if (!this.isInitialized || this.isMuted) return;
    const now = Tone.now();
    this.bucketChain?.triggerAttackRelease(0.16, now);
    this.bucketFilter?.frequency.rampTo(tone === 'HUANG_ZHONG' ? 1750 : 1250, 0.02);
  }

  /**
   * #4 五阶段包络：由单一时间轴（`ritualPhaseAt`，经 AltarScene 传入）驱动，
   * 给三条声链各自 gain。未起声时只缓存目标增益（`getLayerGains` 可读）。
   * 目标与上次已落地值全等时跳过 ramp（逐帧调用的重调度去抖，目标不变则语义等价）。
   */
  public applyPhaseEnvelope(phase: RitualPhase, secProgress: number): void {
    const gains = computePhaseEnvelope(phase, secProgress);
    this.layerGains = gains;
    if (!this.isInitialized) return;
    const a = this.appliedGains;
    if (
      a &&
      Math.abs(a.water - gains.water) < 1e-6 &&
      Math.abs(a.bucket - gains.bucket) < 1e-6 &&
      Math.abs(a.reverb - gains.reverb) < 1e-6
    ) {
      return;
    }
    this.rampLayerGains(gains);
    this.appliedGains = { ...gains };
  }

  /** 当前三层包络目标增益（供断言 / 读数）。 */
  public getLayerGains(): LayerGains {
    return { ...this.layerGains };
  }

  /** 把三层增益落到 Tone 节点；ramp<=0 时立即置值（初始化/复位用）。 */
  private rampLayerGains(g: LayerGains, ramp = 0.25): void {
    if (ramp <= 0) {
      if (this.waterGain) this.waterGain.gain.value = g.water;
      if (this.bucketGain) this.bucketGain.gain.value = g.bucket;
      if (this.reverbGain) this.reverbGain.gain.value = g.reverb;
      return;
    }
    this.waterGain?.gain.rampTo(g.water, ramp);
    this.bucketGain?.gain.rampTo(g.bucket, ramp);
    this.reverbGain?.gain.rampTo(g.reverb, ramp);
  }

  /**
   * 拆掉这一轮仪式的全部乐器。
   *
   * AltarScene.destroy() 会调用它：Tone.js 的 AudioNode 不会因为对象被 GC
   * 而自动断开，热更新十几轮之后就是一堆还连着 destination 的悬挂节点。
   * 拆完之后 isInitialized 归 false，下次 init() 会重新造一套。
   */
  public dispose() {
    if (!this.isInitialized) return;

    [this.bellSynth, this.plucker, this.padSynth, this.waterNoise, this.bucketChain].forEach((synth) => {
      try {
        synth?.dispose();
      } catch (err) {
        console.warn('音频节点释放失败：', err);
      }
    });

    try {
      this.delay?.dispose();
      this.lowpass?.dispose();
      this.reverb?.dispose();
      this.bucketFilter?.dispose();
      this.waterGain?.dispose();
      this.bucketGain?.dispose();
      this.reverbGain?.dispose();
    } catch (err) {
      console.warn('音频效果链释放失败：', err);
    }

    this.bellSynth = null;
    this.plucker = null;
    this.padSynth = null;
    this.waterNoise = null;
    this.bucketChain = null;
    this.bucketFilter = null;
    this.waterGain = null;
    this.bucketGain = null;
    this.reverbGain = null;
    this.reverb = null;
    this.delay = null;
    this.lowpass = null;
    this.isInitialized = false;
    this.initPromise = null;
    this.appliedGains = null;
  }
}

export const altarAudio = new AltarAudioEngine();
