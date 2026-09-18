import { SpiralEvent, isSeatId } from '../types/altar';
import {
  SEATS_PER_LEVEL,
  seatElevation,
  seatLevel,
  ulamCoords
} from './altarGeometry';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function getMidiNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function isPrimeNumber(n: number): boolean {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

/**
 * 49 席的平面坐标：7×7 方形螺旋，等距。
 *
 * 第 1 席在正中，然后按方形螺旋绕出去。方形螺旋每走一步正好 1 格，
 * 所以**从头到尾、任意相邻两席之间的距离恒等于 1 格**。
 * 高度按「每 7 席一级、每级低 1 砖」，水从第 1 席一路被重力推到第 49 席。
 */
const SEAT_PLAN = ulamCoords(SEATS_PER_LEVEL * 7).map((p, idx) => {
  const seatId = idx + 1;
  const level = seatLevel(seatId);
  return { level, x: p.x, z: p.z };
});

/**
 * 49 个音 = 4 组键子 × 12 键 + 1 = 49。
 *
 * 音域底座：第 1 席 C2（MIDI 36）→ 第 49 席 C6（MIDI 84），
 * 恰好 48 个半音；水向外、向下，名字与音高则逐级上升。
 * 位置即音高，不是配乐。
 */
export const SEAT_BOTTOM_MIDI = 36; // C2 —— 第 1 席
export const SEAT_TOP_MIDI = 84; // C6 —— 第 49 席
export function seatMidi(seatId: number): number {
  // #00 无极点（锚点 0）不是席位：绝不占用任何音高槽位。
  // 越界与非整数同样拒发 —— 音高路径对“非席位”一律闭合（唯一准入闸门 = isSeatId）。
  if (!isSeatId(seatId)) {
    throw new RangeError(
      `seatMidi: 席位号必须是 1..49 的整数，收到 ${seatId}；#00 无极点无音高`
    );
  }
  return SEAT_BOTTOM_MIDI + (seatId - 1);
}

const FLOWER_TYPES: Array<SpiralEvent['flower_type']> = [
  'peony', 'lotus', 'plum', 'orchid', 'bamboo', 'chrysanthemum', 'pine'
];
const FLOWER_COLORS = ['#f43f5e', '#ec4899', '#a855f7', '#38bdf8', '#10b981', '#fbbf24', '#f97316'];
const LIGHT_PRESETS = ['gold_corona', 'jade_glow', 'cyan_pulse', 'crimson_flare', 'amber_halo', 'violet_resonance', 'bronze_radiance'];

// 讲解 / 汇报文案（保留名册、开放席名、message_excerpt、harmony_event、starship_*、
// camera_target）已迁至 `src/director/seatPresentation.ts`（仅导演台消费）——
// 避免公共 bundle 夹带导演文案（#5 代码分割）。本模块只保留公共仪式所需的数据面。

export const INITIAL_SPIRAL_EVENTS: SpiralEvent[] = SEAT_PLAN.map((seat, idx) => {
  const seatId = idx + 1;
  const n = seat.level; // 台阶级号 1..7
  const isFinale = seatId === 49;
  const isPrime = isPrimeNumber(seatId);

  const elevation = seatElevation(seatId);
  const arrivalBeat = idx * 1.5;
  const arrivalSeconds = Number((arrivalBeat * 0.75).toFixed(2));

  // 49 音 = 4 组 × 12 键 + 1：从 C2 起，每席升一个半音
  const midiNote = seatMidi(seatId);

  const zodiacSector = ((seatId - 1) % 12) + 1;
  const isReserved = seatId <= 8;

  return {
    seat_id: seatId,
    seat_status: isReserved ? 'reserved' : 'open',
    layer: n,
    spiral_index: seatId,
    grid_x: seat.x,
    grid_z: seat.z,
    elevation,
    water_arrival_beat: arrivalBeat,
    water_arrival_seconds: arrivalSeconds,
    midi_note: midiNote,
    midi_note_name: getMidiNoteName(midiNote),
    midi_velocity: isFinale ? 100 : (isPrime ? 92 : (70 + (seatId % 18))),
    midi_duration_beats: isFinale ? 4.0 : 1.5,
    flower_type: FLOWER_TYPES[idx % FLOWER_TYPES.length],
    flower_color: isPrime ? '#38bdf8' : FLOWER_COLORS[idx % FLOWER_COLORS.length],
    light_preset: isPrime ? 'cyan_prime_ray' : LIGHT_PRESETS[idx % LIGHT_PRESETS.length],
    zodiac_sector: zodiacSector,
    is_prime: isPrime,
    is_finale: isFinale,
    metadata_version: 2
  };
});
