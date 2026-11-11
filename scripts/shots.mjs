import fs from 'node:fs';
import path from 'node:path';
import { priceKey } from '../src/lib/price.js';
import { build, serve, launch, root } from './lib.mjs';

build();
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await serve();
const browser = await launch();

const stores = [
  { id: 'amazon', name: 'Amazon' }, { id: 'aeon', name: 'イオン' }, { id: 'matsukiyo', name: 'マツキヨ' }, { id: 'unset', name: '未設定' },
];
const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
let n = 0;
const it = (name, storeId, memo = '') => ({ id: `i${++n}`, name, storeId, memo, addedAt: new Date(2026, 9, 31, 9, n).toISOString() });
const mk = (items, extra = {}) => ({
  version: 1, stores, items, bought: [], regulars: [],
  settings: { aisleOrder: false, lastStoreId: 'aeon' }, ...extra,
});

const twenty = [
  it('キャベツ', 'aeon'), it('人参', 'aeon'), it('玉ねぎ', 'aeon'), it('えのき', 'aeon'), it('豚こま切れ', 'aeon'), it('鮭', 'aeon'),
  it('絹ごし豆腐', 'aeon'), it('納豆', 'aeon'), it('牛乳', 'aeon'), it('卵', 'aeon', 'Mサイズ'), it('食パン', 'aeon'), it('醤油', 'aeon'),
  it('ツナ缶', 'aeon'), it('麦茶', 'aeon'), it('冷凍うどん', 'aeon'),
  it('柔軟剤', 'matsukiyo', 'つめかえ用'), it('歯ブラシ', 'matsukiyo'), it('ティッシュ', 'matsukiyo'), it('絆創膏', 'matsukiyo'),
  it('ケーブル', 'amazon', 'USB-C 1m'), it('乾電池', 'amazon'),
];

const scenarios = {
  '01-empty': { data: mk([]) },
  '02-list-max': { data: mk(twenty) },
  '03-list-min': { data: mk([it('牛乳', 'aeon')]) },
  '04-aisle-on': {
    data: (() => {
      const items = [it('えのき', 'aeon'), it('豚こま切れ', 'aeon'), it('絹ごし豆腐', 'aeon'), it('柔軟剤', 'matsukiyo', 'つめかえ用'), it('歯ブラシ', 'matsukiyo')];
      const b = { ...it('キャベツ', 'aeon'), boughtAt: new Date().toISOString(), boughtDate: today() };
      return mk(items, { bought: [b], settings: { aisleOrder: true, lastStoreId: 'aeon' } });
    })(),
  },
  '05-add-sheet': {
    data: mk([]),
    run: async (page) => {
      await page.click('[data-action="open-add"]');
      await page.click('[data-testid="store-pills"] >> text=イオン');
      for (const x of ['豆腐', '豚こま切れ', 'えのき']) { await page.fill('#add-input', x); await page.press('#add-input', 'Enter'); }
    },
  },
  '06-regular': {
    data: mk([], { regulars: [
      { id: 'r1', name: '牛乳', storeId: 'aeon', memo: '' }, { id: 'r2', name: 'トイレットペーパー', storeId: 'matsukiyo', memo: '12ロール' },
      { id: 'r3', name: 'コーヒー豆', storeId: 'amazon', memo: '' }, { id: 'r4', name: '食パン', storeId: 'aeon', memo: '6枚切り' },
      { id: 'r5', name: 'ヨーグルト', storeId: 'aeon', memo: '' }, { id: 'r6', name: 'シャンプーつめかえ', storeId: 'matsukiyo', memo: '' },
    ] }),
    run: (page) => page.click('.tab >> text=定期購入品'),
  },
  '07-mypage': { data: mk([it('牛乳', 'aeon')]), run: (page) => page.click('.tab >> text=マイページ') },
};

// 追加の確認用ショット（目視用）
scenarios['08-list-max-aisle'] = { data: { ...mk(twenty), settings: { aisleOrder: true, lastStoreId: 'aeon' } } };
scenarios['09-bought-sheet'] = { data: scenarios['04-aisle-on'].data, run: (page) => page.click('.done-bar') };
scenarios['10-list-max-scrolled'] = {
  data: mk(twenty), run: (page) => page.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight; }),
};

// 値段メモ: 値段あり・なし・前回のみ・両方・長い名前
const withPrice = (x, price) => ({ ...x, price });
const priceData = mk([
  withPrice(it('牛乳', 'aeon'), 198),
  it('卵', 'aeon', 'Mサイズ'),
  withPrice(it('絹ごし豆腐', 'aeon'), 1280),
  withPrice(it('とても長い名前のおいしいプレミアム国産きめ細かな絹ごし豆腐（大容量パック）', 'aeon', '冷蔵コーナーの奥'), 12800),
  it('食パン', 'aeon'),
  withPrice(it('柔軟剤', 'matsukiyo', 'つめかえ用'), 458),
  it('歯ブラシ', 'matsukiyo'),
], { priceBook: {
  [priceKey('aeon', '牛乳')]: 188, [priceKey('aeon', '食パン')]: 1280, [priceKey('aeon', '絹ごし豆腐')]: 98,
  [priceKey('aeon', 'とても長い名前のおいしいプレミアム国産きめ細かな絹ごし豆腐（大容量パック）')]: 1234567,
  [priceKey('matsukiyo', '歯ブラシ')]: 330,
} });
scenarios['11-price'] = { data: priceData };
scenarios['12-price-aisle-sheet'] = {
  data: { ...priceData, settings: { aisleOrder: true, lastStoreId: 'aeon' } },
  run: (page) => page.click('[data-action="open-add"]').then(async () => { await page.fill('#add-input', 'ヨーグルト'); await page.fill('#price-input', '１２８円'); }),
};
scenarios['13-price-edit-sheet'] = {
  data: priceData, run: (page) => page.locator('.row', { hasText: '牛乳' }).locator('.nm').click(),
};

for (const [name, sc] of Object.entries(scenarios)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'ja-JP' });
  const page = await ctx.newPage();
  await page.addInitScript((d) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('kaimono-list-v1', JSON.stringify(d)); localStorage.setItem('__seeded', '1'); } }, sc.data);
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  if (sc.run) await sc.run(page);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log('shot', name);
  await ctx.close();
}
await browser.close();
server.close();
