/**
 * LightRig —— 祭坛灯光系统
 *
 * 职责：只负责搭建和持有所有灯光对象。
 * 不做：动画、亮度调制、仪式逻辑——那些归 AltarScene。
 */

import * as THREE from 'three';
import { PYRAMID_TOP } from '../data/altarGeometry';
import { saucerLayout } from '../data/wujiGeometry';
import { SEAL_HOVER_Y } from '../data/sealSpec';

export interface LightRigHandles {
  readonly ambient: THREE.AmbientLight;
  readonly sun: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  readonly apex: THREE.PointLight;
  readonly wuji: THREE.SpotLight;
  readonly saucer: THREE.Mesh;
  readonly saucerCore: THREE.Mesh;
  readonly beam: THREE.Mesh;
}

/**
 * 搭建祭坛灯光。
 * @param scene 目标场景
 * @param hollowInterior 阴锥内腔 group（挂内腔灯）
 */
export function buildLightRig(
  scene: THREE.Scene,
  hollowInterior: THREE.Group
): LightRigHandles {
  const ambient = new THREE.AmbientLight(0x1e293b, 1.4);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffecd2, 2.6);
  sun.position.set(35, 55, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  // 阴影视锥必须罩住全坛（灯环半径 23.5、坛体宽 21、玉玺悬顶 ~25）。
  // 不配置时 three 默认 ±5 正交视锥：2048² 深度图每帧白跑，且绝大多数阴影被裁掉。
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x38bdf8, 1.6);
  rim.position.set(-35, 12, -35);
  scene.add(rim);

  const apex = new THREE.PointLight(0xfbbf24, 3.2, 70, 1.2);
  apex.position.set(0, PYRAMID_TOP + 4, 0);
  scene.add(apex);

  // #00 无极具象：飞碟悬于坛顶上方中央，向下一束冷光罩住玉玺。
  const layout = saucerLayout();
  const wuji = new THREE.SpotLight(0xbfe8ff, 0, 30, 0.10, 0.55, 1.4);
  wuji.position.set(0, layout.saucerY, 0);
  wuji.target.position.set(0, SEAL_HOVER_Y, 0);
  scene.add(wuji, wuji.target);

  // 飞碟本体
  const saucer = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 0.32, 48, 1, false),
    new THREE.MeshStandardMaterial({
      color: 0xdfeff5,
      emissive: 0xbfe8ff,
      emissiveIntensity: 1.6,
      roughness: 0.35,
      metalness: 0.1,
    })
  );
  saucer.position.set(0, layout.saucerY, 0);
  scene.add(saucer);

  const saucerCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xeaf9ff })
  );
  saucerCore.position.set(0, layout.saucerY - 0.25, 0);
  scene.add(saucerCore);

  // 可见光柱
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.9, layout.beamLen, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xbfe8ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beam.position.set(0, layout.beamCenterY, 0);
  scene.add(beam);

  // 阴锥内腔照明
  const yinA = new THREE.PointLight(0x38bdf8, 3.0, 26, 1.2);
  yinA.position.set(0, 2.4, 0);
  hollowInterior.add(yinA);

  const yinB = new THREE.PointLight(0xf59e0b, 2.2, 22, 1.2);
  yinB.position.set(0, 8.0, 0);
  hollowInterior.add(yinB);

  return { ambient, sun, rim, apex, wuji, saucer, saucerCore, beam };
}
