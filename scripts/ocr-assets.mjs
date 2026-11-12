// ビルド時に、日本語の学習データとワーカーを dist/ocr へコピーする。
// 実行時は本番と同じサイト（この dist）から読む。CDN には置かない。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CORE_JS = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

/** ボタンを押したあとにブラウザが読むファイル。src は node_modules、dest は dist/ocr からの相対。 */
export function ocrFiles() {
  const nm = path.join(root, 'node_modules');
  const core = path.join(nm, 'tesseract.js-core');
  return [
    { src: path.join(nm, 'tesseract.js/dist/worker.min.js'), dest: 'worker.min.js' },
    { src: path.join(nm, 'tesseract.js/LICENSE.md'), dest: 'LICENSE-tesseract.txt' },
    { src: path.join(core, 'LICENSE'), dest: 'LICENSE-tesseract-core.txt' },
    { src: path.join(nm, '@tesseract.js-data/jpn/README.md'), dest: 'LICENSE-jpn.txt' },
    { src: path.join(nm, '@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz'), dest: 'lang/jpn.traineddata.gz' },
    ...CORE_JS.map((name) => ({ src: path.join(core, name), dest: `core/${name}` })),
  ];
}

function contentType(file) {
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.wasm')) return 'application/wasm';
  if (file.endsWith('.txt') || file.endsWith('.md')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

export function ocrAssetPlugin() {
  const files = () => ocrFiles();
  return {
    name: 'ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url || '').split('?')[0]);
        const hit = files().find((item) => pathname === `/ocr/${item.dest}`);
        if (!hit) { next(); return; }
        res.writeHead(200, { 'content-type': contentType(hit.dest), 'cache-control': 'no-cache' });
        fs.createReadStream(hit.src).pipe(res);
      });
    },
    closeBundle() {
      const out = path.join(root, 'dist', 'ocr');
      for (const item of files()) {
        const dest = path.join(out, item.dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(item.src, dest);
      }
    },
  };
}
