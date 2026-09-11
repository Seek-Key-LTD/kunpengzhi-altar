import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SpiralEvent, CameraMode } from '../types/altar';
import { TEA_POEM_16_CHAPTERS } from '../data/tea_poem_16';

export class AltarScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  
  // Scene Groups
  private pyramid140Group: THREE.Group;
  private shaftElevatorGroup: THREE.Group;
  private undergroundRiverGroup: THREE.Group;
  private surfaceWaterGroup: THREE.Group;
  private lanternsGroup: THREE.Group;
  private primeLinesGroup: THREE.Group;
  private starshipsGroup: THREE.Group;
  
  // Interactive Objects & Meshes
  private waterSpiralPath: THREE.Vector3[] = [];
  private waterParticles: THREE.Points | null = null;
  private splashParticles: THREE.Points | null = null;
  private seatPads: Map<number, THREE.Mesh> = new Map();
  private seatLotusMeshes: Map<number, THREE.Group> = new Map();
  private starshipMeshes: Map<number, THREE.Group> = new Map();
  private lanternPanels: Map<number, THREE.Mesh> = new Map();

  // Elevator & Pulley Rig
  private elevatorCarriage: THREE.Group = new THREE.Group();
  private tipperBucketMesh: THREE.Group = new THREE.Group();
  private bucketWaterMesh: THREE.Mesh | null = null;
  private topPulleyLeft: THREE.Mesh | null = null;
  private topPulleyRight: THREE.Mesh | null = null;
  private leftCableMesh: THREE.Line | null = null;
  private rightCableMesh: THREE.Line | null = null;
  private waterPourStream: THREE.Mesh | null = null;
  private topFlowerMesh: THREE.Group | null = null;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // State
  private events: SpiralEvent[] = [];
  private activeSeatId: number | null = 1;
  private cameraMode: CameraMode = 'orbit';
  private onSeatSelect?: (seatId: number) => void;
  private onLanternSelect?: (chapterIndex: number) => void;
  private clock = new THREE.Clock();

  // Speed & Rotation
  private lanternRotationSpeed = 0.0015;
  private currentProgress = 1;
  private isAutoPatrol = false;

  // Smooth Camera Target
  private targetCameraPos = new THREE.Vector3(26, 24, 32);
  private targetControlsTarget = new THREE.Vector3(0, 3.5, 0);
  private isCameraTransitioning = false;

  constructor(
    container: HTMLElement,
    events: SpiralEvent[],
    onSeatSelect?: (seatId: number) => void,
    onLanternSelect?: (chapterIndex: number) => void
  ) {
    this.container = container;
    this.events = events;
    this.onSeatSelect = onSeatSelect;
    this.onLanternSelect = onLanternSelect;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040812);
    this.scene.fog = new THREE.FogExp2(0x040812, 0.012);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(26, 24, 32);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 160;
    this.controls.target.set(0, 3.5, 0);

    // 5. Structure Groups
    this.pyramid140Group = new THREE.Group();
    this.shaftElevatorGroup = new THREE.Group();
    this.undergroundRiverGroup = new THREE.Group();
    this.surfaceWaterGroup = new THREE.Group();
    this.lanternsGroup = new THREE.Group();
    this.primeLinesGroup = new THREE.Group();
    this.starshipsGroup = new THREE.Group();

    this.scene.add(this.pyramid140Group);
    this.scene.add(this.shaftElevatorGroup);
    this.scene.add(this.undergroundRiverGroup);
    this.scene.add(this.surfaceWaterGroup);
    this.scene.add(this.lanternsGroup);
    this.scene.add(this.primeLinesGroup);
    this.scene.add(this.starshipsGroup);

    // 6. Build Layers
    this.initLighting();
    this.buildBaseBasinAndRiver();
    this.build140BricksPyramidAndShaft();
    this.buildVerticalElevatorAndPulleys();
    this.buildOuter16TeaLanterns();
    this.buildStarships();
    this.buildAtmosphere();

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize);
    this.container.addEventListener('pointerdown', this.onPointerDown);

    // 8. Start loop
    this.animate();
  }

  private initLighting() {
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.3);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffedd5, 2.5);
    sunLight.position.set(30, 45, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    rimLight.position.set(-30, 10, -30);
    this.scene.add(rimLight);

    // Internal Shaft Warm Light (Torch & Mechanical Glow)
    const shaftLight = new THREE.PointLight(0xf59e0b, 3.0, 18, 1.2);
    shaftLight.position.set(0, 3.5, 0);
    this.shaftElevatorGroup.add(shaftLight);

    // Underground River Cyan Glow
    const riverLight = new THREE.PointLight(0x06b6d4, 2.8, 22, 1.1);
    riverLight.position.set(0, -0.2, 0);
    this.undergroundRiverGroup.add(riverLight);
  }

  // 1. Base Basin & Underground River (第7层基底横贯暗河)
  private buildBaseBasinAndRiver() {
    // Large foundation terrace
    const baseGeo = new THREE.BoxGeometry(25.6, 0.6, 25.6);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.2
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.3;
    baseMesh.receiveShadow = true;
    this.undergroundRiverGroup.add(baseMesh);

    // Bronze boundary perimeter
    const rimGeo = new THREE.BoxGeometry(26.0, 0.1, 26.0);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x78350f,
      emissiveIntensity: 0.3
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.05;
    this.undergroundRiverGroup.add(rimMesh);

    // Subterranean River Canal (Cut through from Z = -13m to Z = +13m)
    const riverWidth = 3.6;
    const riverLength = 25.8;
    const riverGeo = new THREE.PlaneGeometry(riverWidth, riverLength, 32, 32);
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.88
    });
    const riverMesh = new THREE.Mesh(riverGeo, riverMat);
    riverMesh.rotation.x = -Math.PI / 2;
    riverMesh.position.set(0, -0.05, 0);
    this.undergroundRiverGroup.add(riverMesh);

    // Tunnel Stone Arches on North & South Entrances
    [-12.8, 12.8].forEach((zPos) => {
      const archGroup = new THREE.Group();
      archGroup.position.set(0, 0.5, zPos);

      const archMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.7,
        metalness: 0.4
      });

      const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 1.2), archMat);
      leftPillar.position.set(-2.0, 0.3, 0);
      const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 1.2), archMat);
      rightPillar.position.set(2.0, 0.3, 0);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.5, 1.2), archMat);
      lintel.position.set(0, 1.2, 0);

      archGroup.add(leftPillar);
      archGroup.add(rightPillar);
      archGroup.add(lintel);
      this.undergroundRiverGroup.add(archGroup);
    });
  }

  // 2. 140-Cube Solid Stepped Pyramid with Central Vertical Shaft (天井)
  // 1^2 + 2^2 + 3^2 + 4^2 + 5^2 + 6^2 + 7^2 = 140 Bricks
  private build140BricksPyramidAndShaft() {
    const spacing = 3.0;
    const brickSize = 2.85;
    const brickHeight = 0.95;

    // Ancient dark cyan slate materials (古法黛青条石 / 玄武青石，绝非红砖)
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x17202c,
      roughness: 0.65,
      metalness: 0.3
    });

    const primeStoneMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.45,
      metalness: 0.5,
      emissive: 0x0284c7,
      emissiveIntensity: 0.3
    });

    const bronzeEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.3,
      metalness: 0.85,
      emissive: 0x92400e,
      emissiveIntensity: 0.3
    });

    const waterGrooveMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.9
    });

    // Map events by seat_id and grid coords for exact placement
    const eventMap = new Map<string, SpiralEvent>();
    this.events.forEach((ev) => {
      eventMap.set(`${ev.grid_x},${ev.grid_z}`, ev);
    });

    // Build 7 tiers (k = 1 is top 1x1, k = 7 is bottom 7x7)
    for (let k = 1; k <= 7; k++) {
      const yPos = (7 - k) * brickHeight;
      const layerEventRadius = (k - 1) / 2; // For tier 1: 0; tier 7: 3.0

      for (let ix = -layerEventRadius; ix <= layerEventRadius; ix += 1) {
        for (let iz = -layerEventRadius; iz <= layerEventRadius; iz += 1) {
          // Check if this position is inside the central hollow vertical shaft
          const isCenterShaft = Math.abs(ix) < 0.5 && Math.abs(iz) < 0.5;

          if (isCenterShaft) {
            // Leave center hollow for the vertical shaft
            continue;
          }

          // Grid coordinates in integer [-3..3]
          const gx = Math.round(ix);
          const gz = Math.round(iz);
          const ev = eventMap.get(`${gx},${gz}`);

          // Check if this cube's top face is exposed to the sky (Telescoping sum surface = 49)
          const isExposedTop = Math.abs(ix) === layerEventRadius || Math.abs(iz) === layerEventRadius;

          const cubeGroup = new THREE.Group();
          cubeGroup.position.set(ix * spacing, yPos + brickHeight / 2, iz * spacing);

          // Brick Geometry
          const geo = new THREE.BoxGeometry(brickSize, brickHeight, brickSize);
          const mat = ev?.is_prime ? primeStoneMat : stoneMat;
          const cubeMesh = new THREE.Mesh(geo, mat);
          cubeMesh.castShadow = true;
          cubeMesh.receiveShadow = true;
          cubeGroup.add(cubeMesh);

          // Bronze bevel corner trims on exposed blocks
          if (isExposedTop) {
            const edgeGeo = new THREE.BoxGeometry(brickSize + 0.05, 0.06, brickSize + 0.05);
            const edgeMesh = new THREE.Mesh(edgeGeo, bronzeEdgeMat);
            edgeMesh.position.y = brickHeight / 2;
            cubeGroup.add(edgeMesh);

            // Carved water channel on the exposed top surface
            const canalGeo = new THREE.BoxGeometry(brickSize * 0.72, 0.04, brickSize * 0.72);
            const canalMesh = new THREE.Mesh(canalGeo, waterGrooveMat);
            canalMesh.position.y = brickHeight / 2 + 0.03;
            cubeGroup.add(canalMesh);

            // Interactive Seat Pad & Lotus for the 49 surface seats
            if (ev) {
              const padGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.08, 24);
              const padMat = new THREE.MeshStandardMaterial({
                color: ev.is_prime ? 0x0284c7 : 0x1e293b,
                emissive: ev.is_prime ? 0x0284c7 : 0x0f172a,
                emissiveIntensity: ev.is_prime ? 0.6 : 0.2,
                roughness: 0.3,
                metalness: 0.8
              });
              const padMesh = new THREE.Mesh(padGeo, padMat);
              padMesh.position.y = brickHeight / 2 + 0.08;
              padMesh.userData = { type: 'seat_pad', seatId: ev.seat_id };
              cubeGroup.add(padMesh);
              this.seatPads.set(ev.seat_id, padMesh);

              // Seat Number Ring
              const seatSprite = this.createSeatNumberSprite(ev.seat_id, ev.is_prime);
              seatSprite.position.set(0, brickHeight / 2 + 0.45, 0);
              cubeGroup.add(seatSprite);

              // Lotus Flower
              const lotusGroup = this.createLotusMesh(ev);
              lotusGroup.position.set(0, brickHeight / 2 + 0.12, 0);
              lotusGroup.scale.setScalar(0.65);
              cubeGroup.add(lotusGroup);
              this.seatLotusMeshes.set(ev.seat_id, lotusGroup);
            }
          }

          this.pyramid140Group.add(cubeGroup);
        }
      }
    }

    // Top Collar at Tier 1 (1号位顶层受水口与浇花台)
    const topCollarGroup = new THREE.Group();
    topCollarGroup.position.set(0, 6 * brickHeight + brickHeight / 2, 0);

    const collarGeo = new THREE.BoxGeometry(brickSize, brickHeight, brickSize);
    const collarMesh = new THREE.Mesh(collarGeo, bronzeEdgeMat);
    topCollarGroup.add(collarMesh);

    // Top Receiving Basin (1号位花池)
    const basinGeo = new THREE.CylinderGeometry(1.0, 0.8, 0.3, 32);
    const basinMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.8,
      metalness: 0.9,
      roughness: 0.1
    });
    const basinMesh = new THREE.Mesh(basinGeo, basinMat);
    basinMesh.position.y = brickHeight / 2 + 0.15;
    topCollarGroup.add(basinMesh);

    // Top Central Peony / Sacred Flower (1号主花)
    this.topFlowerMesh = new THREE.Group();
    const flowerPetalMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });
    for (let p = 0; p < 12; p++) {
      const angle = (p / 12) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.65, 5), flowerPetalMat);
      petal.rotation.x = Math.PI / 3;
      petal.rotation.y = angle;
      petal.position.set(Math.sin(angle) * 0.35, 0.15, Math.cos(angle) * 0.35);
      this.topFlowerMesh.add(petal);
    }
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 1.0 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), coreMat);
    core.position.y = 0.2;
    this.topFlowerMesh.add(core);

    this.topFlowerMesh.position.set(0, brickHeight / 2 + 0.35, 0);
    topCollarGroup.add(this.topFlowerMesh);

    this.pyramid140Group.add(topCollarGroup);

    // Generate Gravity Water Flow Spiral Path across the 49 seats
    this.waterSpiralPath = this.events.map((ev) => this.getSeatWorldPos(ev));
    this.buildSurfaceWaterParticleStream();
  }

  // 3. Vertical Shaft Elevator & Pulley System (定滑轮自运维翻斗水梯)
  private buildVerticalElevatorAndPulleys() {
    // 4 Vertical Guide Rails in the central shaft
    const railHeight = 8.5;
    const railGeo = new THREE.CylinderGeometry(0.06, 0.06, railHeight, 8);
    const bronzeRailMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x78350f,
      emissiveIntensity: 0.4
    });

    const railOffsets = [
      [-1.1, -1.1],
      [1.1, -1.1],
      [-1.1, 1.1],
      [1.1, 1.1]
    ];
    railOffsets.forEach(([rx, rz]) => {
      const rail = new THREE.Mesh(railGeo, bronzeRailMat);
      rail.position.set(rx, railHeight / 2 - 0.5, rz);
      this.shaftElevatorGroup.add(rail);
    });

    // Top Pulley Gantry (定滑轮架, at Y = 7.5m)
    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(0, 7.5, 0);

    const gantryFrameGeo = new THREE.BoxGeometry(2.4, 0.15, 0.3);
    const gantryMesh = new THREE.Mesh(gantryFrameGeo, bronzeRailMat);
    gantryGroup.add(gantryMesh);

    // 2 Rotating Pulleys (定滑轮)
    const pulleyGeo = new THREE.TorusGeometry(0.4, 0.08, 12, 32);
    const pulleyMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0xb45309,
      emissiveIntensity: 0.5
    });

    this.topPulleyLeft = new THREE.Mesh(pulleyGeo, pulleyMat);
    this.topPulleyLeft.rotation.y = Math.PI / 2;
    this.topPulleyLeft.position.set(-0.8, 0.4, 0);
    gantryGroup.add(this.topPulleyLeft);

    this.topPulleyRight = new THREE.Mesh(pulleyGeo, pulleyMat);
    this.topPulleyRight.rotation.y = Math.PI / 2;
    this.topPulleyRight.position.set(0.8, 0.4, 0);
    gantryGroup.add(this.topPulleyRight);

    // Pulley Axle Bar
    const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8);
    axleGeo.rotateZ(Math.PI / 2);
    const axleMesh = new THREE.Mesh(axleGeo, bronzeRailMat);
    axleMesh.position.y = 0.4;
    gantryGroup.add(axleMesh);

    this.shaftElevatorGroup.add(gantryGroup);

    // Hoisting Cables (Cable Lines from Top Pulley down to Carriage)
    const cableMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0 });
    
    const cableGeoLeft = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.8, 7.9, 0),
      new THREE.Vector3(-0.8, 0, 0)
    ]);
    this.leftCableMesh = new THREE.Line(cableGeoLeft, cableMat);
    this.shaftElevatorGroup.add(this.leftCableMesh);

    const cableGeoRight = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.8, 7.9, 0),
      new THREE.Vector3(0.8, 0, 0)
    ]);
    this.rightCableMesh = new THREE.Line(cableGeoRight, cableMat);
    this.shaftElevatorGroup.add(this.rightCableMesh);

    // Tipper Elevator Bucket Assembly (翻斗车)
    this.elevatorCarriage = new THREE.Group();
    this.elevatorCarriage.position.set(0, 0, 0);

    // Outer Carriage Frame with guide shoes
    const carriageFrameMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.3
    });
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), carriageFrameMat);
    frameLeft.position.set(-0.85, 0, 0);
    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), carriageFrameMat);
    frameRight.position.set(0.85, 0, 0);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), carriageFrameMat);
    frameTop.position.set(0, 0.7, 0);

    this.elevatorCarriage.add(frameLeft);
    this.elevatorCarriage.add(frameRight);
    this.elevatorCarriage.add(frameTop);

    // Pivoting Tipper Bucket (可翻转水斗)
    this.tipperBucketMesh = new THREE.Group();
    this.tipperBucketMesh.position.set(0, 0, 0);

    const bucketMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      emissive: 0x78350f,
      emissiveIntensity: 0.3,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide
    });
    // Open top bucket box
    const bucketBox = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 1.1), bucketMat);
    this.tipperBucketMesh.add(bucketBox);

    // Water volume inside the bucket
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.9
    });
    this.bucketWaterMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 1.0), waterMat);
    this.bucketWaterMesh.position.y = 0.02;
    this.tipperBucketMesh.add(this.bucketWaterMesh);

    // Trunnion Axle (翻斗回转轴)
    const trunnion = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8), bronzeRailMat);
    trunnion.rotateZ(Math.PI / 2);
    this.tipperBucketMesh.add(trunnion);

    this.elevatorCarriage.add(this.tipperBucketMesh);
    this.shaftElevatorGroup.add(this.elevatorCarriage);

    // Water Pour Jet Stream (从翻斗倾倒出的水流柱)
    const streamGeo = new THREE.CylinderGeometry(0.12, 0.35, 1.2, 12);
    streamGeo.rotateZ(-Math.PI / 4);
    const streamMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.waterPourStream = new THREE.Mesh(streamGeo, streamMat);
    this.waterPourStream.position.set(0.6, 6.4, 0);
    this.waterPourStream.visible = false;
    this.shaftElevatorGroup.add(this.waterPourStream);

    // Water Splash Particle Burst at Level 1
    const splashCount = 120;
    const splashGeo = new THREE.BufferGeometry();
    const splashPos = new Float32Array(splashCount * 3);
    for (let i = 0; i < splashCount; i++) {
      splashPos[i * 3] = (Math.random() - 0.5) * 1.2;
      splashPos[i * 3 + 1] = 6.6 + Math.random() * 0.8;
      splashPos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
    const splashMat = new THREE.PointsMaterial({
      size: 0.18,
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.splashParticles = new THREE.Points(splashGeo, splashMat);
    this.splashParticles.visible = false;
    this.shaftElevatorGroup.add(this.splashParticles);
  }

  // 4. Outer 16 Tea Lanterns Pavilion (十六面大茶灯)
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

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`押 [${ch.rhymeWordLeft.split(' / ')[0]}] 韵 · 16句对位`, 192, 125);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '15px "Noto Serif SC", serif';
    ctx.textAlign = 'left';

    const maxLines = 10;
    for (let i = 0; i < Math.min(ch.leftColumn.length, maxLines); i++) {
      const y = 165 + i * 28;
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(ch.leftColumn[i], 28, y);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(ch.rightColumn[i], 200, y);
    }

    ctx.fillStyle = '#d97706';
    ctx.font = 'italic 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('【点击正面凝视 · 研读双栏全篇】', 192, 475);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.6, 4.4, 1);
    return sprite;
  }

  private createSeatNumberSprite(seatId: number, isPrime: boolean): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = isPrime ? 'rgba(2, 132, 199, 0.95)' : 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isPrime ? '#38bdf8' : '#d97706';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${seatId}`, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.7, 0.7, 1);
    return sprite;
  }

  private createLotusMesh(ev: SpiralEvent): THREE.Group {
    const group = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({
      color: ev.flower_color || 0x38bdf8,
      emissive: ev.is_prime ? 0x0284c7 : 0x0f172a,
      emissiveIntensity: ev.is_prime ? 0.6 : 0.2,
      roughness: 0.3,
      metalness: 0.2
    });

    for (let p = 0; p < 8; p++) {
      const angle = (p / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 5), petalMat);
      petal.rotation.x = Math.PI / 3.5;
      petal.rotation.y = angle;
      petal.position.set(Math.sin(angle) * 0.22, 0.08, Math.cos(angle) * 0.22);
      group.add(petal);
    }

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.6 })
    );
    core.position.y = 0.12;
    group.add(core);

    return group;
  }

  private buildSurfaceWaterParticleStream() {
    if (this.waterSpiralPath.length === 0) return;
    const particleCount = 400;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const idx = i % this.waterSpiralPath.length;
      const pt = this.waterSpiralPath[idx];
      pPos[i * 3] = pt.x;
      pPos[i * 3 + 1] = pt.y + 0.1;
      pPos[i * 3 + 2] = pt.z;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.2,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.waterParticles = new THREE.Points(pGeo, pMat);
    this.surfaceWaterGroup.add(this.waterParticles);
  }

  private buildStarships() {
    const shipGeo = new THREE.ConeGeometry(0.2, 0.8, 4);
    shipGeo.rotateX(Math.PI / 2);

    this.events.forEach((ev) => {
      if (ev.starship_id) {
        const shipGroup = new THREE.Group();
        const shipMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 0.7,
          metalness: 0.9,
          roughness: 0.2
        });
        const ship = new THREE.Mesh(shipGeo, shipMat);
        shipGroup.add(ship);

        const pos = this.getSeatWorldPos(ev);
        shipGroup.position.set(pos.x, pos.y + 1.2, pos.z);
        this.starshipMeshes.set(ev.seat_id, shipGroup);
        this.starshipsGroup.add(shipGroup);
      }
    });
  }

  private buildAtmosphere() {
    const starCount = 1200;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 300;
      starPos[i * 3 + 1] = Math.random() * 150;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.6, color: 0xffffff, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starGeo, starMat);
    this.scene.add(stars);
  }

  private getSeatWorldPos(event: SpiralEvent): THREE.Vector3 {
    const spacing = 3.0;
    const brickHeight = 0.95;
    const x = event.grid_x * spacing;
    const z = event.grid_z * spacing;
    const layer = event.layer || Math.max(Math.abs(event.grid_x), Math.abs(event.grid_z)) + 1;
    const y = (7 - layer) * brickHeight + brickHeight;
    return new THREE.Vector3(x, y, z);
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
    
    // Check Outer Tea Lanterns
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
  };

  public setActiveSeat(seatId: number) {
    this.activeSeatId = seatId;
    this.currentProgress = seatId;

    this.seatLotusMeshes.forEach((group, id) => {
      const isActive = id === seatId;
      group.scale.setScalar(isActive ? 1.1 : 0.65);
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
      // Look inside the vertical shaft watching the elevator & tipper
      this.targetCameraPos.set(3.2, 4.8, 3.6);
      this.targetControlsTarget.set(0, 3.8, 0);
    } else if (mode === 'fountain') {
      // Top Level 1 Flower & Pouring Basin
      this.targetCameraPos.set(0, 8.8, 3.8);
      this.targetControlsTarget.set(0, 6.8, 0);
    } else if (mode === 'outer_lanterns') {
      this.targetCameraPos.set(0, 3.2, 29.5);
      this.targetControlsTarget.set(0, 2.4, 23.5);
    } else if (mode === 'topdown') {
      this.targetCameraPos.set(0, 52, 0.1);
      this.targetControlsTarget.set(0, 0, 0);
    } else if (mode === 'cinematic') {
      this.targetCameraPos.set(32, 18, 32);
      this.targetControlsTarget.set(0, 3.5, 0);
    } else if (mode === 'orbit') {
      this.targetCameraPos.set(26, 24, 32);
      this.targetControlsTarget.set(0, 3.5, 0);
    }
  }

  public setAutoPatrol(patrol: boolean) {
    this.isAutoPatrol = patrol;
  }

  public updateEvents(events: SpiralEvent[]) {
    this.events = events;
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Smooth Camera Transition
    if (this.isCameraTransitioning) {
      this.camera.position.lerp(this.targetCameraPos, 0.05);
      this.controls.target.lerp(this.targetControlsTarget, 0.05);
      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.1) {
        this.isCameraTransitioning = false;
      }
    }

    this.controls.update();

    // 2. Slow continuous rotation of outer 16 Tea Lanterns
    if (this.lanternsGroup) {
      this.lanternsGroup.rotation.y += this.lanternRotationSpeed;
    }

    // 3. Self-Operating Hydraulic Elevator & Tipper Physical Cycle (10-second period)
    const cyclePeriod = 10.0;
    const cycleTime = elapsedTime % cyclePeriod;
    const cycleProgress = cycleTime / cyclePeriod;

    const minY = 0.0; // Underground river level
    const maxY = 6.0; // Top Level 1 aperture

    let currentElevatorY = minY;
    let bucketTilt = 0;
    let isPouring = false;

    if (cycleProgress < 0.15) {
      // Phase 0: At bottom underground river, dipping and refilling water
      currentElevatorY = minY;
      bucketTilt = 0;
      if (this.bucketWaterMesh) this.bucketWaterMesh.visible = true;
    } else if (cycleProgress < 0.48) {
      // Phase 1: Ascending vertically through the central shaft
      const frac = (cycleProgress - 0.15) / (0.48 - 0.15);
      currentElevatorY = THREE.MathUtils.lerp(minY, maxY, frac);
      bucketTilt = 0;
      if (this.topPulleyLeft) this.topPulleyLeft.rotation.z += 0.08;
      if (this.topPulleyRight) this.topPulleyRight.rotation.z += 0.08;
    } else if (cycleProgress < 0.65) {
      // Phase 2: At top (Level 1), tripping and pouring water onto the top flower & basin
      currentElevatorY = maxY;
      const pourFrac = (cycleProgress - 0.48) / (0.65 - 0.48);
      // Tilt bucket ~85 degrees
      bucketTilt = Math.sin(pourFrac * Math.PI) * (Math.PI * 0.48);
      isPouring = true;
      if (pourFrac > 0.5 && this.bucketWaterMesh) {
        this.bucketWaterMesh.visible = false;
      }
    } else if (cycleProgress < 0.73) {
      // Phase 3: Bucket rights itself upright
      currentElevatorY = maxY;
      bucketTilt = 0;
      isPouring = false;
    } else {
      // Phase 4: Descending back down to the underground river
      const frac = (cycleProgress - 0.73) / (1.0 - 0.73);
      currentElevatorY = THREE.MathUtils.lerp(maxY, minY, frac);
      bucketTilt = 0;
      isPouring = false;
      if (this.topPulleyLeft) this.topPulleyLeft.rotation.z -= 0.08;
      if (this.topPulleyRight) this.topPulleyRight.rotation.z -= 0.08;
    }

    // Update Elevator Position & Bucket Rotation
    this.elevatorCarriage.position.y = currentElevatorY;
    this.tipperBucketMesh.rotation.x = bucketTilt;

    // Update Cable Geometry
    if (this.leftCableMesh && this.rightCableMesh) {
      const pLeft = this.leftCableMesh.geometry.attributes.position as THREE.BufferAttribute;
      pLeft.setXYZ(1, -0.8, currentElevatorY + 0.7, 0);
      pLeft.needsUpdate = true;

      const pRight = this.rightCableMesh.geometry.attributes.position as THREE.BufferAttribute;
      pRight.setXYZ(1, 0.8, currentElevatorY + 0.7, 0);
      pRight.needsUpdate = true;
    }

    // Update Pouring Water Stream & Splash
    if (this.waterPourStream) {
      this.waterPourStream.visible = isPouring;
    }
    if (this.splashParticles) {
      this.splashParticles.visible = isPouring;
      if (isPouring) {
        const sPos = this.splashParticles.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < sPos.count; i++) {
          sPos.setY(i, 6.5 + Math.random() * 0.6);
        }
        sPos.needsUpdate = true;
      }
    }

    // 4. Top Flower Breathing & Oscillation
    if (this.topFlowerMesh) {
      this.topFlowerMesh.rotation.y = elapsedTime * 0.4;
      const pulse = 1.0 + Math.sin(elapsedTime * 3.0) * 0.06;
      this.topFlowerMesh.scale.set(pulse, pulse, pulse);
    }

    // 5. Water particles flowing along 49 surface spiral steps
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
          pA.y + (pB.y - pA.y) * frac + 0.08,
          pA.z + (pB.z - pA.z) * frac + Math.cos(elapsedTime * 4 + i) * 0.04
        );
      }
      pAttr.needsUpdate = true;
    }

    // 6. Starships floating
    this.starshipMeshes.forEach((ship, id) => {
      ship.position.y += Math.sin(elapsedTime * 2 + id) * 0.002;
      ship.rotation.y = elapsedTime * 0.2 + id;
    });

    // 7. Flowers breathing
    this.seatLotusMeshes.forEach((flower, id) => {
      const pulse = 1.0 + Math.sin(elapsedTime * 2.5 + id) * 0.04;
      flower.rotation.y = elapsedTime * 0.2 + id;
      if (id !== this.activeSeatId) {
        flower.scale.set(0.65 * pulse, 0.65 * pulse, 0.65 * pulse);
      }
    });

    // 8. Auto patrol
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
