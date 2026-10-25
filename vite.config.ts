// إعدادات البناء: مسارات نسبية حتى تعمل اللعبة على GitHub Pages وداخل تطبيق Capacitor
// Build config: relative base so the game works on GitHub Pages and inside Capacitor
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: 'node',
  },
});
