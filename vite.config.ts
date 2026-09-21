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
        // #5 · 公共/工程入口隔离。
        // 隔离**本体**来自 main.tsx 的 lazy split（公共页根本不下发导演 chunk）；
        // 此处仅把导演按需 chunk 的**文件名**改为中性 `chunk-[hash].js`，使公共 entry 里
        // 动态 import 说明符不残留 `DirectorApp` 模块名（view-source 公共包读不到工程标识）。
        // 这是「不暴露模块名」的收尾混淆，**不是**隔离本体；不改行为：导演台仍在其独立
        // chunk 里、仍只在 `#/director` 时按需拉取。
        chunkFileNames: (chunkInfo) =>
          chunkInfo.name === 'DirectorApp' ? 'assets/chunk-[hash].js' : 'assets/[name]-[hash].js'
      }
    }
  }
});
