import { SpiralEvent } from '../types/altar';
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
 * 音域底座：**从中央 C 往下一组键子起，向上四个八度**——
 *   第 49 席 C3（MIDI 48）→ 第 1 席 C7（MIDI 96），共 49 个半音。
 *   （48 = 中央 C 60 − 12；96 − 48 = 48 个半音 = 12 × 4，加起点共 49）
 *
 * 方向：水顺螺旋往下沉，音就往下掉 —— **第 1 席最高（塔顶 C7），第 49 席最低（塔基 C3）**。
 * 位置即音高，不是配乐。
 */
export const SEAT_TOP_MIDI = 96; // C7 —— 第 1 席
export const SEAT_BOTTOM_MIDI = 48; // C3 —— 第 49 席
export function seatMidi(seatId: number): number {
  return SEAT_TOP_MIDI - (seatId - 1);
}

const FLOWER_TYPES: Array<SpiralEvent['flower_type']> = [
  'peony', 'lotus', 'plum', 'orchid', 'bamboo', 'chrysanthemum', 'pine'
];
const FLOWER_COLORS = ['#f43f5e', '#ec4899', '#a855f7', '#38bdf8', '#10b981', '#fbbf24', '#f97316'];
const LIGHT_PRESETS = ['gold_corona', 'jade_glow', 'cyan_pulse', 'crimson_flare', 'amber_halo', 'violet_resonance', 'bronze_radiance'];

const INITIAL_RESERVED_SEATS: Record<number, { name: string; title: string; msg: string; starship: string }> = {
  1: { name: '青衣', title: '司天监·首座', msg: '大衍之数五十，其用四十有九。虚一以象太极，运筹以纪乾坤。', starship: '天权号·太一星舰' },
  2: { name: '峨眉', title: '巡山令·掌节', msg: '千岩竞秀，万壑争流。一滴落处，化作回声。', starship: '凌云号·飞羽星舰' },
  3: { name: '乐山', title: '镇江使·大佛座', msg: '水到渠成，声震林木。凡所经过，皆留回响。', starship: '九峰号·重明星舰' },
  4: { name: '渔阳', title: '边塞督·金钲手', msg: '鼙鼓动地，风云聚散。沧海桑田，水道长存。', starship: '破阵号·朱雀星舰' },
  5: { name: '白鹤', title: '返场客·青囊使', msg: '乘风驭气，朝游北海。流水自运，不舍昼夜。', starship: '乘霄号·白泽星舰' },
  6: { name: '沧浪', title: '返场客·观水翁', msg: '沧浪之水清兮，可以濯吾缨；沧浪之水浊兮，可以濯吾足。', starship: '凌波号·灵鲲星舰' },
  7: { name: '瑶琴', title: '度曲使·调音监', msg: '十二律吕成均，七等声场迭起。弦歌不辍，天下同和。', starship: '太古号·伏羲星舰' },
  8: { name: '后土', title: '扶犁使·厚德长', msg: '地载万物，水润苍生。退台七级，自成方圆。', starship: '镇坤号·应龙星舰' }
};

const OPEN_SEAT_NAMES = [
  '蓬莱行舟', '太白留白', '赤壁照夜', '昆仑玉碎', '云梦客', '星河摆渡', '九嶷竹影', '潇湘夜雨',
  '终南隐鳞', '东海扬尘', '扶摇九万', '天姥晨霞', '寒江独钓', '枫桥夜泊', '雁门孤烟', '阳关折柳',
  '玉门春风', '武陵桃花', '洞庭波撼', '姑苏晚钟', '兰亭修禊', '临安初雨', '广陵散人', '剑门倚天',
  '铜雀春深', '赤松行者', '玄都观主', '问鼎中原', '玉门客客', '洗砚池人', '踏雪寻梅', '醉翁引泉',
  '滕王飞阁', '岳阳重楼', '锦官丝管', '秋水浮槎', '沧海遗珠', '长河落日', '紫禁星野', '终卷守夜人', '黄道归真'
];

export const INITIAL_SPIRAL_EVENTS: SpiralEvent[] = SEAT_PLAN.map((seat, idx) => {
  const seatId = idx + 1;
  const n = seat.level; // 台阶级号 1..7
  const isFinale = seatId === 49;
  const isPrime = isPrimeNumber(seatId);

  const elevation = seatElevation(seatId);
  const arrivalBeat = idx * 1.5;
  const arrivalSeconds = Number((arrivalBeat * 0.75).toFixed(2));

  // 49 音 = 4 组 × 12 键 + 1：中央 C 往下，每席降一个半音
  const midiNote = seatMidi(seatId);

  const zodiacSector = ((seatId - 1) % 12) + 1;
  const isReserved = seatId <= 8;
  const reservedInfo = INITIAL_RESERVED_SEATS[seatId];
  const displayName = isReserved
    ? reservedInfo.name
    : (OPEN_SEAT_NAMES[seatId - 9] || `守坛人·${seatId}`);
  const roleTitle = isReserved
    ? reservedInfo.title
    : (isPrime ? '质数序列 · 秩序涌现位' : `第${seatId}席·星宿探索者`);
  const message = isReserved
    ? reservedInfo.msg
    : (isFinale
      ? '四十九席圆满，黄道回流归元。水入回收渠，翻斗排空复位，等待下一轮。'
      : (isPrime
        ? `质数在混沌里自排斜线，文明在乱世里走出秩序。此为第${seatId}席质数锚点。`
        : `寄语于第${seatId}席，顺水流而巡礼，承连续螺旋之梯度，与天地同波。`));
  const starshipName = isReserved ? reservedInfo.starship : `巡天舟·0${seatId}号`;

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
    harmony_event: isFinale ? 'cadence_finale' : (isPrime ? 'prime_overtone_chime' : 'chromatic_descent'),
    flower_type: FLOWER_TYPES[idx % FLOWER_TYPES.length],
    flower_color: isPrime ? '#38bdf8' : FLOWER_COLORS[idx % FLOWER_COLORS.length],
    light_preset: isPrime ? 'cyan_prime_ray' : LIGHT_PRESETS[idx % LIGHT_PRESETS.length],
    camera_target: `seat_${seatId}`,
    starship_id: `ship_${seatId}`,
    starship_name: starshipName,
    display_name: displayName,
    role_title: roleTitle,
    message_excerpt: message,
    zodiac_sector: zodiacSector,
    is_prime: isPrime,
    is_finale: isFinale,
    metadata_version: 2
  };
});
