// 実機の写真に近い「読みにくい」作り例の画像。傾き・影・ざらつき・細かい字・右端の値段。
// 実物のレシートは使わない。文字は tests/fixtures/hard-receipt.txt（「|」の右が値段の列）。
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './lib.mjs';

const opt = { rot: process.env.ROT ?? '3.2', fs: process.env.FS ?? '12', blur: process.env.BLUR ?? '.7', noise: process.env.NOISE ?? '.28', out: process.env.OUT };
const lines = fs.readFileSync(path.join(root, 'tests/fixtures/hard-receipt.txt'), 'utf8').trimEnd().split('\n');
const rows = lines.map((l) => {
  const [left, right] = l.split('|');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<div class="r"><span>${esc(left)}</span><span>${esc(right ?? '')}</span></div>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#4b4742}
  #stage{width:760px;height:700px;position:relative;overflow:hidden;
    background:linear-gradient(115deg,#5a5550 0%,#3d3935 100%)}
  #paper{position:absolute;left:150px;top:50px;width:430px;padding:26px 22px 40px;
    background:linear-gradient(100deg,#f4f1ea 0%,#e4e0d6 55%,#b9b4a8 100%);
    color:#2c2a28;font:${opt.fs}px/1.9 "WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif;
    transform:rotate(${opt.rot}deg);transform-origin:50% 0;box-shadow:6px 8px 18px rgba(0,0,0,.45);
    filter:blur(${opt.blur}px) contrast(.7) brightness(.95)}
  #noise{position:absolute;inset:0;opacity:${opt.noise};mix-blend-mode:multiply;pointer-events:none}
  .r{display:flex;justify-content:space-between;gap:12px;white-space:pre}
</style><div id="stage"><div id="paper">${rows}</div>
<svg id="noise" width="760" height="700"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg></div>`;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 760, height: 700 }, deviceScaleFactor: 1.5 });
await page.setContent(html, { waitUntil: 'load' });
const out = opt.out || path.join(root, 'tests/fixtures/hard-receipt.png');
await page.locator('#stage').screenshot({ path: out });
await browser.close();
console.log('wrote', out);
