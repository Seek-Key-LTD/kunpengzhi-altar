import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SpiralEvent, CameraMode } from '../types/altar';
import { TEA_POEM_16_CHAPTERS } from '../data/tea_poem_16';
import { SEASON1_POEMS } from '../data/season1_poems';

export class AltarScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  
  // Scene Groups
  private altarGroup: THREE.Group;
  private fountainGroup: THREE.Group;
  private interiorGroup: THREE.Group;
  private lanternsGroup: THREE.Group;
  
  // Interactive Objects
  private waterSpiralPath: THREE.Vector3[] = [];
  private waterParticles: THREE.Points | null = null;
  private cascadeParticles: THREE.Points | null = null;
  private fountainParticles: THREE.Points | null = null;
  private flowerMeshes: Map<number, THREE.Group> = new Map();
  private seatPads: Map<number, THREE.Mesh> = new Map();
  private cubeBlocks: Map<number, THREE.Group> = new Map();
  private starshipMeshes: Map<number, THREE.Group> = new Map();
  private seatLabels: Map<number, THREE.Sprite> = new Map();
  private lanternPanels: Map<number, THREE.Mesh> = new Map();
  private interiorStelae: Map<string, THREE.Mesh> = new Map();

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // State
  private events: SpiralEvent[] = [];
  private activeSeatId: number | null = 1;
  private cameraMode: CameraMode = 'orbit';
  private onSeatSelect?: (seatId: number) => void;
  private onLanternSelect?: (chapterIndex: number) => void;
  private onInteriorPoemSelect?: (seasonId: string) => void;
  private clock = new THREE.Clock();

  // Speed & Rotation
  private lanternRotationSpeed = 0.0015;
  private currentProgress = 1;
  private isAutoPatrol = false;

  // Smooth Camera Target
  private targetCameraPos = new THREE.Vector3(28, 30, 36);
  private targetControlsTarget = new THREE.Vector3(0, 4, 0);
  private isCameraTransitioning = false;

  constructor(
    container: HTMLElement,
    events: SpiralEvent[],
    onSeatSelect?: (seatId: number) => void,
    onLanternSelect?: (chapterIndex: number) => void,
    onInteriorPoemSelect?: (seasonId: string) => void
  ) {
    this.container = container;
    this.events = events;
    this.onSeatSelect = onSeatSelect;
    this.onLanternSelect = onLanternSelect;
    this.onInteriorPoemSelect = onInteriorPoemSelect;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.012);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(28, 30, 36);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 150;
    this.controls.target.set(0, 4, 0);

    // 5. Structure Groups
    this.altarGroup = new THREE.Group();
    this.fountainGroup = new THREE.Group();
    this.interiorGroup = new THREE.Group();
    this.lanternsGroup = new THREE.Group();

    this.scene.add(this.altarGroup);
    this.scene.add(this.fountainGroup);
    this.scene.add(this.interiorGroup);
    this.scene.add(this.lanternsGroup);

    // 6. Build All Complex Layers
    this.initLighting();
    this.buildOuterRecyclingBasin();
    this.build49SlopedCubicPedestals();
    this.buildInteriorCavern();
    this.buildOuter16TeaLanterns();
    this.buildWaterCanalAndCascades();
    this.buildWujiFountain();
    this.buildStarships();
    this.buildSurroundingAtmosphere();

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize);
    this.container.addEventListener('pointerdown', this.onPointerDown);

    // 8. Start loop
    this.animate();
  }

  private initLighting() {
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffecd2, 2.6);
    sunLight.position.set(35, 55, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
    rimLight.position.set(-35, 12, -35);
    this.scene.add(rimLight);

    const apexLight = new THREE.PointLight(0xfbbf24, 3.2, 50, 1.2);
    apexLight.position.set(0, 10, 0);
    this.scene.add(apexLight);

    const interiorLight = new THREE.PointLight(0x38bdf8, 2.5, 25, 1.5);
    interiorLight.position.set(0, 3.5, 0);
    this.interiorGroup.add(interiorLight);

    const torchWarmLight = new THREE.PointLight(0xf59e0b, 2.0, 20, 1.5);
    torchWarmLight.position.set(0, 1.5, 0);
    this.interiorGroup.add(torchWarmLight);
  }

  private buildOuterRecyclingBasin() {
    // Outer Stone & Bronze Water Recycling Basin (回收渠)
    const basinGeo = new THREE.BoxGeometry(26, 0.4, 26);
    const basinMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.8,
      metalness: 0.2
    });
    const basinMesh = new THREE.Mesh(basinGeo, basinMat);
    basinMesh.position.y = -0.2;
    basinMesh.receiveShadow = true;
    this.altarGroup.add(basinMesh);

    // Deep water moat rim in basin
    const rimGeo = new THREE.BoxGeometry(26.4, 0.1, 26.4);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x78350f,
      emissiveIntensity: 0.3
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.05;
    this.altarGroup.add(rimMesh);
  }

  private getSeatWorldPos(event: SpiralEvent): THREE.Vector3 {
    const spacing = 3.1;
    const x = event.grid_x * spacing;
    const z = event.grid_z * spacing;
    const tierHeights = [6.0, 5.2, 4.4, 3.6, 2.8, 2.0, 1.2];
    const y = tierHeights[event.layer - 1] + 0.15;
    return new THREE.Vector3(x, y, z);
  }

  private build49SlopedCubicPedestals() {
    const spacing = 3.1;
    const cubeWidth = 2.9;
    const tierHeights = [6.0, 5.2, 4.4, 3.6, 2.8, 2.0, 1.2];

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.55,
      metalness: 0.3
    });

    const bronzeEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.3,
      metalness: 0.85,
      emissive: 0x92400e,
      emissiveIntensity: 0.3
    });

    const waterGrooveMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.9
    });

    this.events.forEach((ev, idx) => {
      const cubeGroup = new THREE.Group();
      const x = ev.grid_x * spacing;
      const z = ev.grid_z * spacing;
      const h = tierHeights[ev.layer - 1];

      cubeGroup.position.set(x, 0, z);

      // 1. Solid Stepped Cubic Column (立方体基石)
      const colGeo = new THREE.BoxGeometry(cubeWidth, h, cubeWidth);
      const colMesh = new THREE.Mesh(colGeo, stoneMat);
      colMesh.position.y = h / 2;
      colMesh.castShadow = true;
      colMesh.receiveShadow = true;
      cubeGroup.add(colMesh);

      // 2. Top Bronze Trim Frame (顶面斜切金铜包边)
      const topTrimGeo = new THREE.BoxGeometry(cubeWidth + 0.06, 0.08, cubeWidth + 0.06);
      const topTrim = new THREE.Mesh(topTrimGeo, bronzeEdgeMat);
      topTrim.position.y = h + 0.04;
      cubeGroup.add(topTrim);

      // 3. Dual-Slope Water Canal Incline (嵌入式微坡水渠槽底: 进水高、出水低)
      // Determine next seat direction in spiral to tilt the slope correctly
      let nextX = x;
      let nextZ = z;
      if (idx < this.events.length - 1) {
        nextX = this.events[idx + 1].grid_x * spacing;
        nextZ = this.events[idx + 1].grid_z * spacing;
      }
      const dirX = Math.sign(nextX - x);
      const dirZ = Math.sign(nextZ - z);

      // Recessed canal along the top
      const grooveGeo = new THREE.BoxGeometry(cubeWidth * 0.75, 0.12, cubeWidth * 0.75);
      const grooveMesh = new THREE.Mesh(grooveGeo, waterGrooveMat);
      // Slope incline tilt: 2% slope in flow direction
      grooveMesh.position.set(dirX * 0.1, h + 0.06, dirZ * 0.1);
      grooveMesh.rotation.x = dirZ * 0.035;
      grooveMesh.rotation.z = -dirX * 0.035;
      cubeGroup.add(grooveMesh);

      // 4. Swallow-tail Spillway Weir (层间跌水燕尾檐) for Tier Drop
      const isTierDrop = idx < this.events.length - 1 && this.events[idx + 1].layer > ev.layer;
      if (isTierDrop || ev.is_finale) {
        const weirGeo = new THREE.BoxGeometry(1.2, 0.06, 0.5);
        const weirMesh = new THREE.Mesh(weirGeo, bronzeEdgeMat);
        weirMesh.position.set(dirX * 1.5, h + 0.02, dirZ * 1.5);
        cubeGroup.add(weirMesh);

        // Water Cascade Sheet (层间垂直跌水水幕)
        const nextH = idx < this.events.length - 1 ? tierHeights[this.events[idx + 1].layer - 1] : 0;
        const dropHeight = Math.max(0.4, h - nextH);
        const sheetGeo = new THREE.PlaneGeometry(1.0, dropHeight);
        const sheetMat = new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide
        });
        const sheet = new THREE.Mesh(sheetGeo, sheetMat);
        sheet.position.set(dirX * 1.55, h - dropHeight / 2, dirZ * 1.55);
        if (dirX !== 0) sheet.rotation.y = Math.PI / 2;
        cubeGroup.add(sheet);
      }

      // 5. Flower Plinth Pad (立于微拱副坡之上的受水莲花台)
      const padGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.16, 8);
      const padMat = new THREE.MeshStandardMaterial({
        color: ev.seat_status === 'reserved' ? 0xd97706 : 0x1e293b,
        metalness: 0.7,
        roughness: 0.3,
        emissive: ev.seat_status === 'reserved' ? 0x78350f : 0x0f172a,
        emissiveIntensity: 0.4
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.set(0, h + 0.12, 0);
      padMesh.receiveShadow = true;
      padMesh.userData = { type: 'seat_pad', seatId: ev.seat_id };
      cubeGroup.add(padMesh);
      this.seatPads.set(ev.seat_id, padMesh);

      // 6. Holographic Blooming Flower
      const flowerGroup = new THREE.Group();
      const petalCount = 8;
      const flowerMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ev.flower_color),
        emissive: new THREE.Color(ev.flower_color),
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide
      });

      for (let p = 0; p < petalCount; p++) {
        const angle = (p / petalCount) * Math.PI * 2;
        const petalGeo = new THREE.ConeGeometry(0.32, 0.85, 5);
        petalGeo.rotateX(Math.PI / 3);
        const petal = new THREE.Mesh(petalGeo, flowerMat);
        petal.position.set(Math.sin(angle) * 0.35, 0.28, Math.cos(angle) * 0.35);
        petal.rotation.y = angle;
        flowerGroup.add(petal);
      }

      const coreGeo = new THREE.SphereGeometry(0.22, 12, 12);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.y = 0.32;
      flowerGroup.add(coreMesh);

      flowerGroup.position.set(0, h + 0.16, 0);
      flowerGroup.scale.set(0.6, 0.6, 0.6);
      cubeGroup.add(flowerGroup);
      this.flowerMeshes.set(ev.seat_id, flowerGroup);

      // 7. Label Sprite
      const sprite = this.createSeatSprite(ev);
      sprite.position.set(0, h + 1.4, 0);
      cubeGroup.add(sprite);
      this.seatLabels.set(ev.seat_id, sprite);

      this.cubeBlocks.set(ev.seat_id, cubeGroup);
      this.altarGroup.add(cubeGroup);
    });
  }

  private createSeatSprite(ev: SpiralEvent): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.roundRect(10, 10, 236, 108, 16);
    ctx.fill();
    ctx.strokeStyle = ev.seat_status === 'reserved' ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 32px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`#${ev.seat_id} ${ev.display_name}`, 128, 60);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px sans-serif';
    ctx.fillText(`${ev.midi_note_name} · ${ev.harmony_event}`, 128, 96);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.4, 1.2, 1);
    return sprite;
  }

  private buildInteriorCavern() {
    // 1. Interior Floor
    const floorGeo = new THREE.CylinderGeometry(8.5, 8.5, 0.2, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1d,
      metalness: 0.85,
      roughness: 0.15,
      emissive: 0x0e1726,
      emissiveIntensity: 0.3
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0.1;
    this.interiorGroup.add(floor);

    // 2. Central Water Light Vortex
    const tubeGeo = new THREE.CylinderGeometry(0.6, 0.6, 6.2, 16, 1, true);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.position.set(0, 3.1, 0);
    this.interiorGroup.add(tube);

    // Central Reflection Well
    const wellGeo = new THREE.TorusGeometry(1.8, 0.15, 16, 32);
    const wellMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x78350f,
      emissiveIntensity: 0.6
    });
    const well = new THREE.Mesh(wellGeo, wellMat);
    well.rotation.x = Math.PI / 2;
    well.position.set(0, 0.2, 0);
    this.interiorGroup.add(well);

    // 3. 12 Floating Stelae for S01–S12 Season Poems
    const radius = 6.2;
    SEASON1_POEMS.forEach((poem, idx) => {
      const angle = (idx / 12) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;

      const stelaGroup = new THREE.Group();
      stelaGroup.position.set(x, 2.6, z);
      stelaGroup.rotation.y = angle + Math.PI;

      const slabGeo = new THREE.BoxGeometry(1.8, 2.8, 0.08);
      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.6,
        roughness: 0.3,
        emissive: 0x1e3a8a,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.92
      });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.userData = { type: 'interior_stela', seasonId: poem.seasonId };
      stelaGroup.add(slab);
      this.interiorStelae.set(poem.seasonId, slab);

      const frameGeo = new THREE.BoxGeometry(1.86, 2.86, 0.06);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0xb45309,
        emissiveIntensity: 0.5
      });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      stelaGroup.add(frame);

      const sprite = this.createInteriorStelaSprite(poem);
      sprite.position.set(0, 0, 0.06);
      stelaGroup.add(sprite);

      this.interiorGroup.add(stelaGroup);
    });
  }

  private createInteriorStelaSprite(poem: typeof SEASON1_POEMS[0]): THREE.Sprite {
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

  private buildOuter16TeaLanterns() {
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
        side: THREE.DoubleSide
      });
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.userData = { type: 'tea_lantern', chapterIndex: ch.chapterIndex };
      panelGroup.add(screenMesh);
      this.lanternPanels.set(ch.chapterIndex, screenMesh);

      const rodGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.0, 8);
      rodGeo.rotateZ(Math.PI / 2);
      const rodMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0x92400e,
        emissiveIntensity: 0.4
      });
      const topRod = new THREE.Mesh(rodGeo, rodMat);
      topRod.position.y = lanternHeight / 2;
      panelGroup.add(topRod);

      const botRod = new THREE.Mesh(rodGeo, rodMat);
      botRod.position.y = -lanternHeight / 2;
      panelGroup.add(botRod);

      const sprite = this.createTeaLanternSprite(ch);
      sprite.position.set(0, 0, 0.05);
      panelGroup.add(sprite);

      this.lanternsGroup.add(panelGroup);
    });
  }

  private createTeaLanternSprite(ch: typeof TEA_POEM_16_CHAPTERS[0]): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
    ctx.roundRect(10, 10, 364, 492, 16);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 30px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${ch.chapterIndex} 面 · ${ch.title.split(' · ')[1]}`, 192, 60);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Noto Serif SC", serif';
    ctx.fillText(ch.historicalTheme, 192, 95);

    ctx.fillStyle = '#fef08a';
    ctx.font = '18px "Noto Serif SC", serif';
    ctx.textAlign = 'left';
    ctx.fillText('【左栏·起承】', 30, 140);
    ctx.fillStyle = '#f1f5f9';
    ch.leftColumn.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, 30, 175 + i * 32);
    });

    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('【右栏·转合】', 30, 295);
    ctx.fillStyle = '#f1f5f9';
    ch.rightColumn.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, 30, 330 + i * 32);
    });

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'italic 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('【点击展开 16 句全赋】', 192, 470);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.6, 4.4, 1);
    return sprite;
  }

  private buildWaterCanalAndCascades() {
    this.waterSpiralPath = this.events.map((ev) => this.getSeatWorldPos(ev));
    const curve = new THREE.CatmullRomCurve3(this.waterSpiralPath, false, 'catmullrom', 0.15);
    const points = curve.getPoints(320);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });
    const waterLine = new THREE.Line(lineGeo, lineMat);
    this.altarGroup.add(waterLine);

    // Main stream particles
    const particleCount = 240;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const p = points[Math.floor(Math.random() * points.length)];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y + 0.08;
      positions[i * 3 + 2] = p.z;
      colors[i * 3] = 0.3;
      colors[i * 3 + 1] = 0.8;
      colors[i * 3 + 2] = 1.0;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.waterParticles = new THREE.Points(particleGeo, particleMat);
    this.altarGroup.add(this.waterParticles);

    // Cascade Waterfall droplets at tier transitions
    const cascadeCount = 150;
    const casGeo = new THREE.BufferGeometry();
    const casPos = new Float32Array(cascadeCount * 3);
    for (let i = 0; i < cascadeCount; i++) {
      const p = this.waterSpiralPath[i % this.waterSpiralPath.length];
      casPos[i * 3] = p.x + (Math.random() - 0.5) * 0.4;
      casPos[i * 3 + 1] = p.y - Math.random() * 0.8;
      casPos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.4;
    }
    casGeo.setAttribute('position', new THREE.BufferAttribute(casPos, 3));
    const casMat = new THREE.PointsMaterial({
      size: 0.2,
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    this.cascadeParticles = new THREE.Points(casGeo, casMat);
    this.altarGroup.add(this.cascadeParticles);
  }

  private buildWujiFountain() {
    const beamGeo = new THREE.CylinderGeometry(0.3, 1.2, 20, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 16, 0);
    this.fountainGroup.add(beam);

    const ringGeo = new THREE.TorusGeometry(1.8, 0.08, 16, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xd97706,
      emissiveIntensity: 0.8
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 9.5, 0);
    this.fountainGroup.add(ring);

    const fountainPCount = 300;
    const fGeo = new THREE.BufferGeometry();
    const fPos = new Float32Array(fountainPCount * 3);
    for (let i = 0; i < fountainPCount; i++) {
      fPos[i * 3] = (Math.random() - 0.5) * 1.5;
      fPos[i * 3 + 1] = 6.2 + Math.random() * 4.0;
      fPos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    const fMat = new THREE.PointsMaterial({
      size: 0.22,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.fountainParticles = new THREE.Points(fGeo, fMat);
    this.fountainGroup.add(this.fountainParticles);
  }

  private buildStarships() {
    this.events.forEach((ev) => {
      if (ev.seat_status === 'reserved' || ev.seat_id === 49) {
        const shipGroup = new THREE.Group();
        const basePos = this.getSeatWorldPos(ev);
        shipGroup.position.set(basePos.x, basePos.y + 4.5, basePos.z);

        const hullGeo = new THREE.ConeGeometry(0.4, 2.2, 4);
        hullGeo.rotateX(Math.PI / 2);
        const hullMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.9,
          roughness: 0.2,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.3
        });
        const hull = new THREE.Mesh(hullGeo, hullMat);
        shipGroup.add(hull);

        const wingGeo = new THREE.BoxGeometry(2.0, 0.05, 0.8);
        const wingMat = new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.8,
          roughness: 0.3
        });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, 0, 0.2);
        shipGroup.add(wings);

        shipGroup.scale.set(0.65, 0.65, 0.65);
        this.starshipMeshes.set(ev.seat_id, shipGroup);
        this.altarGroup.add(shipGroup);
      }
    });
  }

  private buildSurroundingAtmosphere() {
    const starCount = 1500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 300;
      starPos[i * 3 + 1] = Math.random() * 150;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.6, color: 0xffffff, transparent: true, opacity: 0.7 });
    const stars = new THREE.Points(starGeo, starMat);
    this.scene.add(stars);
  }

  private onWindowResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private onPointerDown = (event: MouseEvent) => {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // 1. Check Outer Tea Lanterns
    const lanterns = Array.from(this.lanternPanels.values());
    const lanternHits = this.raycaster.intersectObjects(lanterns);
    if (lanternHits.length > 0) {
      const hit = lanternHits[0].object;
      const chIdx = hit.userData?.chapterIndex;
      if (chIdx) {
        this.focusTeaLantern(chIdx);
        if (this.onLanternSelect) {
          this.onLanternSelect(chIdx);
        }
        return;
      }
    }

    // 2. Check Interior Stelae
    const stelae = Array.from(this.interiorStelae.values());
    const stelaHits = this.raycaster.intersectObjects(stelae);
    if (stelaHits.length > 0) {
      const hit = stelaHits[0].object;
      const sId = hit.userData?.seasonId;
      if (sId) {
        this.focusInteriorPoem(sId);
        if (this.onInteriorPoemSelect) {
          this.onInteriorPoemSelect(sId);
        }
        return;
      }
    }

    // 3. Check Seat Pads
    const pads = Array.from(this.seatPads.values());
    const seatHits = this.raycaster.intersectObjects(pads);
    if (seatHits.length > 0) {
      const hit = seatHits[0].object;
      const seatId = hit.userData?.seatId;
      if (seatId && this.onSeatSelect) {
        this.onSeatSelect(seatId);
        this.setActiveSeat(seatId);
        return;
      }
    }
  };

  public setActiveSeat(seatId: number) {
    this.activeSeatId = seatId;
    this.currentProgress = seatId;

    this.flowerMeshes.forEach((group, id) => {
      const isActive = id === seatId;
      group.scale.setScalar(isActive ? 1.1 : 0.6);
    });

    if (this.cameraMode === 'patrol') {
      const ev = this.events.find(e => e.seat_id === seatId);
      if (ev) {
        const targetPos = this.getSeatWorldPos(ev);
        this.targetControlsTarget.copy(targetPos);
        this.targetCameraPos.set(targetPos.x + 6, targetPos.y + 5, targetPos.z + 6);
        this.isCameraTransitioning = true;
      }
    }
  }

  public focusTeaLantern(chapterIndex: number) {
    this.cameraMode = 'outer_lanterns';
    const angle = ((chapterIndex - 1) / 16) * Math.PI * 2;
    const lanternRadius = 23.5;
    const lanternHeight = 2.6;

    const currentGroupAngle = this.lanternsGroup.rotation.y;
    const effectiveAngle = angle + currentGroupAngle;

    const x = Math.sin(effectiveAngle) * lanternRadius;
    const z = Math.cos(effectiveAngle) * lanternRadius;

    const camDist = 6.2;
    const camX = Math.sin(effectiveAngle) * (lanternRadius + camDist);
    const camZ = Math.cos(effectiveAngle) * (lanternRadius + camDist);

    this.targetCameraPos.set(camX, lanternHeight + 0.5, camZ);
    this.targetControlsTarget.set(x, lanternHeight, z);
    this.isCameraTransitioning = true;
  }

  public focusInteriorPoem(seasonId: string) {
    this.cameraMode = 'interior';
    const idx = SEASON1_POEMS.findIndex(p => p.seasonId === seasonId);
    const safeIdx = idx >= 0 ? idx : 0;
    const angle = (safeIdx / 12) * Math.PI * 2;
    const stelaRadius = 6.2;
    const x = Math.sin(angle) * stelaRadius;
    const z = Math.cos(angle) * stelaRadius;

    const camDist = 3.2;
    const camX = Math.sin(angle) * (stelaRadius - camDist);
    const camZ = Math.cos(angle) * (stelaRadius - camDist);

    this.targetCameraPos.set(camX, 2.5, camZ);
    this.targetControlsTarget.set(x, 2.6, z);
    this.isCameraTransitioning = true;
  }

  public setLanternRotationSpeed(speed: number) {
    this.lanternRotationSpeed = speed;
  }

  public setSpeedMode(mode: 'pause' | 'ultra_slow' | 'slow') {
    if (mode === 'pause') {
      this.lanternRotationSpeed = 0.0;
    } else if (mode === 'ultra_slow') {
      this.lanternRotationSpeed = 0.0015;
    } else if (mode === 'slow') {
      this.lanternRotationSpeed = 0.005;
    }
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    this.isCameraTransitioning = true;

    if (mode === 'interior') {
      this.targetCameraPos.set(0, 2.5, 4.2);
      this.targetControlsTarget.set(0, 2.6, 0);
    } else if (mode === 'outer_lanterns') {
      this.targetCameraPos.set(0, 3.2, 29.5);
      this.targetControlsTarget.set(0, 2.4, 23.5);
    } else if (mode === 'topdown') {
      this.targetCameraPos.set(0, 56, 0.1);
      this.targetControlsTarget.set(0, 0, 0);
    } else if (mode === 'fountain') {
      this.targetCameraPos.set(0, 16, 12);
      this.targetControlsTarget.set(0, 8, 0);
    } else if (mode === 'cinematic') {
      this.targetCameraPos.set(34, 16, 34);
      this.targetControlsTarget.set(0, 3, 0);
    } else if (mode === 'orbit') {
      this.targetCameraPos.set(28, 30, 36);
      this.targetControlsTarget.set(0, 4, 0);
    }
  }

  public setAutoPatrol(patrol: boolean) {
    this.isAutoPatrol = patrol;
  }

  public updateEvents(events: SpiralEvent[]) {
    this.events = events;
    events.forEach(ev => {
      const oldSprite = this.seatLabels.get(ev.seat_id);
      if (oldSprite && oldSprite.parent) {
        oldSprite.parent.remove(oldSprite);
        const newSprite = this.createSeatSprite(ev);
        newSprite.position.set(0, 1.4, 0);
        this.seatLabels.set(ev.seat_id, newSprite);
        this.altarGroup.add(newSprite);
      }
    });
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Smooth Camera Transition Lerp
    if (this.isCameraTransitioning) {
      this.camera.position.lerp(this.targetCameraPos, 0.05);
      this.controls.target.lerp(this.targetControlsTarget, 0.05);
      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.1) {
        this.isCameraTransitioning = false;
      }
    }

    this.controls.update();

    // 2. Slow continuous rotation of the outer 16 Tea Lanterns
    if (this.lanternsGroup) {
      this.lanternsGroup.rotation.y += this.lanternRotationSpeed;
    }

    // 3. Subtle floating oscillation for Interior Stelae
    this.interiorStelae.forEach((stela, idx) => {
      stela.position.y = 2.6 + Math.sin(elapsedTime * 2 + Number(idx.replace('S', ''))) * 0.03;
    });

    // 4. Rotate apex fountain ring & fountain particles
    if (this.fountainGroup) {
      this.fountainGroup.rotation.y = elapsedTime * 0.15;
    }
    if (this.fountainParticles) {
      const posAttr = this.fountainParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - 0.03;
        if (y < 6.0) y = 10.0;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // 5. Water particles flowing along spiral
    if (this.waterParticles && this.waterSpiralPath.length > 0) {
      const pAttr = this.waterParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pAttr.count; i++) {
        const step = (elapsedTime * 6 + i * 0.25) % this.waterSpiralPath.length;
        const idxA = Math.floor(step);
        const idxB = (idxA + 1) % this.waterSpiralPath.length;
        const frac = step - idxA;
        const pA = this.waterSpiralPath[idxA];
        const pB = this.waterSpiralPath[idxB];

        pAttr.setXYZ(
          i,
          pA.x + (pB.x - pA.x) * frac + Math.sin(elapsedTime * 4 + i) * 0.04,
          pA.y + (pB.y - pA.y) * frac + 0.12,
          pA.z + (pB.z - pA.z) * frac + Math.cos(elapsedTime * 4 + i) * 0.04
        );
      }
      pAttr.needsUpdate = true;
    }

    // 6. Waterfall droplets at tier transitions
    if (this.cascadeParticles) {
      const cAttr = this.cascadeParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < cAttr.count; i++) {
        let y = cAttr.getY(i) - 0.04;
        if (y < 0.2) y = 5.8;
        cAttr.setY(i, y);
      }
      cAttr.needsUpdate = true;
    }

    // 7. Starships floating
    this.starshipMeshes.forEach((ship, id) => {
      ship.position.y += Math.sin(elapsedTime * 2 + id) * 0.002;
      ship.rotation.y = elapsedTime * 0.2 + id;
    });

    // 8. Flowers breathing
    this.flowerMeshes.forEach((flower, id) => {
      const pulse = 1.0 + Math.sin(elapsedTime * 2.5 + id) * 0.04;
      flower.rotation.y = elapsedTime * 0.2 + id;
      if (id !== this.activeSeatId) {
        flower.scale.set(0.6 * pulse, 0.6 * pulse, 0.6 * pulse);
      }
    });

    // 9. Auto patrol
    if (this.isAutoPatrol) {
      this.currentProgress += 0.05;
      if (this.currentProgress > 49.5) {
        this.currentProgress = 1;
      }
      const activeIdx = Math.max(1, Math.min(49, Math.floor(this.currentProgress)));
      if (activeIdx !== this.activeSeatId) {
        this.setActiveSeat(activeIdx);
        if (this.onSeatSelect) {
          this.onSeatSelect(activeIdx);
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
