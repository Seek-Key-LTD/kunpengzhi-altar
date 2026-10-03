import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // perf(bundle) · vendor 分包：主 chunk 曾 >1.2MB（three+react+应用码全在
        // index-[hash].js），vite 每次 build hash 全变 → CDN/浏览器对整个装置全量回源。
        // 拆出 three-vendor / react-vendor 后，应用码迭代不再击穿重型依赖的缓存；
        // 两者均为公共页静态依赖（AltarScene 同步路径不动），vite 会为静态 chunk 生成
        // modulepreload，首屏不加 RTT。tone 仍留主 chunk：唯一消费者 src/audio/altarAudio.ts
        // 与 AltarScene 同生命周期，单独成 chunk 无独立缓存收益。
        manualChunks(id: string) {
          if (id.includes('/node_modules/three/')) return 'three-vendor';
          if (
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
        // #5 · 公共/工程入口隔离。
        // 隔离**本体**来自 main.tsx 的 lazy split（公共页根本不下发导演 chunk）；
        // 此处仅把**按路由懒加载**的入口 chunk（DirectorApp / RelicViewer）的文件名
        // 改为中性 `chunk-[hash].js`：动态 import 说明符最终以 chunk 文件名字符串
        // 落在公共 entry 里，中性名使公共包读不到模块名（view-source 口径）。
        // 这是「不暴露模块名」的收尾混淆，**不是**隔离本体；不改行为：两者仍只在
        // 各自路由命中时按需拉取。
        chunkFileNames: (chunkInfo) =>
          chunkInfo.name === 'DirectorApp' || chunkInfo.name === 'RelicViewer'
            ? 'assets/chunk-[hash].js'
            : 'assets/[name]-[hash].js'
      }
    }
  }
});
