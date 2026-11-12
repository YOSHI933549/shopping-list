import { defineConfig } from 'vite';
import { ocrAssetPlugin } from './scripts/ocr-assets.mjs';

export default defineConfig({
  base: './',
  plugins: [ocrAssetPlugin()],
  test: { include: ['tests/**/*.test.js'] },
});
