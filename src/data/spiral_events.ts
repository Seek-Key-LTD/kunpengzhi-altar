import { SpiralEvent } from '../types/altar';

// 12-TET Note helper
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function getMidiNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

// Generate square Ulam spiral points for 49 seats
function generateSpiralCoords(total: number = 49): Array<{ x: number; z: number }> {
  const coords: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
  let x = 0;
  let z = 0;
  let stepSize = 1;
  
  while (coords.length < total) {
    // Move East (+X)
    for (let i = 0; i < stepSize && coords.length < total; i++) {
      x += 1;
      coords.push({ x, z });
    }
    // Move North (+Z)
    for (let i = 0; i < stepSize && coords.length < total; i++) {
      z += 1;
      coords.push({ x, z });
    }
    stepSize += 1;
    // Move West (-X)
    for (let i = 0; i < stepSize && coords.length < total; i++) {
      x -= 1;
      coords.push({ x, z });
    }
    // Move South (-Z)
    for (let i = 0; i < stepSize && coords.length < total; i++) {
      z -= 1;
      coords.push({ x, z });
    }
    stepSize += 1;
  }
  return coords.slice(0, total);
}

const spiralCoords = generateSpiralCoords(49);

// Pentatonic / Modal 12-TET motif seeds across 7 layers
const LAYER_BASE_NOTES = [72, 69, 65, 62, 57, 53, 48]; // High register down to deep bass
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

export const INITIAL_SPIRAL_EVENTS: SpiralEvent[] = spiralCoords.map((coord, idx) => {
  const seatId = idx + 1;
  const isFinale = seatId === 49;
  
  // Distribute 4 rings into 7 stepped elevation tiers
  let layer = 1;
  if (seatId === 1) layer = 1;
  else if (seatId <= 5) layer = 2;
  else if (seatId <= 9) layer = 3;
  else if (seatId <= 17) layer = 4;
  else if (seatId <= 25) layer = 5;
  else if (seatId <= 37) layer = 6;
  else layer = 7;

  const elevation = 8 - layer; // Height 7 down to 1
  const arrivalBeat = idx * 1.5;
  const arrivalSeconds = Number((arrivalBeat * 0.75).toFixed(2)); // Tempo ~80bpm
  
  // Musical mapping: pentatonic notes distributed on 12-TET
  const baseMidi = LAYER_BASE_NOTES[layer - 1];
  const pentatonicOffsets = [0, 2, 4, 7, 9, 12, 14];
  const midiNote = baseMidi + pentatonicOffsets[idx % pentatonicOffsets.length];
  
  const zodiacSector = ((idx % 12) + 1);
  const isReserved = seatId <= 8;
  const reservedInfo = INITIAL_RESERVED_SEATS[seatId];
  const displayName = isReserved 
    ? reservedInfo.name 
    : (OPEN_SEAT_NAMES[seatId - 9] || `守坛人·${seatId}`);
  const roleTitle = isReserved ? reservedInfo.title : `第${seatId}席·星宿探索者`;
  const message = isReserved 
    ? reservedInfo.msg 
    : (isFinale 
        ? '四十九席圆满，黄道回流归元。水运无极，自运维生生不息。' 
        : `寄语于第${seatId}席，顺水流而巡礼，承七级之声光，与天地同波。`);
  const starshipName = isReserved ? reservedInfo.starship : `巡天舟·0${seatId}号`;

  return {
    seat_id: seatId,
    seat_status: isReserved ? 'reserved' : 'open',
    layer,
    spiral_index: seatId,
    grid_x: coord.x,
    grid_z: coord.z,
    elevation,
    water_arrival_beat: arrivalBeat,
    water_arrival_seconds: arrivalSeconds,
    midi_note: midiNote,
    midi_note_name: getMidiNoteName(midiNote),
    midi_velocity: isFinale ? 100 : (70 + (seatId % 20)),
    midi_duration_beats: isFinale ? 4.0 : 1.5,
    harmony_event: isFinale ? 'cadence_finale_major' : (seatId % 4 === 0 ? 'mode_shift' : 'pentatonic_flow'),
    flower_type: FLOWER_TYPES[idx % FLOWER_TYPES.length],
    flower_color: FLOWER_COLORS[idx % FLOWER_COLORS.length],
    light_preset: LIGHT_PRESETS[idx % LIGHT_PRESETS.length],
    camera_target: `seat_${seatId}`,
    starship_id: `ship_${seatId}`,
    starship_name: starshipName,
    display_name: displayName,
    role_title: roleTitle,
    message_excerpt: message,
    zodiac_sector: zodiacSector,
    is_finale: isFinale,
    metadata_version: 1
  };
});
