/**
 * StelaeLanternBuilder —— 内壁石碑环 + 外廊 16 茶灯
 *
 * 职责：只负责搭建石碑和茶灯的几何/材质/sprite。
 * 不做：仪式逻辑、亮度调制、交互——那些归 AltarScene。
 */

import * as THREE from 'three';
import { BRICK, CELL } from '../data/altarGeometry';
import { SEASON1_POEMS } from '../data/season1_poems';
import { TEA_POEM_16_CHAPTERS } from '../data/tea_poem_16';
import { pickStelaEvents, stelaPose } from '../data/stelaRing';
import type { StelaEvent } from '../data/stelaRing';
import {
  createInteriorStelaSprite,
  createTeaLanternSprite,
} from './SpriteTextureFactory';

export interface StelaeLanternHandles {
  /** seasonId → 石碑 slab mesh */
  readonly interiorStelae: Map<string, THREE.Mesh>;
  /** chapterIndex → 茶灯 panel mesh */
  readonly lanternPanels: Map<number, THREE.Mesh>;
}

/**
 * 搭建内壁石碑环。
 * @param events 螺旋事件列表
 * @param hollowInterior 阴锥内腔 group
 */
export function buildInnerStelaeRing(
  events: readonly StelaEvent[],
  hollowInterior: THREE.Group
): Map<string, THREE.Mesh> {
  const picks = pickStelaEvents(events, SEASON1_POEMS.length);
  const interiorStelae = new Map<string, THREE.Mesh>();

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.6,
    roughness: 0.3,
    emissive: 0x1e3a8a,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.94,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.9,
    roughness: 0.2,
    emissive: 0xb45309,
    emissiveIntensity: 0.5,
  });

  const stelaH = BRICK * 0.9;
  const stelaW = BRICK * 2.4;

  picks.forEach((ev, i) => {
    const poem = SEASON1_POEMS[i % SEASON1_POEMS.length];
    const sp = stelaPose(ev, CELL, BRICK, stelaH);
    const { x: cx, y: cy, z: cz, nx, nz } = sp;

    const stelaGroup = new THREE.Group();
    stelaGroup.position.set(cx, cy, cz);
    stelaGroup.rotation.y = Math.atan2(nx, nz);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(stelaW, stelaH, 0.1), slabMat);
    slab.userData = { type: 'interior_stela', seasonId: poem.seasonId };
    stelaGroup.add(slab);
    interiorStelae.set(poem.seasonId, slab);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(stelaW + 0.12, stelaH + 0.12, 0.06),
      frameMat
    );
    frame.position.z = -0.03;
    stelaGroup.add(frame);

    const sprite = createInteriorStelaSprite(poem);
    sprite.position.set(0, 0, 0.07);
    sprite.scale.set(stelaW, stelaH, 1);
    stelaGroup.add(sprite);

    hollowInterior.add(stelaGroup);
  });

  return interiorStelae;
}

/**
 * 搭建外廊 16 茶灯。
 * @param lanternsGroup 茶灯 group
 */
export function buildOuter16TeaLanterns(
  lanternsGroup: THREE.Group
): Map<number, THREE.Mesh> {
  const lanternPanels = new Map<number, THREE.Mesh>();
  const lanternRadius = 23.5;
  const lanternHeight = 4.6;

  TEA_POEM_16_CHAPTERS.forEach((ch, idx) => {
    const angle = (idx / 16) * Math.PI * 2;
    const x = Math.sin(angle) * lanternRadius;
    const z = Math.cos(angle) * lanternRadius;

    const panelGroup = new THREE.Group();
    panelGroup.position.set(x, lanternHeight / 2 + 0.3, z);
    panelGroup.rotation.y = angle;

    const screenGeo = new THREE.PlaneGeometry(3.8, lanternHeight);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0c1322,
      emissive: 0x1e293b,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.userData = { type: 'tea_lantern', chapterIndex: ch.chapterIndex };
    panelGroup.add(screenMesh);
    lanternPanels.set(ch.chapterIndex, screenMesh);

    const rodGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.0, 8);
    rodGeo.rotateZ(Math.PI / 2);
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x92400e,
      emissiveIntensity: 0.4,
    });
    const topRod = new THREE.Mesh(rodGeo, rodMat);
    topRod.position.y = lanternHeight / 2;
    panelGroup.add(topRod);

    const botRod = new THREE.Mesh(rodGeo, rodMat);
    botRod.position.y = -lanternHeight / 2;
    panelGroup.add(botRod);

    const sprite = createTeaLanternSprite(ch);
    sprite.position.set(0, 0, 0.05);
    panelGroup.add(sprite);

    lanternsGroup.add(panelGroup);
  });

  return lanternPanels;
}
