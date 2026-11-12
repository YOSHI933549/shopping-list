import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, serve, launch } from './lib.mjs';
import { scoreReceiptLines } from '../src/ocr/score.js';

build();
const { server, url } = await serve();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ja-JP' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  // 整数版の日本語データには無い旧パラメータを、Tesseract が起動時に探す。読み取りには影響しない。
  if (text.startsWith('Warning: Parameter not found:')) return;
  errors.push(text);
});
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

  // 値段メモ
  const addWithPrice = async (store, name, price) => {
    await page.click('[data-action="open-add"]');
    await page.click(`[data-testid="store-pills"] >> text=${store}`);
    await page.fill('#add-input', name);
    await page.fill('#price-input', price);
    await page.click('.add-b');
  };
  await page.click('.tab >> text=買い物リスト');
  await addWithPrice('マツキヨ', 'お茶', 'abc');
  assert.match(await page.locator('.toast').innerText(), /値段は0以上/);
  assert.equal(await page.locator('#add-input').inputValue(), 'お茶'); ok('不正な値段は追加されず入力が残る');
  await page.fill('#price-input', '¥１,２８０円');
  assert.equal(await page.locator('#price-input').getAttribute('inputmode'), 'numeric');
  await page.click('.add-b');
  assert.equal(await page.locator('#price-input').inputValue(), '');
  await page.fill('#add-input', 'とても長い名前のおいしいプレミアム国産きめ細かな絹ごし豆腐（大容量パック）');
  await page.fill('#price-input', '98');
  await page.click('.add-b');
  await page.click('.sh-head >> text=閉じる');
  const rowOf = (n) => page.locator('.row', { hasText: n });
  assert.equal(await rowOf('お茶').locator('.cur').innerText(), '1,280円');
  assert.equal(await rowOf('お茶').locator('.prev').count(), 0);
  assert.equal(await rowOf('お茶').locator('.last').count(), 0);
  assert.equal(await rowOf('プレミアム').locator('.cur').innerText(), '98円'); ok('値段入力→リストに「1,280円」「98円」表示（前回はまだ無し）');
  const box = await rowOf('プレミアム').boundingBox();
  const ckBox = await rowOf('プレミアム').locator('.ck').boundingBox();
  const priceBox = await rowOf('プレミアム').locator('.price').boundingBox();
  assert.ok(priceBox.x + priceBox.width <= ckBox.x && priceBox.y + priceBox.height <= box.y + box.height); ok('長い商品名＋値段でも行内に収まる');

  await rowOf('お茶').locator('.ck').click();
  await page.waitForTimeout(800);
  assert.equal(await rowOf('お茶').count(), 0); ok('値段付きの品を購入');
  await page.reload();
  await addWithPrice('マツキヨ', 'お茶', '');
  await page.click('.sh-head >> text=閉じる');
  assert.equal(await rowOf('お茶').locator('.prev').innerText(), '前回1,280円');
  assert.match(await rowOf('お茶').locator('.last').innerText(), /^前回 \d{1,2}\/\d{1,2}（今日）$/);
  assert.equal(await rowOf('お茶').locator('.cur').count(), 0); ok('再追加で「前回1,280円」と前回の日付');
  await page.click('[data-action="open-add"]');
  await page.click('[data-testid="store-pills"] >> text=Amazon');
  await page.fill('#add-input', 'お茶');
  await page.click('.add-b');
  await page.click('.sh-head >> text=閉じる');
  assert.equal(await page.locator('.card', { hasText: 'Amazon' }).locator('.prev').count(), 0);
  assert.equal(await page.locator('.card', { hasText: 'Amazon' }).locator('.last').count(), 0); ok('別のお店の同名商品には前回値段も前回日も出ない');
  const teaRowM = page.locator('.card', { hasText: 'マツキヨ' }).locator('.row', { hasText: 'お茶' });
  await teaRowM.locator('.nm').click();
  await page.fill('#edit-price', '１５０');
  await page.click('[data-action="save-edit"]');
  assert.equal(await teaRowM.locator('.cur').innerText(), '150円'); ok('行をタップして値段を編集');
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  const teaRow = page.locator('.card', { hasText: 'マツキヨ' }).locator('.row', { hasText: 'お茶' });
  assert.equal(await teaRow.locator('.cur').innerText(), '150円');
  assert.equal(await teaRow.locator('.prev').innerText(), '前回1,280円'); ok('リロード後も値段と前回値段が残る');

  // 旧データ（priceBook なし）を読み込んでも消えない
  await page.evaluate(() => localStorage.setItem('kaimono-list-v1', JSON.stringify({ version: 1, stores: [{ id: 'aeon', name: 'イオン' }, { id: 'unset', name: '未設定' }], items: [{ id: 'o1', name: '旧データの牛乳', storeId: 'aeon', memo: '', addedAt: '2026-10-30T00:00:00.000Z' }], bought: [], regulars: [], settings: { aisleOrder: false, lastStoreId: 'aeon' } })));
  await page.reload();
  assert.equal(await page.locator('.row', { hasText: '旧データの牛乳' }).count(), 1);
  assert.equal(await page.locator('.price').count(), 0); ok('旧データ(priceBookなし)を読み込んでも品が残る');

  // 壊れた保存データは消さず退避し、知らせを出す
  await page.evaluate(() => localStorage.setItem('kaimono-list-v1', '{oops'));
  await page.reload();
  assert.ok(await page.getByText('リストは空っぽです').isVisible());
  assert.match(await page.locator('[data-testid="load-note"]').innerText(), /保存データを読めませんでした/);
  assert.equal(await page.evaluate(() => localStorage.getItem('kaimono-list-v1')), '{oops');
  const quarantined = await page.evaluate(() => localStorage.getItem('kaimono-list-v1-unreadable'));
  assert.match(quarantined, /\{oops/); ok('壊れた保存データは控えを残して知らせ、元のキーは上書きしない');
  await page.click('[data-action="ack-load"]');
  const replaced = await page.evaluate(() => localStorage.getItem('kaimono-list-v1'));
  assert.notEqual(replaced, '{oops');
  assert.equal(JSON.parse(replaced).version, 1);
  assert.match(await page.evaluate(() => localStorage.getItem('kaimono-list-v1-unreadable')), /\{oops/);
  assert.equal(await page.locator('[data-testid="load-note"]').count(), 0); ok('確認したあとだけ空のリストを保存し、控えは残る');

  // レシート: 貼る → 確認 → 1行直す → 保存 → 履歴 → リストから消える → 再読み込み
  await page.click('[data-action="open-add"]');
  await page.click('[data-testid="store-pills"] >> text=イオン');
  await page.fill('#add-input', '牛乳');
  await page.click('.add-b');
  await page.fill('#add-input', '食パン');
  await page.click('.add-b');
  await page.click('.sh-head >> text=閉じる');
  assert.equal(await page.locator('.row').count(), 2); ok('レシート用に牛乳と食パンを入れる');

  await page.click('[data-action="open-receipt"]');
  await page.fill('#receipt-text', ['イオン', '牛乳 198', 'タマゴ 258', '会員番号 1234-5678-9012', '合計 456'].join('\n'));
  await page.click('[data-action="receipt-read"]');
  await page.waitForSelector('[data-testid="receipt-rows"]');
  assert.equal(await page.locator('.rraw', { hasText: '牛乳 198' }).count(), 1);
  assert.equal(await page.locator('.rraw', { hasText: 'タマゴ 258' }).count(), 1); ok('確認画面に明細の行が出る');

  await page.evaluate(() => document.documentElement.style.setProperty('--kb', '280px'));
  const sheetBox = await page.locator('.sheet').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(Math.abs(sheetBox.y + sheetBox.height - (viewport.height - 280)) < 3, `sheet bottom ${sheetBox.y + sheetBox.height}`);
  const saveBox = await page.locator('[data-action="receipt-save"]').boundingBox();
  assert.ok(saveBox.y >= sheetBox.y && saveBox.y + saveBox.height <= sheetBox.y + sheetBox.height + 1); ok('キーボードの高さだけシートが上がり、保存ボタンがシート内に残る');
  await page.evaluate(() => document.documentElement.style.setProperty('--kb', '0px'));

  await page.locator('.rname').nth(1).fill('卵');
  await page.click('[data-action="receipt-save"]');
  assert.equal(await page.locator('.sheet').count(), 0);
  assert.equal(await page.locator('.row', { hasText: '牛乳' }).count(), 0);
  assert.equal(await page.locator('.row', { hasText: '食パン' }).count(), 1);
  assert.equal(await page.locator('[data-testid="export-nudge"]').count(), 0); ok('1行直して保存すると牛乳がリストから消え、書き出しの促しは出ない');

  const readHist = () => page.evaluate(() => JSON.parse(localStorage.getItem('kaimono-history-v1')));
  const hist = await readHist();
  assert.equal(hist.receipts.length, 1);
  assert.equal(hist.receipts[0].source, 'receipt');
  assert.equal(hist.receipts[0].storeId, 'aeon');
  assert.ok(hist.lines.some((l) => l.source === 'receipt' && l.name === '牛乳'));
  assert.ok(hist.lines.some((l) => l.source === 'receipt' && l.name === '卵'));
  assert.equal(JSON.stringify(hist).includes('1234-5678-9012'), false); ok('履歴にレシートと直した品名が入り、会員番号は残らない');

  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.row', { hasText: '牛乳' }).count(), 0);
  assert.equal(await page.locator('.row', { hasText: '食パン' }).count(), 1);
  const hist2 = await readHist();
  assert.equal(hist2.receipts.length, 1);
  assert.ok(hist2.lines.some((l) => l.name === '卵' && l.source === 'receipt')); ok('再読み込み後も履歴とリストの状態が残る');

  await page.click('[data-action="open-receipt"]');
  await page.fill('#receipt-text', 'パン 200\n卵 300\n合計 460');
  await page.click('[data-action="receipt-read"]');
  assert.equal(await page.locator('[data-testid="receipt-note"]').innerText(), '合計と40円ずれています');
  const noteColor = await page.locator('[data-testid="receipt-note"]').evaluate((el) => getComputedStyle(el).color);
  const sumColor = await page.locator('[data-testid="receipt-sum"]').evaluate((el) => getComputedStyle(el).color);
  assert.equal(noteColor, sumColor);
  assert.equal(await page.locator('[data-action="receipt-save"]').isEnabled(), true); ok('合計が40円ずれていても色を変えずに表示し、保存できる');
  await page.click('[data-action="receipt-save"]');
  const hist3 = await readHist();
  assert.equal(hist3.receipts.length, 2);
  assert.equal(await page.locator('.row', { hasText: '食パン' }).count(), 1); ok('ずれていても保存でき、リストの食パンは残る');

  // 撮って読む: 写真を選ぶまで学習データは取らない。画像でないファイルは失敗から戻れる。
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.click('[data-action="open-receipt"]');
  const photo = page.locator('#receipt-photo');
  assert.equal(await photo.getAttribute('accept'), 'image/*');
  assert.equal(await photo.getAttribute('capture'), 'environment');
  assert.equal(await page.getByRole('button', { name: '撮って読む' }).isVisible(), true);
  assert.equal(requests.some((u) => u.includes('/ocr/') || u.includes('jsdelivr') || u.includes('tessdata')), false);
  ok('撮って読むはカメラ入力で、開いただけでは学習データを読まない');

  await photo.setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await page.waitForFunction(() => document.querySelector('[data-testid="receipt-scan-status"]')?.textContent === '画像を読めませんでした');
  assert.equal(await page.getByRole('button', { name: 'もう一度撮る' }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '文字を貼る' }).isVisible(), true);
  ok('画像でないファイルは失敗し、もう一度撮ると文字を貼るに戻れる');
  await page.getByRole('button', { name: '文字を貼る' }).click();
  assert.equal(await page.locator('[data-testid="receipt-scan"]').isHidden(), true);
  assert.equal(await page.locator('#receipt-text').evaluate((el) => el === document.activeElement), true);
  ok('文字を貼るで貼る欄に戻る');

  const historyBefore = await page.evaluate(() => localStorage.getItem('kaimono-history-v1'));
  const listBefore = await page.evaluate(() => localStorage.getItem('kaimono-list-v1'));
  await page.evaluate(() => {
    const proto = HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    Object.defineProperty(proto, 'value', {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) {
        if (this.id === 'receipt-text') window.__scanText = v;
        desc.set.call(this, v);
      },
    });
  });
  const sample = path.join(path.dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/sample-receipt.png');
  await photo.setInputFiles(sample);
  await page.waitForSelector('[data-testid="receipt-rows"]', { timeout: 180000 });
  const scanned = await page.evaluate(() => window.__scanText || '');
  const scored = scoreReceiptLines(scanned);
  console.log(`  OCR ${scored.correct}/${scored.total}`);
  console.log(scanned);
  assert.equal(await page.locator('.rname', { hasText: '牛乳' }).count(), 1);
  assert.equal(await page.locator('.rname', { hasText: '卵' }).count(), 1);
  assert.equal(await page.locator('.rname', { hasText: '食パン' }).count(), 1);
  assert.match(await page.locator('[data-testid="receipt-sum"]').innerText(), /584/);
  ok('作り例の写真を撮って読むと、確認画面に牛乳・卵・食パンが出る');
  assert.equal(await page.evaluate(() => localStorage.getItem('kaimono-history-v1')), historyBefore);
  assert.equal(await page.evaluate(() => localStorage.getItem('kaimono-list-v1')), listBefore);
  assert.equal(await page.locator('.row', { hasText: '食パン' }).count(), 1);
  const outside = requests.filter((u) => !u.startsWith(url) && !u.startsWith('blob:') && !u.startsWith('data:'));
  console.log(requests.filter((u) => u.includes('/ocr/')).map((u) => u.replace(url, '/')).join('\n'));
  assert.deepEqual(outside, [], `外への通信: ${outside.join('\n')}`);
  assert.equal(requests.some((u) => u.includes('/ocr/lang/jpn.traineddata.gz')), true);
  assert.equal(requests.some((u) => u.includes('/ocr/worker.min.js')), true);
  ok('読み取りは同じサイトの日本語データだけで、履歴とリストは書き換わらない');

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
