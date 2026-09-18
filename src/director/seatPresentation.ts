// 导演台「讲解 / 汇报」字段 —— 单独成模块，**绝不进公共 chunk**（#5 代码分割）。
//
// 公共仪式（App → AltarScene → altarAudio）只读事件的坐标 / 音高 / 层高 / 时序，
// 从不读讲解文案。这些文案（display_name / role_title / message_excerpt /
// starship_* / harmony_event / camera_target）只由导演台的 SeatDetailPanel 展示。
// 若把它们留在 src/data/spiral_events.ts，公共 bundle 会夹带导演文案（访客 view-source
// 即可读到「大衍之数五十…」「chromatic_descent」等）。故搬来这里，由导演入口按需合并。
//
// ⚠️ 本模块只可被 `src/director/**` 引用；一旦被公共入口（App/AltarScene）引用，
// 隔离即失效。

import type { SpiralEvent } from '../types/altar';

/** 前 8 席的保留名册（讲解文案）。 */
const RESERVED_SEATS: Record<number, { name: string; title: string; msg: string; starship: string }> = {
  1: { name: '青衣', title: '司天监·首座', msg: '大衍之数五十，其用四十有九。虚一以象太极，运筹以纪乾坤。', starship: '天权号·太一星舰' },
  2: { name: '峨眉', title: '巡山令·掌节', msg: '千岩竞秀，万壑争流。一滴落处，化作回声。', starship: '凌云号·飞羽星舰' },
  3: { name: '乐山', title: '镇江使·大佛座', msg: '水到渠成，声震林木。凡所经过，皆留回响。', starship: '九峰号·重明星舰' },
  4: { name: '渔阳', title: '边塞督·金钲手', msg: '鼙鼓动地，风云聚散。沧海桑田，水道长存。', starship: '破阵号·朱雀星舰' },
  5: { name: '白鹤', title: '返场客·青囊使', msg: '乘风驭气，朝游北海。流水自运，不舍昼夜。', starship: '乘霄号·白泽星舰' },
  6: { name: '沧浪', title: '返场客·观水翁', msg: '沧浪之水清兮，可以濯吾缨；沧浪之水浊兮，可以濯吾足。', starship: '凌波号·灵鲲星舰' },
  7: { name: '瑶琴', title: '度曲使·调音监', msg: '十二律吕成均，七等声场迭起。弦歌不辍，天下同和。', starship: '太古号·伏羲星舰' },
  8: { name: '后土', title: '扶犁使·厚德长', msg: '地载万物，水润苍生。退台七级，自成方圆。', starship: '镇坤号·应龙星舰' }
};

/** 第 9..49 席的开放席名。 */
const OPEN_SEAT_NAMES = [
  '蓬莱行舟', '太白留白', '赤壁照夜', '昆仑玉碎', '云梦客', '星河摆渡', '九嶷竹影', '潇湘夜雨',
  '终南隐鳞', '东海扬尘', '扶摇九万', '天姥晨霞', '寒江独钓', '枫桥夜泊', '雁门孤烟', '阳关折柳',
  '玉门春风', '武陵桃花', '洞庭波撼', '姑苏晚钟', '兰亭修禊', '临安初雨', '广陵散人', '剑门倚天',
  '铜雀春深', '赤松行者', '玄都观主', '问鼎中原', '玉门客客', '洗砚池人', '踏雪寻梅', '醉翁引泉',
  '滕王飞阁', '岳阳重楼', '锦官丝管', '秋水浮槎', '沧海遗珠', '长河落日', '紫禁星野', '终卷守夜人', '黄道归真'
];

/** 事件的「汇报面」——导演台合并进 SpiralEvent 后再交给 SeatDetailPanel。 */
export interface SeatPresentation {
  display_name: string;
  role_title: string;
  message_excerpt: string;
  starship_id: string;
  starship_name: string;
  harmony_event: string;
  camera_target: string;
}

/** 由公共事件（坐标/音高/层高/时序 + is_prime/is_finale）派生导演台讲解文案。 */
export function seatPresentation(event: SpiralEvent): SeatPresentation {
  const seatId = event.seat_id;
  const isReserved = seatId <= 8;
  const isFinale = event.is_finale;
  const isPrime = event.is_prime;
  const reservedInfo = RESERVED_SEATS[seatId];

  const displayName = isReserved
    ? reservedInfo.name
    : OPEN_SEAT_NAMES[seatId - 9] || `守坛人·${seatId}`;
  const roleTitle = isReserved
    ? reservedInfo.title
    : isPrime
      ? '质数序列 · 秩序涌现位'
      : `第${seatId}席·星宿探索者`;
  const message = isReserved
    ? reservedInfo.msg
    : isFinale
      ? '四十九席圆满，黄道回流归元。水入回收渠，翻斗排空复位，等待下一轮。'
      : isPrime
        ? `质数在混沌里自排斜线，文明在乱世里走出秩序。此为第${seatId}席质数锚点。`
        : `寄语于第${seatId}席，顺水流而巡礼，承连续螺旋之梯度，与天地同波。`;
  const starshipName = isReserved ? reservedInfo.starship : `巡天舟·0${seatId}号`;

  return {
    display_name: displayName,
    role_title: roleTitle,
    message_excerpt: message,
    starship_id: `ship_${seatId}`,
    starship_name: starshipName,
    harmony_event: isFinale ? 'cadence_finale' : isPrime ? 'prime_overtone_chime' : 'chromatic_descent',
    camera_target: `seat_${seatId}`
  };
}
