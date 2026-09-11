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
  private fountainParticles: THREE.Points | null = null;
  private flowerMeshes: Map<number, THREE.Group> = new Map();
  private seatPads: Map<number, THREE.Mesh> = new Map();
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

  // Animation Progress
  private currentProgress = 1;
  private isAutoPatrol = false;

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
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.015);

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
    this.controls.maxDistance = 140;
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
    this.buildHollowSevenTierAltar();
    this.buildInteriorCavern();
    this.buildOuter16TeaLanterns();
    this.buildSeatsAndFlowers();
    this.buildWaterCanal();
    this.buildWujiFountain();
    this.buildStarships();
    this.buildSurroundingAtmosphere();

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize);
    this.container.addEventListener('pointerdown', this.onPointerDown);

    // 8. Start render loop
    this.animate();
  }

  private initLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.4);
    this.scene.add(ambientLight);

    // Main golden directional light
    const sunLight = new THREE.DirectionalLight(0xffecd2, 2.6);
    sunLight.position.set(35, 55, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    this.scene.add(sunLight);

    // Cyan rim light
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
    rimLight.position.set(-35, 12, -35);
    this.scene.add(rimLight);

    // Apex golden point light
    const apexLight = new THREE.PointLight(0xfbbf24, 3.2, 50, 1.2);
    apexLight.position.set(0, 10, 0);
    this.scene.add(apexLight);

    // Hollow Interior Mood Point Light
    const interiorLight = new THREE.PointLight(0x38bdf8, 2.5, 25, 1.5);
    interiorLight.position.set(0, 3.5, 0);
    this.interiorGroup.add(interiorLight);

    const torchWarmLight = new THREE.PointLight(0xf59e0b, 2.0, 20, 1.5);
    torchWarmLight.position.set(0, 1.5, 0);
    this.interiorGroup.add(torchWarmLight);
  }

  private buildHollowSevenTierAltar() {
    const tierHeights = [1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0]; // 7 tiers
    const tierHalfSizes = [11.0, 9.5, 8.0, 6.5, 5.0, 3.5, 2.0];

    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.65,
      metalness: 0.25,
      side: THREE.DoubleSide
    });

    const bronzeEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.35,
      metalness: 0.8,
      emissive: 0x92400e,
      emissiveIntensity: 0.2
    });

    // Outer Basin (回收渠)
    const basinGeo = new THREE.BoxGeometry(26, 0.4, 26);
    const basinMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.8, metalness: 0.1 });
    const basinMesh = new THREE.Mesh(basinGeo, basinMat);
    basinMesh.position.y = -0.2;
    basinMesh.receiveShadow = true;
    this.altarGroup.add(basinMesh);

    // 7 stepped tiers (constructed with perimeter hollow shells so interior is open!)
    for (let i = 0; i < 7; i++) {
      const halfSize = tierHalfSizes[i];
      const h = tierHeights[i];
      
      // Step plinth
      const boxGeo = new THREE.BoxGeometry(halfSize * 2, h, halfSize * 2);
      const boxMesh = new THREE.Mesh(boxGeo, stoneMaterial);
      boxMesh.position.y = h / 2;
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;
      this.altarGroup.add(boxMesh);

      // Bronze edge trim
      const trimGeo = new THREE.BoxGeometry(halfSize * 2 + 0.1, 0.08, halfSize * 2 + 0.1);
      const trimMesh = new THREE.Mesh(trimGeo, bronzeEdgeMaterial);
      trimMesh.position.y = h + 0.04;
      this.altarGroup.add(trimMesh);
    }
  }

  private buildInteriorCavern() {
    // 1. Interior Floor - Inscribed Bronze & Obsidian Mirror
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

    // 2. Central Water Light Vortex (Streaming down from apex)
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

    // 3. 12 Floating Stelae for S01–S12 Season Poetry Collection
    const radius = 6.2;
    SEASON1_POEMS.forEach((poem, idx) => {
      const angle = (idx / 12) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;

      const stelaGroup = new THREE.Group();
      stelaGroup.position.set(x, 2.6, z);
      stelaGroup.rotation.y = angle + Math.PI; // Face towards center

      // Jade Stela Slab
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

      // Gold Frame Trim
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

      // Inscribed Canvas Texture Sprite
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

    // Header background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.roundRect(8, 8, 240, 368, 12);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Season tag
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 28px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${poem.seasonId} ${poem.seasonName}`, 128, 50);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Noto Serif SC", serif';
    ctx.fillText(poem.opening.title, 128, 80);

    // Lines preview
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
    // 16-Faceted Rotating Lantern Pavilion (十六面转经走马大茶灯回廊)
    const lanternRadius = 19.5;
    const lanternHeight = 4.2;

    TEA_POEM_16_CHAPTERS.forEach((ch, idx) => {
      const angle = (idx / 16) * Math.PI * 2;
      const x = Math.sin(angle) * lanternRadius;
      const z = Math.cos(angle) * lanternRadius;

      const panelGroup = new THREE.Group();
      panelGroup.position.set(x, lanternHeight / 2 + 0.2, z);
      panelGroup.rotation.y = angle; // Face outward

      // 1. Lantern Fabric Screen (垂帘)
      const screenGeo = new THREE.PlaneGeometry(3.6, lanternHeight);
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

      // Top & Bottom Bronze Scroll Rods
      const rodGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.8, 8);
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

      // 2. High-Res Inscribed Canvas Texture Sprite
      const sprite = this.createTeaLanternSprite(ch);
      sprite.position.set(0, 0, 0.04);
      panelGroup.add(sprite);

      this.lanternsGroup.add(panelGroup);
    });
  }

  private createTeaLanternSprite(ch: typeof TEA_POEM_16_CHAPTERS[0]): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = 'rgba(10, 15, 29, 0.92)';
    ctx.roundRect(10, 10, 364, 492, 16);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Chapter Number badge
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 30px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${ch.chapterIndex} 面 · ${ch.title.split(' · ')[1]}`, 192, 60);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Noto Serif SC", serif';
    ctx.fillText(ch.historicalTheme, 192, 95);

    // Left Column Preview
    ctx.fillStyle = '#fef08a';
    ctx.font = '18px "Noto Serif SC", serif';
    ctx.textAlign = 'left';
    ctx.fillText('【左栏·起承】', 30, 140);
    ctx.fillStyle = '#f1f5f9';
    ch.leftColumn.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, 30, 175 + i * 32);
    });

    // Right Column Preview
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
    sprite.scale.set(3.4, 4.0, 1);
    return sprite;
  }

  private getSeatWorldPos(event: SpiralEvent): THREE.Vector3 {
    const spacing = 3.1;
    const x = event.grid_x * spacing;
    const z = event.grid_z * spacing;
    const tierHeights = [6.0, 5.2, 4.4, 3.6, 2.8, 2.0, 1.2];
    const y = tierHeights[event.layer - 1] + 0.15;
    return new THREE.Vector3(x, y, z);
  }

  private buildSeatsAndFlowers() {
    this.events.forEach((ev) => {
      const pos = this.getSeatWorldPos(ev);
      const seatGroup = new THREE.Group();
      seatGroup.position.copy(pos);

      // Bronze Lotus Plinth
      const padGeo = new THREE.CylinderGeometry(1.05, 1.2, 0.15, 8);
      const padMat = new THREE.MeshStandardMaterial({
        color: ev.seat_status === 'reserved' ? 0xd97706 : 0x1f2937,
        metalness: 0.7,
        roughness: 0.3,
        emissive: ev.seat_status === 'reserved' ? 0x78350f : 0x0f172a,
        emissiveIntensity: 0.4
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.receiveShadow = true;
      padMesh.userData = { type: 'seat_pad', seatId: ev.seat_id };
      seatGroup.add(padMesh);
      this.seatPads.set(ev.seat_id, padMesh);

      // Blooming Flower
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
        const petalGeo = new THREE.ConeGeometry(0.35, 0.9, 5);
        petalGeo.rotateX(Math.PI / 3);
        const petal = new THREE.Mesh(petalGeo, flowerMat);
        petal.position.set(Math.sin(angle) * 0.4, 0.3, Math.cos(angle) * 0.4);
        petal.rotation.y = angle;
        flowerGroup.add(petal);
      }

      const coreGeo = new THREE.SphereGeometry(0.25, 12, 12);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.y = 0.35;
      flowerGroup.add(coreMesh);

      flowerGroup.scale.set(0.6, 0.6, 0.6);
      seatGroup.add(flowerGroup);
      this.flowerMeshes.set(ev.seat_id, flowerGroup);

      // Label Sprite
      const sprite = this.createSeatSprite(ev);
      sprite.position.set(0, 1.4, 0);
      seatGroup.add(sprite);
      this.seatLabels.set(ev.seat_id, sprite);

      this.altarGroup.add(seatGroup);
    });
  }

  private createSeatSprite(ev: SpiralEvent): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
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

  private buildWaterCanal() {
    this.waterSpiralPath = this.events.map((ev) => this.getSeatWorldPos(ev));
    const curve = new THREE.CatmullRomCurve3(this.waterSpiralPath, false, 'catmullrom', 0.15);
    const points = curve.getPoints(300);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });
    const waterLine = new THREE.Line(lineGeo, lineMat);
    this.altarGroup.add(waterLine);

    const particleCount = 200;
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
    
    // Check Seat Pads
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

    // Check Outer Tea Lanterns
    const lanterns = Array.from(this.lanternPanels.values());
    const lanternHits = this.raycaster.intersectObjects(lanterns);
    if (lanternHits.length > 0) {
      const hit = lanternHits[0].object;
      const chIdx = hit.userData?.chapterIndex;
      if (chIdx && this.onLanternSelect) {
        this.onLanternSelect(chIdx);
        return;
      }
    }

    // Check Interior Stelae
    const stelae = Array.from(this.interiorStelae.values());
    const stelaHits = this.raycaster.intersectObjects(stelae);
    if (stelaHits.length > 0) {
      const hit = stelaHits[0].object;
      const sId = hit.userData?.seasonId;
      if (sId && this.onInteriorPoemSelect) {
        this.onInteriorPoemSelect(sId);
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
        this.controls.target.lerp(targetPos, 0.4);
      }
    }
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    if (mode === 'interior') {
      // Fly into the hollow pyramid interior
      this.camera.position.set(0, 2.4, 4.5);
      this.controls.target.set(0, 2.6, 0);
    } else if (mode === 'outer_lanterns') {
      // Focus on the outer 16 tea lanterns
      this.camera.position.set(0, 3.8, 23.5);
      this.controls.target.set(0, 2.2, 19.5);
    } else if (mode === 'topdown') {
      this.camera.position.set(0, 52, 0.1);
      this.controls.target.set(0, 0, 0);
    } else if (mode === 'fountain') {
      this.camera.position.set(0, 16, 12);
      this.controls.target.set(0, 8, 0);
    } else if (mode === 'cinematic') {
      this.camera.position.set(30, 15, 30);
      this.controls.target.set(0, 3, 0);
    } else if (mode === 'orbit') {
      this.camera.position.set(28, 30, 36);
      this.controls.target.set(0, 4, 0);
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

    this.controls.update();

    // 1. Slow continuous rotation of the outer 16 Tea Lanterns (Clockwise history wheel)
    if (this.lanternsGroup) {
      this.lanternsGroup.rotation.y = elapsedTime * 0.05;
    }

    // 2. Subtle floating oscillation for Interior Stelae
    this.interiorStelae.forEach((stela, idx) => {
      stela.position.y = 2.6 + Math.sin(elapsedTime * 2 + Number(idx.replace('S', ''))) * 0.05;
    });

    // 3. Rotate apex fountain ring and animate fountain particles
    if (this.fountainGroup) {
      this.fountainGroup.rotation.y = elapsedTime * 0.2;
    }
    if (this.fountainParticles) {
      const posAttr = this.fountainParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - 0.05;
        if (y < 6.0) y = 10.0;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // 4. Water particles flowing along spiral
    if (this.waterParticles && this.waterSpiralPath.length > 0) {
      const pAttr = this.waterParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pAttr.count; i++) {
        const step = (elapsedTime * 8 + i * 0.25) % this.waterSpiralPath.length;
        const idxA = Math.floor(step);
        const idxB = (idxA + 1) % this.waterSpiralPath.length;
        const frac = step - idxA;
        const pA = this.waterSpiralPath[idxA];
        const pB = this.waterSpiralPath[idxB];

        pAttr.setXYZ(
          i,
          pA.x + (pB.x - pA.x) * frac + Math.sin(elapsedTime * 4 + i) * 0.05,
          pA.y + (pB.y - pA.y) * frac + 0.12,
          pA.z + (pB.z - pA.z) * frac + Math.cos(elapsedTime * 4 + i) * 0.05
        );
      }
      pAttr.needsUpdate = true;
    }

    // 5. Starships floating
    this.starshipMeshes.forEach((ship, id) => {
      ship.position.y += Math.sin(elapsedTime * 2 + id) * 0.003;
      ship.rotation.y = elapsedTime * 0.3 + id;
    });

    // 6. Flowers breathing
    this.flowerMeshes.forEach((flower, id) => {
      const pulse = 1.0 + Math.sin(elapsedTime * 3 + id) * 0.05;
      flower.rotation.y = elapsedTime * 0.4 + id;
      if (id !== this.activeSeatId) {
        flower.scale.set(0.6 * pulse, 0.6 * pulse, 0.6 * pulse);
      }
    });

    // 7. Auto patrol
    if (this.isAutoPatrol) {
      this.currentProgress += 0.08;
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
