// #15 Sarazm 天球计算单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleTs } from './lib/bundle-ts.mjs';

const [
  {
    SARAZM_LAT_RAD,
    SARAZM_LON_RAD,
    SARAZM_ELEVATION_M,
    localSiderealTime,
    equatorialToHorizontal,
    sunPosition,
  },
] = await bundleTs(['src/data/sarazmAstronomy.ts']);

test('#15 Sarazm 纬度约 39.5°N', () => {
  const deg = SARAZM_LAT_RAD * 180 / Math.PI;
  assert.ok(Math.abs(deg - 39.508) < 0.01);
});

test('#15 Sarazm 经度约 67.46°E', () => {
  const deg = SARAZM_LON_RAD * 180 / Math.PI;
  assert.ok(Math.abs(deg - 67.459) < 0.01);
});

test('#15 Sarazm 海拔 910m', () => {
  assert.equal(SARAZM_ELEVATION_M, 910);
});

test('#15 太阳位置在冬至附近赤纬约 -23.4°', () => {
  // J2000 = 2451545.0
  // 冬至附近：2451900 ≈ 2001年12月
  const sun = sunPosition(2451900.0);
  const decDeg = sun.dec * 180 / Math.PI;
  assert.ok(Math.abs(decDeg - (-23.4)) < 2, `冬至赤纬应约 -23.4°，实际 ${decDeg.toFixed(2)}°`);
});

test('#15 赤道→地平坐标转换：北天极在纬度处高度等于纬度', () => {
  // 北天极：ra=任意, dec=π/2
  const polar = { ra: 0, dec: Math.PI / 2 };
  const lst = 0;
  const h = equatorialToHorizontal(polar, lst, SARAZM_LAT_RAD);
  const altDeg = h.altitude * 180 / Math.PI;
  assert.ok(Math.abs(altDeg - 39.5) < 1, `北天极高度应约等于纬度 39.5°，实际 ${altDeg.toFixed(2)}°`);
});
