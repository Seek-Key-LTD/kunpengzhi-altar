/**
 * 逐像素亮度探针（零依赖最小 PNG 解码）—— #7 T7「有内容地暗」的客观判据。
 *
 * 原实现住在 `tools/capture/capture.mjs` 内部（未导出）。#7 的降级取证要用同一套尺子，
 * 与其抄一份（= 埋一份会各自漂移的副本），不如抽出来共用：capture.mjs 与
 * verify-webgl-degradation.mjs 都从这里取，黑场判据永远只有一处定义。
 *
 * ⚠️ PNG 二进制**不进版本库**（见 .gitignore）；只有本相脚本与文本 manifest 入库。
 */
import { inflateSync } from 'node:zlib';

/** 非黑判据：像素任一分量 ≥ 该值即计为「有内容」。 */
export const NONBLACK_LEVEL = 8;
/** 明显发光判据（Rec.709 亮度）。 */
export const BRIGHT_LEVEL = 32;

/**
 * 最小 PNG 解码器（8-bit，非隔行；支持灰度/RGB/RGBA）——零依赖，直接在**落盘的那份字节**上量像素。
 * 反过滤实现 PNG 规范 5 种 filter（None/Sub/Up/Average/Paeth）。
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG（签名不符）');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    pos += 4;
    const type = buf.toString('ascii', pos, pos + 4);
    pos += 4;
    const data = buf.subarray(pos, pos + len);
    pos += len + 4; // 跳过 CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8) throw new Error(`仅支持 8-bit PNG（实际 ${bitDepth}）`);
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[rp++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = cur; break;
        case 1: val = cur + a; break;
        case 2: val = cur + b; break;
        case 3: val = cur + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          val = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`未知 PNG filter ${filter}（行 ${y}）`);
      }
      out[y * stride + x] = val & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/** 逐像素量黑：返回 { nonBlackRatio, meanLum, brightPixels, totalPixels }。 */
export function analyze(pngBuf) {
  const { width, height, channels, data } = decodePng(pngBuf);
  const total = width * height;
  let nonBlack = 0;
  let bright = 0;
  let lumSum = 0;
  for (let i = 0; i < total; i++) {
    const o = i * channels;
    let r;
    let g;
    let b;
    if (channels >= 3) {
      r = data[o];
      g = data[o + 1];
      b = data[o + 2];
    } else {
      r = g = b = data[o];
    }
    if (r >= NONBLACK_LEVEL || g >= NONBLACK_LEVEL || b >= NONBLACK_LEVEL) nonBlack++;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += lum;
    if (lum >= BRIGHT_LEVEL) bright++;
  }
  return {
    nonBlackRatio: nonBlack / total,
    meanLum: lumSum / total,
    brightPixels: bright,
    totalPixels: total
  };
}
