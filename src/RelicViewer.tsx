import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SEAL_GOLD_MATERIAL } from './data/sealSpec';

const MODEL_URL = '/models/imperial_seal.glb';

const RelicViewer: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('正在加载玉玺资产…');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.Fog(0x05070d, 18, 60);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
    camera.position.set(5, 3.8, 6.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xcce8ff, 0x10151e, 2.2);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffe2a8, 3.2);
    key.position.set(5, 8, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ac8ff, 1.5);
    fill.position.set(-5, 3, -4);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.2;
    controls.maxDistance = 30;
    controls.target.set(0, 0, 0);

    const loader = new GLTFLoader();
    let disposed = false;
    // 金材质替换时被顶下来的 GLTF 原始材质（可能带贴图）：cleanup 时统一回收
    const replacedMaterials: THREE.Material[] = [];
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        const maxSize = Math.max(size.x, size.y, size.z) || 1;
        model.scale.setScalar(3.2 / maxSize);
        model.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            if (mesh.name.toLowerCase().includes('gold')) {
              const original = mesh.material;
              if (Array.isArray(original)) replacedMaterials.push(...original);
              else if (original) replacedMaterials.push(original);
              mesh.material = new THREE.MeshStandardMaterial(SEAL_GOLD_MATERIAL);
            }
          }
        });
        scene.add(model);
        setStatus('玉玺 GLB · 可旋转查看');
      },
      undefined,
      () => setStatus('玉玺资产加载失败')
    );

    const onResize = () => {
      if (!host) return;
      camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      // 场景全量回收（口径对齐 SceneDisposer.disposeSceneResources）：
      // 几何 + 材质 + 材质自身属性上的贴图（map/normalMap/…）都逐一 dispose，
      // 缺了贴图这一层，GLB 的位图会一直占着显存。
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      const collectMaterial = (material: THREE.Material) => {
        materials.add(material);
        const record = material as unknown as Record<string, unknown>;
        Object.keys(record).forEach((key) => {
          const value = record[key];
          if (value instanceof THREE.Texture) textures.add(value);
        });
      };
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach(collectMaterial);
          else if (mesh.material) collectMaterial(mesh.material);
        }
      });
      replacedMaterials.forEach(collectMaterial);
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05070d] text-slate-200">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-5 top-5 rounded-xl border border-slate-700/70 bg-slate-950/75 px-4 py-3 text-xs backdrop-blur-md">
        <div className="font-serif text-amber-300">传国玉玺 · GLB 资产查看器</div>
        <div className="mt-1 text-slate-400">{status}</div>
        <div className="mt-2 text-slate-500">拖拽旋转 · 滚轮缩放 · 右键平移</div>
      </div>
      <a href="/" className="absolute right-5 top-5 rounded-lg border border-slate-700/70 bg-slate-950/75 px-3 py-2 text-xs text-slate-300 backdrop-blur-md hover:text-amber-300">
        返回祭坛
      </a>
    </main>
  );
};

export default RelicViewer;
