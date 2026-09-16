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

export type CameraMode =
  | 'orbit'
  | 'patrol'
  | 'yin'
  | 'interior'
  | 'outer_lanterns'
  | 'topdown'
  | 'fountain'
  | 'cinematic'
  | 'relic';

/**
 * 身份 —— 自由度是被记录换来的。
 *
 * guest：3 条固定 routine，禁手动，行为不进账（公共入口，零改动）
 * authenticated：自由相机 + 席位/茶灯/石经**只读**点击 + **拓印**写权限
 * director：上述全部 + 玉玺**拆解与断代**（讲解权）
 *
 * 默认 guest。未认证即游客，不是"默认给自由"。见 docs/身份与相机权限规范.md
 *
 * ⚠️ 路由一律走 hash（`#/director`），**禁止** `?role=` 这类公共 query 裸露。
 */
export type AltarRole = 'guest' | 'authenticated' | 'director';

/**
 * 能力表。角色不直接判等，一律查这张表 —— 权限的增删只改这一处。
 *
 * 合规裁定（架构师）：
 *   · 拓印只写 SealStampRecord（器物内自增、不落座次表、不进 credits、不发音）
 *     ⟹ 合规，开放给 authenticated
 *   · 拆解与断代属"导演讲解权" ⟹ 只给 director
 *   · 断代层的 note 属史事注脚，展示层不得自动承载史学论断
 *     ⟹ 必须由 director 主动唤出，不得自动进公共画面
 */
export interface AltarCapabilities {
  /** 自由相机（拖拽/缩放/平移） */
  freeCamera: boolean;
  /** 点击席位（只读：只聚焦与回调，不写座次表） */
  pickSeats: boolean;
  /** 点击外围 16 面茶灯 */
  pickLanterns: boolean;
  /** 点击中空地宫石经 */
  pickStelae: boolean;
  /** 拓印（写权限） */
  sealStamp: boolean;
  /** 玉玺拆解 */
  sealExploded: boolean;
  /** 玉玺断代 */
  sealEra: boolean;
}

export const ROLE_CAPABILITIES: Record<AltarRole, AltarCapabilities> = {
  // 游客：一条能力都没有，公共入口行为逐字节保持原样
  guest: {
    freeCamera: false,
    pickSeats: false,
    pickLanterns: false,
    pickStelae: false,
    sealStamp: false,
    sealExploded: false,
    sealEra: false
  },
  // 认证：能看能点能拓印，但**不能**改圣物形态与断代
  authenticated: {
    freeCamera: true,
    pickSeats: true,
    pickLanterns: true,
    pickStelae: true,
    sealStamp: true,
    sealExploded: false,
    sealEra: false
  },
  // 导演：讲解权全开
  director: {
    freeCamera: true,
    pickSeats: true,
    pickLanterns: true,
    pickStelae: true,
    sealStamp: true,
    sealExploded: true,
    sealEra: true
  }
};

/**
 * 相机安全边界（角色化）。
 *
 * 原硬编码是 `p.y < 0.3` / `p.length() > 120`：那是给**公共入口**定的，
 * 防的是游客把镜头怼进地里或者飞出天外。但导演要贴到燕尾倒勾槽口做 macro，
 * 0.3 的地板会挡住低角度仰拍，120 的球半径也偏紧 —— 阈值必须角色化。
 * **游客档位一个数字都不能动。**
 */
export const CAMERA_SAFETY_BY_ROLE: Record<AltarRole, { minY: number; maxRadius: number }> = {
  guest: { minY: 0.3, maxRadius: 120 },
  authenticated: { minY: 0.3, maxRadius: 160 },
  director: { minY: 0.05, maxRadius: 400 }
};

/** OrbitControls 的推拉范围（角色化）：macro 特写的真正瓶颈在 minDistance */
export const CAMERA_DISTANCE_BY_ROLE: Record<AltarRole, { min: number; max: number }> = {
  guest: { min: 0.8, max: 220 },
  authenticated: { min: 0.5, max: 260 },
  director: { min: 0.25, max: 400 }
};

/** 游客的三条固定 routine */
export const GUEST_ROUTINES: CameraMode[] = ['cinematic', 'yin', 'patrol'];

/** 每条 routine 的播放时长（秒） */
export const GUEST_ROUTINE_SECONDS = 18;

export type AltarCycleState = 'accumulating' | 'overturning' | 'cascading' | 'recycling' | 'resetting';
