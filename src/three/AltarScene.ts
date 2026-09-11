import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SpiralEvent, CameraMode } from '../types/altar';

export class AltarScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  
  // Scene elements
  private altarGroup: THREE.Group;
  private waterSpiralPath: THREE.Vector3[] = [];
  private waterLineMesh: THREE.Line | null = null;
  private waterParticles: THREE.Points | null = null;
  private fountainParticles: THREE.Points | null = null;
  private flowerMeshes: Map<number, THREE.Group> = new Map();
  private seatPads: Map<number, THREE.Mesh> = new Map();
  private starshipMeshes: Map<number, THREE.Group> = new Map();
  private seatLabels: Map<number, THREE.Sprite> = new Map();
  private fountainGroup: THREE.Group;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // State
  private events: SpiralEvent[] = [];
  private activeSeatId: number | null = 1;
  private cameraMode: CameraMode = 'orbit';
  private onSeatSelect?: (seatId: number) => void;
  private clock = new THREE.Clock();

  // Water flow progress (0 to 49)
  private currentProgress = 1;
  private isAutoPatrol = false;

  constructor(container: HTMLElement, events: SpiralEvent[], onSeatSelect?: (seatId: number) => void) {
    this.container = container;
    this.events = events;
    this.onSeatSelect = onSeatSelect;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.018);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(24, 28, 32);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Do not go under ground
    this.controls.minDistance = 6;
    this.controls.maxDistance = 120;
    this.controls.target.set(0, 4, 0);

    // 5. Groups
    this.altarGroup = new THREE.Group();
    this.fountainGroup = new THREE.Group();
    this.scene.add(this.altarGroup);
    this.scene.add(this.fountainGroup);

    // 6. Build Altar
    this.initLighting();
    this.buildSevenTierAltar();
    this.buildSeatsAndFlowers();
    this.buildWaterCanal();
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
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.2);
    this.scene.add(ambientLight);

    // Main directional sunlight (golden dawn)
    const sunLight = new THREE.DirectionalLight(0xffecd2, 2.5);
    sunLight.position.set(30, 50, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 150;
    sunLight.shadow.camera.left = -35;
    sunLight.shadow.camera.right = 35;
    sunLight.shadow.camera.top = 35;
    sunLight.shadow.camera.bottom = -35;
    this.scene.add(sunLight);

    // Cyan rim light from below
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    rimLight.position.set(-30, 10, -30);
    this.scene.add(rimLight);

    // Golden core point light at the altar apex
    const apexLight = new THREE.PointLight(0xfbbf24, 3, 40, 1.2);
    apexLight.position.set(0, 10, 0);
    this.scene.add(apexLight);
  }

  private buildSevenTierAltar() {
    const tierHeights = [1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0]; // 7 tiers
    const tierHalfSizes = [11.0, 9.5, 8.0, 6.5, 5.0, 3.5, 2.0]; // bottom to top

    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.65,
      metalness: 0.25,
    });

    const bronzeEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.35,
      metalness: 0.8,
      emissive: 0x92400e,
      emissiveIntensity: 0.2
    });

    // Outer Recycling Basin (回收渠)
    const basinGeo = new THREE.BoxGeometry(26, 0.4, 26);
    const basinMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.8,
      metalness: 0.1
    });
    const basinMesh = new THREE.Mesh(basinGeo, basinMat);
    basinMesh.position.y = -0.2;
    basinMesh.receiveShadow = true;
    this.altarGroup.add(basinMesh);

    // Seven tiers
    for (let i = 0; i < 7; i++) {
      const halfSize = tierHalfSizes[i];
      const h = tierHeights[i];
      const boxGeo = new THREE.BoxGeometry(halfSize * 2, h, halfSize * 2);
      const boxMesh = new THREE.Mesh(boxGeo, stoneMaterial);
      boxMesh.position.y = h / 2;
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;
      this.altarGroup.add(boxMesh);

      // Gold/Bronze trim line around each step
      const trimGeo = new THREE.BoxGeometry(halfSize * 2 + 0.1, 0.08, halfSize * 2 + 0.1);
      const trimMesh = new THREE.Mesh(trimGeo, bronzeEdgeMaterial);
      trimMesh.position.y = h + 0.04;
      this.altarGroup.add(trimMesh);
    }
  }

  private getSeatWorldPos(event: SpiralEvent): THREE.Vector3 {
    const spacing = 3.1;
    const x = event.grid_x * spacing;
    const z = event.grid_z * spacing;
    
    // Height determined by layer (1=highest tier, 7=lowest tier)
    const tierHeights = [6.0, 5.2, 4.4, 3.6, 2.8, 2.0, 1.2];
    const y = tierHeights[event.layer - 1] + 0.15;
    return new THREE.Vector3(x, y, z);
  }

  private buildSeatsAndFlowers() {
    this.events.forEach((ev) => {
      const pos = this.getSeatWorldPos(ev);
      const seatGroup = new THREE.Group();
      seatGroup.position.copy(pos);

      // 1. Bronze Lotus Plinth (Base Pad)
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
      padMesh.userData = { seatId: ev.seat_id };
      seatGroup.add(padMesh);
      this.seatPads.set(ev.seat_id, padMesh);

      // 2. Holographic Blooming Flower
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

      // Core pollen glow sphere
      const coreGeo = new THREE.SphereGeometry(0.25, 12, 12);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.y = 0.35;
      flowerGroup.add(coreMesh);

      flowerGroup.scale.set(0.6, 0.6, 0.6);
      seatGroup.add(flowerGroup);
      this.flowerMeshes.set(ev.seat_id, flowerGroup);

      // 3. Floating Light Pillar for Reserved / Active
      const pillarGeo = new THREE.CylinderGeometry(0.02, 0.02, 3, 6);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(ev.flower_color),
        transparent: true,
        opacity: 0.35
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.y = 1.5;
      seatGroup.add(pillar);

      // 4. Create Sprite Canvas Label (Seat number & name)
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

    // Background tag
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(10, 10, 236, 108, 16);
    ctx.fill();
    ctx.strokeStyle = ev.seat_status === 'reserved' ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Text
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

    // Smooth curve through the 49 spiral points
    const curve = new THREE.CatmullRomCurve3(this.waterSpiralPath, false, 'catmullrom', 0.15);
    const points = curve.getPoints(300);

    // Glowing canal line
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });
    this.waterLineMesh = new THREE.Line(lineGeo, lineMat);
    this.altarGroup.add(this.waterLineMesh);

    // Water flow particle trail
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
    // 无极点 (Fountain / Apex at 0, 0)
    // Vertical light beam from apex
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

    // Levitating Celestial Ring at the apex
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

    // Particle Fountain
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
    // Build distinctive futuristic Chinese starships floating near key stations
    this.events.forEach((ev) => {
      if (ev.seat_status === 'reserved' || ev.seat_id === 49) {
        const shipGroup = new THREE.Group();
        const basePos = this.getSeatWorldPos(ev);
        shipGroup.position.set(basePos.x, basePos.y + 4.5, basePos.z);

        // Hull
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

        // Wings
        const wingGeo = new THREE.BoxGeometry(2.0, 0.05, 0.8);
        const wingMat = new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.8,
          roughness: 0.3
        });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, 0, 0.2);
        shipGroup.add(wings);

        // Engine glow
        const glowGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(0, 0, -1.0);
        shipGroup.add(glow);

        shipGroup.scale.set(0.65, 0.65, 0.65);
        this.starshipMeshes.set(ev.seat_id, shipGroup);
        this.altarGroup.add(shipGroup);
      }
    });
  }

  private buildSurroundingAtmosphere() {
    // Distant starfield
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
    const pads = Array.from(this.seatPads.values());
    const intersects = this.raycaster.intersectObjects(pads);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const seatId = hit.userData?.seatId;
      if (seatId && this.onSeatSelect) {
        this.onSeatSelect(seatId);
        this.setActiveSeat(seatId);
      }
    }
  };

  public setActiveSeat(seatId: number) {
    this.activeSeatId = seatId;
    this.currentProgress = seatId;

    // Highlight selected flower & plinth
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
    if (mode === 'topdown') {
      this.camera.position.set(0, 50, 0.1);
      this.controls.target.set(0, 0, 0);
    } else if (mode === 'fountain') {
      this.camera.position.set(0, 16, 12);
      this.controls.target.set(0, 8, 0);
    } else if (mode === 'cinematic') {
      this.camera.position.set(28, 14, 28);
      this.controls.target.set(0, 3, 0);
    } else if (mode === 'orbit') {
      this.camera.position.set(24, 28, 32);
      this.controls.target.set(0, 4, 0);
    }
  }

  public setAutoPatrol(patrol: boolean) {
    this.isAutoPatrol = patrol;
  }

  public updateEvents(events: SpiralEvent[]) {
    this.events = events;
    // Refresh sprites with updated data
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

    // 1. Controls update
    this.controls.update();

    // 2. Rotate apex fountain ring and animate particles
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

    // 3. Water particles flowing along spiral
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

    // 4. Gentle floating oscillation for Starships
    this.starshipMeshes.forEach((ship, id) => {
      ship.position.y += Math.sin(elapsedTime * 2 + id) * 0.003;
      ship.rotation.y = elapsedTime * 0.3 + id;
    });

    // 5. Flower breathing animation
    this.flowerMeshes.forEach((flower, id) => {
      const pulse = 1.0 + Math.sin(elapsedTime * 3 + id) * 0.05;
      flower.rotation.y = elapsedTime * 0.4 + id;
      if (id !== this.activeSeatId) {
        flower.scale.set(0.6 * pulse, 0.6 * pulse, 0.6 * pulse);
      }
    });

    // 6. Auto patrol along spiral
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
