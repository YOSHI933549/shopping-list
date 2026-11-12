// 作り例のレシート画像。実物のレシートは使わない。文字は tests/fixtures/sample-receipt.txt。
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './lib.mjs';

const lines = fs.readFileSync(path.join(root, 'tests/fixtures/sample-receipt.txt'), 'utf8').trimEnd();
const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#fff}
  pre{margin:0;padding:80px 96px;background:#fff;color:#000;
    font-family:"WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif;
    font-size:72px;line-height:2.05;letter-spacing:0.06em}
</style><pre>${lines}</pre>`;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
const out = path.join(root, 'tests/fixtures/sample-receipt.png');
await page.locator('pre').screenshot({ path: out });
await browser.close();
console.log('wrote', out);
