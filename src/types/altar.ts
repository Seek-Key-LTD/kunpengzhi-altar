export type SeatStatus = 'open' | 'reserved' | 'claimed' | 'hidden';

export interface SpiralEvent {
  seat_id: number;
  seat_status: SeatStatus;
  layer: number; // 1 (top) to 7 (bottom)
  spiral_index: number; // 1 to 49
  grid_x: number; // -3 to 3
  grid_z: number; // -3 to 3
  elevation: number; // 7 (highest) to 1 (lowest)
  water_arrival_beat: number;
  water_arrival_seconds: number;
  midi_note: number; // MIDI number e.g. 60 = C4
  midi_note_name: string;
  midi_velocity: number;
  midi_duration_beats: number;
  harmony_event: string;
  flower_type: 'peony' | 'lotus' | 'plum' | 'orchid' | 'bamboo' | 'chrysanthemum' | 'pine';
  flower_color: string;
  light_preset: string;
  camera_target: string;
  starship_id: string;
  starship_name: string;
  display_name: string;
  role_title?: string;
  message_excerpt: string;
  zodiac_sector: number; // 1 to 12
  is_prime: boolean; // Ulam spiral prime alignment
  is_finale: boolean;
  metadata_version: number;
}

export interface StarPaperSubmission {
  displayName: string;
  message: string;
  themeCategory: '纪念' | '启程' | '生日' | '项目' | '毕业' | '守望' | '天地' | '归真';
  symbolChoice: '花' | '鸟' | '山' | '河' | '车' | '玉' | '星' | '鼎';
  temperament: '肃穆' | '昂扬' | '安静' | '温暖' | '壮阔' | '空灵';
  visibility: 'public' | 'unlisted' | 'private';
  targetSeatId: number;
}

export type CameraMode = 'orbit' | 'patrol' | 'yin' | 'interior' | 'outer_lanterns' | 'topdown' | 'fountain' | 'cinematic';

/**
 * 身份 —— 自由度是被记录换来的。
 * guest：3 条固定 routine，禁手动，行为不进账
 * authenticated：自由相机，行为落 SBT 进座次表
 * 默认 guest。见 docs/身份与相机权限规范.md
 */
export type AltarRole = 'guest' | 'authenticated';

/** 游客的三条固定 routine */
export const GUEST_ROUTINES: CameraMode[] = ['cinematic', 'yin', 'patrol'];

/** 每条 routine 的播放时长（秒） */
export const GUEST_ROUTINE_SECONDS = 18;

export type AltarCycleState = 'accumulating' | 'overturning' | 'cascading' | 'recycling' | 'resetting';
