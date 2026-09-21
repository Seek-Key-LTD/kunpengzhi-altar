import * as THREE from 'three';
import type { SEASON1_POEMS } from '../data/season1_poems';
import type { TEA_POEM_16_CHAPTERS } from '../data/tea_poem_16';

/**
 * Canvas 贴图工厂：只做一件事——用 Canvas 画文字贴图，返回 Sprite。
 * 不建场景、不加 group、不碰业务逻辑。
 */

/** 碑面贴图：十二座青玉经卷壁碑 */
export function createInteriorStelaSprite(poem: typeof SEASON1_POEMS[number]): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.roundRect(8, 8, 240, 368, 12);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 28px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${poem.seasonId} ${poem.seasonName}`, 128, 50);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px "Noto Serif SC", serif';
  ctx.fillText(poem.opening.title, 128, 80);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '14px "Noto Serif SC", serif';
  ctx.textAlign = 'left';
  poem.opening.text.slice(0, 5).forEach((line, i) => {
    const shortLine = line.length > 14 ? line.substring(0, 13) + '…' : line;
    ctx.fillText(shortLine, 22, 125 + i * 26);
  });

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'italic 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('【点击展开全卷】', 128, 350);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(1.7, 2.5, 1);
  return sprite;
}

/** 茶灯屏贴图：16 面转经走马大茶灯 */
export function createTeaLanternSprite(ch: typeof TEA_POEM_16_CHAPTERS[number]): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 853;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
  ctx.roundRect(17, 17, 606, 819, 27);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 50px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText(`第 ${ch.chapterIndex} 面 · ${ch.title.split(' · ')[1]}`, 320, 100);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '27px "Noto Serif SC", serif';
  ctx.fillText(ch.historicalTheme, 320, 158);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = '27px "Noto Serif SC", serif';
  ctx.textAlign = 'left';
  ch.leftColumn.slice(0, 4).forEach((line, i) => {
    ctx.fillText(line, 40, 242 + i * 53);
  });
  ch.rightColumn.slice(0, 4).forEach((line, i) => {
    ctx.fillText(line, 337, 242 + i * 53);
  });

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'italic 27px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('【点击展开 16 句全赋】', 320, 783);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(3.6, 4.4, 1);
  return sprite;
}
