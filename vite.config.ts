import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5273, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true }
});
