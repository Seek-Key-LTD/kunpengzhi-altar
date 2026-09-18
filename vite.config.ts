import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // #5 · 公共/工程入口隔离：导演台按需 chunk 一律用中性文件名，避免公共入口 chunk
        // 里残留 `DirectorApp` 之类的工程模块名（访客 view-source 公共包读不到任何工程标识）。
        // 仅改产物文件名，不改行为：导演台仍在自己的 chunk 里、仍只在 `#/director` 时按需拉取。
        chunkFileNames: (chunkInfo) =>
          chunkInfo.name === 'DirectorApp' ? 'assets/console-[hash].js' : 'assets/[name]-[hash].js'
      }
    }
  }
});
