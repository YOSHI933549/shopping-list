// 作り例のレシート画像。実物のレシートは使わない。店名と金額はアプリの例と同じ架空の文字。
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './lib.mjs';
import { SAMPLE_RECEIPT_LINES } from '../src/ocr/score.js';

const out = path.join(root, 'tests/fixtures/sample-receipt.png');
const lines = SAMPLE_RECEIPT_LINES.map((line) => `<div class="row">${line}</div>`).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#fff}
  .paper{box-sizing:border-box;width:760px;padding:72px 80px 88px;background:#fff;color:#000;
    font-family:"WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif;font-size:52px;line-height:1.9}
  .row{white-space:nowrap}
</style><div class="paper">${lines}</div>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.locator('.paper').screenshot({ path: out });
await browser.close();
fs.writeFileSync(path.join(root, 'tests/fixtures/sample-receipt.txt'), `${SAMPLE_RECEIPT_LINES.join('\n')}\n`);
console.log('wrote', out);
