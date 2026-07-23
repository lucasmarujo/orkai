import react from '@vitejs/plugin-react';
// De `vitest/config` para o bloco `test` ser tipado sem uma segunda config.
import { defineConfig } from 'vitest/config';

// Porta fixa: o Tauri aponta o devUrl para ela e falha se o Vite mudar sozinho.
// 1420 e a porta padrao do Tauri; 5173 (padrao do Vite) costuma estar ocupada.
const DEV_PORT = 1420;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
  },
  build: {
    target: 'chrome110',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
