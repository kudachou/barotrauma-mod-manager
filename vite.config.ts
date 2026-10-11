import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * 变体开关（构建期注入）。
 *
 * `BMM_VARIANT=workshop` 出**创意工坊版**：去掉浏览工坊与工坊下架检查、不索取 Web API Key、
 * 关闭 electron-updater（改成"工坊检测 → 提示重装"）。
 * 不设或设成别的值就是完整版。
 *
 * 主进程那边读的是 electron/services/variant.js（它认 process.env 与 resources 里的标记文件），
 * 渲染层这边用 define 把值钉死在 bundle 里 —— 两边都由同一个环境变量驱动，不会漂移。
 */
const variant = process.env.BMM_VARIANT === 'workshop' ? 'workshop' : 'full';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5273, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true },
  define: {
    'import.meta.env.BMM_VARIANT': JSON.stringify(variant)
  }
});
