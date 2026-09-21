/**
 * #15 Sarazm 历史天象：纯函数天球计算（T2）
 *
 * 输入固定为 epoch/date + latitude + longitude + elevation，
 * 输出本地地平坐标（azimuth/altitude）。
 * 不碰 three.js，可直接单元测试。
 */

/** Sarazm 地理参数（弧度） */
export const SARAZM_LAT_RAD = (39 + 30 / 60 + 28.4 / 3600) * Math.PI / 180; // 39.5079°N
export const SARAZM_LON_RAD = (67 + 27 / 60 + 31.4 / 3600) * Math.PI / 180; // 67.4587°E
export const SARAZM_ELEVATION_M = 910;

/** 地平坐标 */
export interface HorizontalCoord {
  /** 方位角（弧度，从正北顺时针） */
  readonly azimuth: number;
  /** 高度角（弧度，0=地平线，π/2=天顶） */
  readonly altitude: number;
}

/** 赤道坐标 */
export interface EquatorialCoord {
  /** 赤经（弧度） */
  readonly ra: number;
  /** 赤纬（弧度） */
  readonly dec: number;
}

/** 本地恒星时（弧度） */
export function localSiderealTime(jd: number, lonRad: number): number {
  // GMST at J2000 = 18h 41m 50.5s = 280.46°
  const t = (jd - 2451545.0) / 36525.0;
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - t * t * t / 38710000.0;
  return ((gmst % 360) + 360) % 360 * Math.PI / 180 + lonRad;
}

/** 赤道坐标 → 地平坐标（纯函数） */
export function equatorialToHorizontal(
  eq: EquatorialCoord,
  lstRad: number,
  latRad: number
): HorizontalCoord {
  const ha = lstRad - eq.ra; // 时角
  const sinAlt = Math.sin(eq.dec) * Math.sin(latRad) + Math.cos(eq.dec) * Math.cos(latRad) * Math.cos(ha);
  const alt = Math.asin(sinAlt);
  const cosAz = (Math.sin(eq.dec) - Math.sin(alt) * Math.sin(latRad)) / (Math.cos(alt) * Math.cos(latRad));
  const az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  // 从正北顺时针
  return {
    azimuth: Math.sin(ha) > 0 ? 2 * Math.PI - az : az,
    altitude: alt,
  };
}

/** 太阳位置简化模型（第一版近似） */
export function sunPosition(jd: number): EquatorialCoord {
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856004 * n) % 360) * Math.PI / 180;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI / 180;
  const e = 23.439 * Math.PI / 180;
  return {
    ra: Math.atan2(Math.cos(e) * Math.sin(lambda), Math.cos(lambda)),
    dec: Math.asin(Math.sin(e) * Math.sin(lambda)),
  };
}
