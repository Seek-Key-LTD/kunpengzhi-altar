// 朗诵播放模块 —— Gitea #11-B（《茶史五绝赋》17 段录音）
//
// ── 单一职责 ────────────────────────────────────────────────────────────
// 只负责：① 章节 manifest；② HTMLAudioElement 生命周期；③ 顺序续播；
// ④ 进度 / 错误回调；⑤ 停止与 dispose()。
//
// **不做**（越界职责一律不碰）：
//   · 不引网络层 / UI / Three.js 场景逻辑；
//   · 不接触对象存储（只有同域只读路径 `/ritual-audio/chap_NN.mp3`，无 bucket/key/凭据）；
//   · **不新建任何计时器或第二套时间轴** —— 音量只由既有唯一时间轴派生的
//     `phaseEnvelope.envelopeAt(sec)` 决定，仪式秒数由既有时间轴逐帧喂入；
//   · 不自行 hook 全局事件、不自动播放（播放必须发生在既有用户手势之后，由调用方显式触发）。
//
// ── fail-soft（硬要求） ─────────────────────────────────────────────────
// 单章网络 / 解码失败 → 记录**可诊断**原因（章节序号 + 分类原因，**不含** URL/文件名/堆栈），
// **跳过该章继续后续章节**；不崩、不无限重试；对外文本不含任何工程化字样。

import { envelopeAt, type AudioLayer } from './phaseEnvelope';

/** 同域只读路由前缀（唯一可配点）。route 形态确定后一次性切换。 */
export const RITUAL_AUDIO_BASE_PATH = '/ritual-audio/';

/** 朗诵音量取用包络的哪一条声链（与既有唯一时间轴同源，无第二套时间轴）。 */
export const NARRATION_ENVELOPE_LAYER: AudioLayer = 'water';

/** 章节总数（单一真源）。 */
export const NARRATION_CHAPTER_COUNT = 17;

/** 失败次数上界：最多推进章节数次即停，杜绝无限重试。 */
export const NARRATION_MAX_FAILURES = NARRATION_CHAPTER_COUNT;

/** 章节标识（单一真源，**显式** 17 项，顺序即播放顺序；无通配、无运行时拼装）。 */
export const NARRATION_CHAPTER_IDS: readonly string[] = [
  'chap_00',
  'chap_01',
  'chap_02',
  'chap_03',
  'chap_04',
  'chap_05',
  'chap_06',
  'chap_07',
  'chap_08',
  'chap_09',
  'chap_10',
  'chap_11',
  'chap_12',
  'chap_13',
  'chap_14',
  'chap_15',
  'chap_16'
];

/** 单章条目。 */
export interface NarrationChapter {
  /** 章节序号 [0, 16]。 */
  readonly index: number;
  /** 章节标识（如 `chap_00`）。 */
  readonly id: string;
}

/** 章节 manifest（显式 17 项；`url` 由前缀即时派生，故前缀改一处即整体切换）。 */
export const NARRATION_MANIFEST: readonly NarrationChapter[] = [
  { index: 0, id: 'chap_00' },
  { index: 1, id: 'chap_01' },
  { index: 2, id: 'chap_02' },
  { index: 3, id: 'chap_03' },
  { index: 4, id: 'chap_04' },
  { index: 5, id: 'chap_05' },
  { index: 6, id: 'chap_06' },
  { index: 7, id: 'chap_07' },
  { index: 8, id: 'chap_08' },
  { index: 9, id: 'chap_09' },
  { index: 10, id: 'chap_10' },
  { index: 11, id: 'chap_11' },
  { index: 12, id: 'chap_12' },
  { index: 13, id: 'chap_13' },
  { index: 14, id: 'chap_14' },
  { index: 15, id: 'chap_15' },
  { index: 16, id: 'chap_16' }
];

/** 章节同域只读路径（唯一拼装点；不含任何对象存储信息）。 */
export function chapterUrl(chapter: NarrationChapter): string {
  return `${RITUAL_AUDIO_BASE_PATH}${chapter.id}.mp3`;
}

/** 进度回调载荷。 */
export interface NarrationProgress {
  readonly index: number;
  readonly id: string;
  readonly currentTime: number;
  readonly duration: number;
}

/** 错误回调载荷：`reason` 为**分类**原因，绝不含 URL / 文件名 / 堆栈。 */
export interface NarrationFailure {
  readonly index: number;
  readonly id: string;
  readonly reason: string;
}

/** 事件回调集合（全部可选）。 */
export interface NarrationEvents {
  onChapterStart?: (chapter: NarrationChapter) => void;
  onChapterEnd?: (chapter: NarrationChapter) => void;
  onProgress?: (progress: NarrationProgress) => void;
  onError?: (failure: NarrationFailure) => void;
  onComplete?: () => void;
}

/** 构造选项。 */
export interface NarrationOptions {
  events?: NarrationEvents;
  /** 音频元素工厂（默认 `() => new Audio()`）；测试注入桩。 */
  createAudio?: () => HTMLAudioElement;
}

type BoundListener = { type: string; fn: EventListener };

/** 将 `MediaError.code` 映射为可诊断、无工程信息的分类原因。 */
function mediaErrorReason(code: number | undefined): string {
  switch (code) {
    case 1:
      return '播放被中止';
    case 2:
      return '网络错误';
    case 3:
      return '解码错误';
    case 4:
      return '格式不支持';
    default:
      return '播放错误';
  }
}

/**
 * 朗诵播放器：顺序续播 17 章，音量随既有时间轴包络调制，失败即跳过并继续。
 *
 * 典型用法（在既有用户手势回调里）：
 *   const narration = new RitualNarration({ events });
 *   narration.setRitualTime(currentRitualSec); // 由既有时间轴逐帧喂入
 *   narration.play();                          // 显式启动
 *   // …结束时 narration.dispose();
 */
export class RitualNarration {
  private readonly events: NarrationEvents;
  private readonly createAudio: () => HTMLAudioElement;

  private el: HTMLAudioElement | null = null;
  private bound: BoundListener[] = [];
  private currentIndex = 0;
  private chapterActive = false;
  private playing = false;
  private disposed = false;
  private ritualSec = 0;
  private failures = 0;

  constructor(options: NarrationOptions = {}) {
    this.events = options.events ?? {};
    this.createAudio = options.createAudio ?? ((): HTMLAudioElement => new Audio());
  }

  /** 当前章节序号。 */
  get chapterIndex(): number {
    return this.currentIndex;
  }

  /** 是否正在播放。 */
  get isPlaying(): boolean {
    return this.playing;
  }

  /** 是否已释放。 */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** 已发生的失败次数（有界）。 */
  get failureCount(): number {
    return this.failures;
  }

  /** 当前音量：由既有唯一时间轴包络派生（无元素时也返回目标值）。 */
  get volume(): number {
    return this.envelopeVolume(this.ritualSec);
  }

  /**
   * 由**既有唯一时间轴**喂入当前仪式秒数；模块内**无**计时器。
   * 立即把该时刻的包络增益应用到当前音频元素。
   */
  setRitualTime(sec: number): void {
    this.ritualSec = Number.isFinite(sec) ? sec : 0;
    if (this.el) this.el.volume = this.volume;
  }

  /**
   * 显式启动（须在用户手势之后由调用方触发；模块不 hook 全局事件）。
   * @param fromChapter 起始章节序号（缺省 0）。
   */
  play(fromChapter = 0): void {
    if (this.disposed || this.playing) return;
    const start = Number.isFinite(fromChapter) ? Math.max(0, Math.floor(fromChapter)) : 0;
    this.playing = true;
    this.openChapter(start);
  }

  /** 停止并复位（保留实例，可再次 `play`）。 */
  stop(): void {
    if (this.disposed) return;
    this.playing = false;
    this.releaseElement();
  }

  /** 释放：暂停、清 `src`、移除全部监听、弃实例；之后不再任何播放 / 请求。 */
  dispose(): void {
    if (this.disposed) return;
    this.playing = false;
    this.releaseElement();
    this.disposed = true;
  }

  // ── 内部 ────────────────────────────────────────────────────────────
  private envelopeVolume(sec: number): number {
    const gains = envelopeAt(sec);
    const v = gains[NARRATION_ENVELOPE_LAYER];
    if (!Number.isFinite(v)) return 0;
    return Math.min(1, Math.max(0, v));
  }

  private ensureElement(): HTMLAudioElement {
    if (this.el) return this.el;
    const el = this.createAudio();
    this.el = el;
    this.bind(el);
    return el;
  }

  private bind(el: HTMLAudioElement): void {
    const onEnded: EventListener = (): void => this.handleEnded();
    const onError: EventListener = (): void => this.handleElementError();
    const onTimeUpdate: EventListener = (): void => this.handleTimeUpdate();
    const onLoadedMetadata: EventListener = (): void => {
      if (this.el) this.el.volume = this.volume;
    };
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    this.bound = [
      { type: 'ended', fn: onEnded },
      { type: 'error', fn: onError },
      { type: 'timeupdate', fn: onTimeUpdate },
      { type: 'loadedmetadata', fn: onLoadedMetadata }
    ];
  }

  private releaseElement(): void {
    this.chapterActive = false;
    const el = this.el;
    if (!el) return;
    for (const { type, fn } of this.bound) {
      el.removeEventListener(type, fn);
    }
    this.bound = [];
    try {
      el.pause();
    } catch {
      /* 忽略桩差异 */
    }
    try {
      el.removeAttribute('src');
      el.load();
    } catch {
      /* 忽略桩差异 */
    }
    this.el = null;
  }

  private openChapter(index: number): void {
    if (this.disposed || !this.playing) return;
    if (index >= NARRATION_MANIFEST.length) {
      this.playing = false;
      this.releaseElement();
      this.events.onComplete?.();
      return;
    }
    const chapter = NARRATION_MANIFEST[index];
    this.currentIndex = index;
    this.chapterActive = true;

    const el = this.ensureElement();
    el.src = chapterUrl(chapter);
    el.volume = this.volume;
    this.events.onChapterStart?.(chapter);

    if (!this.safePlay(el)) {
      // 同步启动失败（如未获手势 / 被拒）→ 记录并续走，不在此无限重试。
      this.failCurrent('播放启动被拒');
    }
  }

  private safePlay(el: HTMLAudioElement): boolean {
    try {
      const result = el.play();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((): void => {
          if (this.playing && this.chapterActive) this.failCurrent('播放启动被拒');
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  private handleEnded(): void {
    if (this.disposed || !this.playing || !this.chapterActive) return;
    this.chapterActive = false;
    const chapter = NARRATION_MANIFEST[this.currentIndex];
    this.events.onChapterEnd?.(chapter);
    // 「ended 之后才启动下一章」——顺序续播的唯一推进点。
    this.openChapter(this.currentIndex + 1);
  }

  private handleElementError(): void {
    if (this.disposed || !this.playing || !this.chapterActive) return;
    const code = this.el && this.el.error ? this.el.error.code : undefined;
    this.failCurrent(mediaErrorReason(code));
  }

  private handleTimeUpdate(): void {
    if (this.disposed || !this.playing || !this.el) return;
    const chapter = NARRATION_MANIFEST[this.currentIndex];
    this.events.onProgress?.({
      index: chapter.index,
      id: chapter.id,
      currentTime: this.el.currentTime,
      duration: this.el.duration
    });
  }

  private failCurrent(reason: string): void {
    if (!this.chapterActive) return;
    this.chapterActive = false;
    const chapter = NARRATION_MANIFEST[this.currentIndex];
    this.failures += 1;
    this.events.onError?.({ index: chapter.index, id: chapter.id, reason });
    if (this.failures >= NARRATION_MAX_FAILURES) {
      // 有界：达上界即停，绝不无限重试。
      this.playing = false;
      this.releaseElement();
      return;
    }
    // 跳过该章，继续后续章节（fail-soft）。
    this.openChapter(this.currentIndex + 1);
  }
}
