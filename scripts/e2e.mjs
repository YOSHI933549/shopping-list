import assert from 'node:assert/strict';
import { build, serve, launch } from './lib.mjs';

build();
const { server, url } = await serve();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ja-JP' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);

try {
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.getByText('リストは空っぽです').isVisible()); ok('空の状態');

  // 追加シート: Enter で連続追加（フォーカス維持）
  await page.click('[data-action="open-add"]');
  const input = page.locator('#add-input');
  await page.click('[data-testid="store-pills"] >> text=イオン');
  assert.equal(await input.getAttribute('placeholder'), 'イオンに入れる品'); ok('お店を選ぶとプレースホルダが変わる');
  for (const n of ['キャベツ', '豚こま切れ', '豆腐']) {
    await input.fill(n);
    await input.press('Enter');
    assert.equal(await input.inputValue(), '');
    assert.ok(await input.evaluate((el) => el === document.activeElement), 'focus kept');
  }
  assert.match(await page.locator('[data-testid="count"]').innerText(), /3品/); ok('Enter で3品追加・フォーカス維持・カウンタ3品');
  await input.press('Enter'); // 空は無視
  assert.match(await page.locator('[data-testid="count"]').innerText(), /3品/); ok('空入力は無視');
  assert.equal(await page.locator('.recent .rc').count(), 3);
  await page.click('[data-testid="store-pills"] >> text=マツキヨ');
  await page.click('[data-action="toggle-memo"]');
  await page.fill('#memo-input', 'つめかえ用');
  await input.fill('柔軟剤');
  await page.click('.add-b');
  assert.equal(await page.locator('.recent .rc').count(), 3);
  assert.match(await page.locator('[data-testid="count"]').innerText(), /4品/);
  await input.fill('ゴミ');
  await input.press('Enter');
  assert.match(await page.locator('[data-testid="count"]').innerText(), /5品/); ok('メモ付き追加・追加ボタン');
  // 取り消す（最新のゴミを取り消し）
  await page.locator('.recent .rc').first().locator('text=取り消す').click();
  assert.match(await page.locator('[data-testid="count"]').innerText(), /4品/);
  await page.click('.sh-head >> text=閉じる');
  assert.equal(await page.locator('.row').count(), 4);
  assert.equal(await page.locator('.row >> text=ゴミ').count(), 0); ok('取り消すで品が消える');
  assert.match(await page.locator('.card').first().innerText(), /イオン\s*3品/);
  assert.equal(await page.locator('.memo').innerText(), 'メモ：つめかえ用'); ok('お店カードとメモ表示');

  // 売り場順
  assert.equal(await page.locator('.aisle').count(), 0);
  await page.click('[data-action="aisle"]');
  const heads = await page.locator('.card').first().locator('.aisle').allInnerTexts();
  assert.deepEqual(heads, ['野菜・果物', '肉', '豆腐・納豆']);
  assert.deepEqual(await page.locator('.card').nth(1).locator('.aisle').allInnerTexts(), ['日用品・洗剤']); ok('売り場順 ON で見出しが歩く順に並ぶ');

  // お店フィルタ
  const pills = await page.locator('.pills .pill').allInnerTexts();
  assert.deepEqual(pills, ['すべて', 'イオン', 'マツキヨ']);
  await page.click('.pills >> text=マツキヨ');
  assert.equal(await page.locator('.card').count(), 1);
  assert.match(await page.locator('.card').innerText(), /柔軟剤/);
  await page.click('.pills >> text=すべて');
  assert.equal(await page.locator('.card').count(), 2); ok('店フィルタ');

  // チェック → 今日買ったもの
  assert.equal(await page.locator('.done-bar').count(), 0);
  await page.locator('.row', { hasText: 'キャベツ' }).locator('.ck').click();
  assert.ok(await page.locator('.row.done', { hasText: 'キャベツ' }).count() === 1); ok('チェックで取り消し線');
  await page.waitForSelector('.done-bar');
  assert.match(await page.locator('.done-bar').innerText(), /今日買ったもの\s*1件/);
  assert.equal(await page.locator('.row', { hasText: 'キャベツ' }).count(), 0); ok('リストから消え、緑のバーに1件');

  // 戻す
  await page.click('.done-bar');
  assert.match(await page.locator('.sheet').innerText(), /キャベツ/);
  await page.click('text=戻す');
  await page.waitForSelector('.done-bar', { state: 'detached' });
  assert.equal(await page.locator('.row', { hasText: 'キャベツ' }).count(), 1); ok('戻すでリストに復帰');

  // 空にしてお店カードが消える
  for (const n of ['豆腐']) {
    await page.locator('.row', { hasText: n }).locator('.ck').click();
    await page.waitForTimeout(800);
  }
  assert.equal(await page.locator('.row', { hasText: '豆腐' }).count(), 0);
  await page.locator('.row', { hasText: '柔軟剤' }).locator('.ck').click();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.card').count(), 1);
  assert.deepEqual(await page.locator('.pills .pill').allInnerTexts(), ['すべて', 'イオン']); ok('空のお店はカード・ピルから消える');
  assert.match(await page.locator('.done-bar').innerText(), /2件|3件/);
  const boughtLabel = await page.locator('.done-bar').innerText();

  // リロードで永続
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.aisle').count() > 0, true, 'aisle persisted');
  assert.equal(await page.locator('.sw.on').count(), 1);
  assert.equal(await page.locator('.row').count(), 2);
  assert.equal(await page.locator('.done-bar').innerText(), boughtLabel); ok('リロード後も品・売り場順・購入済みが残る');

  // 定期購入品
  await page.click('.tab >> text=定期購入品');
  await page.fill('[data-form="regular"] [name="name"]', '牛乳');
  await page.selectOption('[data-form="regular"] [name="store"]', { label: 'イオン' });
  await page.click('[data-form="regular"] button[type="submit"]');
  await page.click('[data-action="reg-to-list"]');
  assert.match(await page.locator('.toast').innerText(), /リストに入れました/);
  await page.click('[data-action="reg-to-list"]');
  assert.match(await page.locator('.toast').innerText(), /もうリストにあります/); ok('定期購入品→リストへ（重複メッセージ）');

  // マイページ: お店追加・削除（品は未設定へ）
  await page.click('.tab >> text=マイページ');
  await page.fill('[data-form="store"] [name="name"]', 'ドラッグX');
  await page.click('[data-form="store"] button[type="submit"]');
  assert.equal(await page.locator('[data-testid="store-list"] .brow').count(), 5);
  await page.locator('[data-store-row] >> text=未設定').locator('xpath=..').locator('button').count().then((c) => assert.equal(c, 0));
  await page.locator('[data-store-row]', { hasText: 'イオン' }).locator('text=削除').click();
  await page.click('.tab >> text=買い物リスト');
  assert.match(await page.locator('.card').first().innerText(), /未設定/); ok('お店の追加・削除で品が未設定に移る');

  // エクスポート/インポート
  await page.click('.tab >> text=マイページ');
  await page.click('[data-action="export-show"]');
  const json = await page.inputValue('#export-text');
  assert.equal(JSON.parse(json).version, 1);
  await page.fill('#import-text', '{broken');
  await page.click('[data-action="import-run"]');
  assert.match(await page.locator('.toast').innerText(), /取り込めません/);
  await page.evaluate(() => localStorage.clear());
  await page.fill('#import-text', json);
  await page.click('[data-action="import-run"]');
  await page.click('.tab >> text=買い物リスト');
  assert.ok(await page.locator('.row').count() >= 2); ok('書き出し・不正データ拒否・取り込み');

  // 壊れた保存データ
  await page.evaluate(() => localStorage.setItem('kaimono-list-v1', '{oops'));
  await page.reload();
  assert.ok(await page.getByText('リストは空っぽです').isVisible()); ok('壊れた保存データでも起動する');

  assert.deepEqual(errors, [], 'console errors: ' + errors.join('\n'));
  console.log(`E2E OK (${step} steps)`);
} catch (e) {
  console.error('E2E FAILED:', e.message);
  await page.screenshot({ path: '/tmp/e2e-fail.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
