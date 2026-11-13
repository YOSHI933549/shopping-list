import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build, serve, launch, root } from './lib.mjs';
import { countMatchingLines } from '../src/lib/receiptScan.js';

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

  await page.click('[data-action="open-add"]');
  await page.fill('#add-input', '牛乳');
  assert.equal(await page.locator('#suggests .cand').count(), 0);
  await page.click('.sh-head >> text=閉じる'); ok('履歴が無いときは候補を出さない');

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

  // 直した品名を覚え、次のレシートでは同じ店だけ自動で当たる
  await page.click('.tab >> text=買い物リスト');
  await page.click('[data-action="open-add"]');
  await page.click('[data-testid="store-pills"] >> text=マツキヨ');
  await page.fill('#add-input', '牛乳');
  await page.click('.add-b');
  await page.click('.sh-head >> text=閉じる');
  ok('別名の確認用に、マツキヨへ牛乳を入れる');

  await page.click('[data-action="open-receipt"]');
  await page.fill('#receipt-text', ['マツキヨ', 'ｷﾞｭｳﾆｭｳ1L 198', '合計 198'].join('\n'));
  await page.click('[data-action="receipt-read"]');
  await page.locator('[data-testid="receipt-stores"]').getByRole('button', { name: 'マツキヨ', exact: true }).click();
  const milk = page.locator('.rrow', { hasText: 'ｷﾞｭｳﾆｭｳ1L' });
  assert.equal(await milk.locator('.rname').inputValue(), '');
  assert.equal(await milk.locator('.rname').getAttribute('placeholder'), '（えらぶ）');
  assert.equal(await milk.locator('.rsize').innerText(), '1000ml');
  await milk.locator('.cand').filter({ hasText: /^牛乳$/ }).click();
  assert.equal(await milk.locator('.rname').inputValue(), '牛乳');
  ok('初めての表記は（えらぶ）で、候補の牛乳を選ぶと入る');

  await page.click('[data-action="receipt-save"]');
  assert.equal(await page.locator('.card', { hasText: 'マツキヨ' }).locator('.row', { hasText: '牛乳' }).count(), 0);
  const learned = await readHist();
  const milkGoods = learned.goods.find((g) => g.aliases.some((a) => a.storeId === 'matsukiyo' && a.notation === 'ぎゅうにゅう1l'));
  assert.equal(milkGoods.name, '牛乳');
  ok('保存すると、マツキヨのその表記を牛乳の別名として覚える');

  await page.click('[data-action="open-add"]');
  await page.click('[data-testid="store-pills"] >> text=Amazon');
  await page.fill('#add-input', 'お茶');
  await page.click('.add-b');
  await page.click('.sh-head >> text=閉じる');

  await page.click('[data-action="open-receipt"]');
  await page.fill('#receipt-text', ['マツキヨ', 'ｷﾞｭｳﾆｭｳ1L 180', '合計 180'].join('\n'));
  await page.click('[data-action="receipt-read"]');
  const milk2 = page.locator('.rrow', { hasText: 'ｷﾞｭｳﾆｭｳ1L' });
  assert.equal(await milk2.locator('.rname').inputValue(), '牛乳');
  ok('同じ店の同じ表記は、次のレシートで牛乳が自動で入る');

  await page.locator('[data-testid="receipt-stores"]').getByRole('button', { name: 'Amazon', exact: true }).click();
  assert.equal(await milk2.locator('.rname').inputValue(), '');
  assert.equal(await milk2.locator('.rname').getAttribute('placeholder'), '（えらぶ）');
  assert.equal(await milk2.locator('.cand.on').count(), 0);
  assert.equal(await milk2.locator('.cand').filter({ hasText: /^お茶$/ }).count(), 1);
  ok('別の店では、覚えた別名を自動では入れない');
  await page.click('.sh-head >> text=閉じる');

  // 撮って読む: 作り例の画像を端末内で読み、確認画面へ流す
  const sampleLines = fs.readFileSync(path.join(root, 'tests/fixtures/sample-receipt.txt'), 'utf8').trim().split('\n');
  await page.evaluate(() => {
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get.call(this); },
      set(v) {
        if (this.id === 'receipt-text') window.__scanText = String(v);
        desc.set.call(this, v);
      },
    });
  });
  await page.click('[data-action="open-receipt"]');
  const camera = page.locator('#receipt-camera');
  assert.equal(await camera.getAttribute('accept'), 'image/*');
  assert.equal(await camera.getAttribute('capture'), 'environment');
  const photo = page.locator('#receipt-photo');
  assert.equal(await photo.getAttribute('accept'), 'image/*');
  assert.equal(await photo.getAttribute('capture'), null); ok('撮って読むはカメラ、写真から選ぶは画像ファイル');

  await camera.setInputFiles({ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('これは画像ではありません') });
  await page.waitForSelector('[data-testid="scan-failed"]');
  assert.equal(await page.locator('[data-action="receipt-scan-again"]').innerText(), 'もう一度撮る');
  await page.click('[data-action="receipt-scan-paste"]');
  await page.waitForSelector('[data-testid="scan-failed"]', { state: 'detached' });
  assert.equal(await page.locator('#receipt-text').count(), 1); ok('画像でないファイルは失敗し、文字を貼るに戻れる');

  const leaks = [];
  const onReq = (req) => {
    let host = '';
    try { host = new URL(req.url()).hostname; } catch { host = req.url(); }
    if (host && host !== '127.0.0.1') leaks.push(req.url());
  };
  page.on('request', onReq);
  const sawProgress = page.waitForSelector('[data-testid="scan-progress"]');
  await camera.setInputFiles(path.join(root, 'tests/fixtures/sample-receipt.png'));
  await sawProgress;
  await page.waitForSelector('[data-testid="receipt-rows"]', { timeout: 180000 });
  page.off('request', onReq);
  assert.deepEqual(leaks, [], '外部へ送信している: ' + leaks.join('\n'));
  const scanText = await page.evaluate(() => window.__scanText || '');
  const score = countMatchingLines(scanText, sampleLines);
  console.log(`  OCR ${score.matched}/${score.total}`);
  console.log(scanText.replace(/\n/g, '\\n'));
  assert.ok(await page.locator('.rrow').count() >= 1);
  assert.equal(await page.locator('.rraw', { hasText: '牛乳' }).count(), 1);
  assert.equal(await page.locator('.rraw', { hasText: '卵' }).count(), 1); ok('作り例の画像を撮って読むと確認画面に明細が出る');
  await page.click('.sh-head >> text=閉じる');
  const hist4 = await readHist();
  assert.equal(hist4.receipts.length, 3);
  assert.equal(await page.locator('.row', { hasText: '食パン' }).count(), 1); ok('読み取りだけでは履歴を増やさず、リストも上書きしない');

  await page.click('[data-action="open-add"]');
  await page.fill('#add-input', 'ぎゅう');
  const suggest = page.locator('#suggests .cand');
  await suggest.first().waitFor();
  assert.equal(await suggest.count(), 1);
  assert.equal((await suggest.innerText()).trim(), '牛乳');
  await suggest.click();
  assert.equal(await page.locator('#add-input').inputValue(), '牛乳');
  assert.equal(await page.locator('#suggests .cand').count(), 0);
  await page.fill('#add-input', '候補を使わない品');
  assert.equal(await page.locator('#suggests .cand').count(), 0);
  await page.press('#add-input', 'Enter');
  assert.equal(await page.locator('.recent', { hasText: '候補を使わない品' }).count(), 1); ok('候補を押すとまとめ後の名前が入り、使わずに別の品も入れられる');

  // 購入履歴を見る（削除はマイページの短い一覧のまま）
  await page.click('.sh-head >> text=閉じる');
  await page.click('.tab >> text=マイページ');
  await page.locator('[data-testid="open-history"]').scrollIntoViewIfNeeded();
  await page.click('[data-testid="open-history"]');
  await page.waitForSelector('[data-testid="purchase-view"]');
  assert.ok(await page.locator('[data-testid="purchase-day"]').count() >= 1);
  assert.match(await page.locator('[data-testid="history-summary"]').innerText(), /すべてのお店/);
  assert.match(await page.locator('[data-testid="history-summary"]').innerText(), /合計/);
  assert.match(await page.locator('[data-testid="purchase-day"]').first().innerText(), /合計/);
  assert.equal(await page.locator('[data-testid="purchase-view"] [data-action="delete-history"]').count(), 0);
  assert.ok(await page.locator('[data-testid="purchase-row"]', { hasText: '牛乳' }).count() >= 1);
  assert.ok(await page.locator('[data-testid="purchase-row"]', { hasText: '豆腐' }).count() >= 1); ok('購入履歴は日付ごとに開き、削除ボタンは出さない');

  await page.locator('[data-testid="history-stores"]').getByRole('button', { name: 'マツキヨ', exact: true }).click();
  assert.match(await page.locator('[data-testid="history-condition"]').innerText(), /マツキヨ/);
  assert.equal(await page.locator('[data-testid="purchase-row"]', { hasText: '豆腐' }).count(), 0);
  assert.ok(await page.locator('[data-testid="purchase-row"]', { hasText: '柔軟剤' }).count() >= 1); ok('お店で絞ると、その店の品と合計だけになる');

  await page.locator('[data-testid="history-stores"]').getByRole('button', { name: 'すべて', exact: true }).click();
  await page.fill('#history-query', '卵');
  assert.equal(await page.locator('[data-testid="purchase-row"]').count(), 2);
  assert.match(await page.locator('[data-testid="history-condition"]').innerText(), /「卵」/);
  assert.equal((await page.locator('[data-testid="purchase-prev"]').innerText()).replace(/\s/g, ''), '前回¥258');
  await page.fill('#history-query', 'ギュウニュウ');
  assert.ok(await page.locator('[data-testid="purchase-row"]').count() >= 1);
  const kanaNames = await page.locator('[data-testid="purchase-row"] .hname').allInnerTexts();
  assert.ok(kanaNames.length >= 1 && kanaNames.every((name) => name.trim() === '牛乳')); ok('品名で絞ると前回の値段が出て、カナのゆれでも当たる');

  await page.fill('#history-query', 'ない品');
  await page.waitForSelector('[data-testid="history-reset"]');
  assert.match(await page.locator('[data-testid="history-summary"]').innerText(), /合計 ¥0/);
  await page.click('[data-testid="history-reset"]');
  assert.equal(await page.locator('#history-query').inputValue(), '');
  assert.ok(await page.locator('[data-testid="purchase-row"]', { hasText: '牛乳' }).count() >= 1);
  await page.locator('[data-testid="history-period"]').getByRole('button', { name: '先月', exact: true }).click();
  await page.waitForSelector('[data-testid="history-reset"]');
  assert.match(await page.locator('[data-testid="history-condition"]').innerText(), /^先月/);
  await page.click('[data-testid="history-reset"]');
  assert.match(await page.locator('[data-testid="history-condition"]').innerText(), /すべてのお店/); ok('絞って0件のときは条件を外すと戻る');

  await page.locator('[data-testid="purchase-row"]', { hasText: '卵' }).first().click();
  await page.waitForSelector('[data-testid="purchase-stats"]');
  assert.equal((await page.locator('[data-testid="purchase-stats"]').innerText()).replace(/\s+/g, ''), '最安¥258（イオン）・平均¥279');
  assert.equal(await page.locator('[data-testid="purchase-past"]').count(), 2);
  assert.match(await page.locator('[data-testid="purchase-past"]').first().innerText(), /¥300|¥258/);
  assert.equal(await page.locator('[data-testid="purchase-item"], [data-testid="purchase-view"]').locator('[data-action="delete-history"]').count(), 0);
  await page.click('[data-action="close-history"]');
  assert.equal(await page.locator('#history-query').count(), 1);
  await page.click('[data-action="close-history"]');
  assert.ok(await page.locator('[data-testid="history-list"] [data-action="delete-history"]').count() >= 1); ok('品名を開くと最安・平均と過去の値段が出て、マイページの削除は残る');

  await page.click('.tab >> text=買い物リスト');

  // 削除: 品を1件（2回押し・元に戻す）→ チェック済み → リスト全部 → 購入履歴
  const victim = '候補を使わない品';
  const victimRow = () => page.locator('.row', { hasText: victim });
  const delBtn = () => victimRow().locator('[data-action="delete-item"]');
  await delBtn().click();
  assert.equal(await victimRow().count(), 1);
  assert.equal((await delBtn().innerText()).trim(), '消す？');
  await page.click('h1');
  assert.equal((await delBtn().innerText()).trim(), '消す');
  const delBox = await delBtn().boundingBox();
  const checkBox = await victimRow().locator('.ck').boundingBox();
  assert.ok(delBox.x + delBox.width <= checkBox.x - 4, '消すボタンがチェックに重ならない');
  await delBtn().click();
  await delBtn().click();
  assert.equal(await victimRow().count(), 0);
  assert.equal(await page.locator('[data-testid="undo-bar"] button').count(), 1);
  await page.click('[data-action="undo-delete"]');
  assert.equal(await page.locator('[data-testid="undo-bar"] button').count(), 0);
  assert.equal(await victimRow().count(), 1); ok('品の削除は2回押しで、元に戻すと残る');

  await delBtn().click();
  await delBtn().click();
  assert.equal(await victimRow().count(), 0);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.row', { hasText: victim }).count(), 0);
  assert.equal(await page.locator('.row', { hasText: '食パン' }).count(), 1); ok('消した品は再読み込み後も戻らない');

  const readList = () => page.evaluate(() => JSON.parse(localStorage.getItem('kaimono-list-v1')));
  const beforeWipe = await readHist();
  const goodsBefore = beforeWipe.goods;
  const linesBefore = beforeWipe.lines.length;
  assert.ok(linesBefore > 1);
  assert.ok(goodsBefore.some((g) => (g.aliases || []).some((a) => a.notation === 'ぎゅうにゅう1l')));
  assert.equal(await page.locator('.done-bar').count(), 1);
  await page.click('[data-testid="clear-checked"]');
  assert.match(await page.locator('[data-testid="confirm-clear-checked"]').innerText(), /今日チェックした \d+件/);
  await page.click('[data-testid="confirm-clear-checked"] [data-action="confirm-cancel"]');
  assert.equal(await page.locator('.done-bar').count(), 1);
  await page.click('[data-testid="clear-checked"]');
  await page.click('[data-testid="confirm-clear-checked"] [data-action="confirm-ok"]');
  assert.equal(await page.locator('.done-bar').count(), 0);
  assert.equal(await page.locator('.row', { hasText: '食パン' }).count(), 1);
  const afterChecked = await readHist();
  assert.equal(afterChecked.lines.length, linesBefore);
  assert.deepEqual(afterChecked.goods, goodsBefore); ok('チェック済みは件数を確認して消し、購入履歴と品名のまとめは残る');

  const rowsBeforeClear = await page.locator('.row').count();
  assert.ok(rowsBeforeClear >= 1);
  const regularsBefore = (await readList()).regulars;
  await page.click('[data-testid="clear-list"]');
  assert.match(await page.locator('[data-testid="confirm-clear-list"]').innerText(), new RegExp(`リストの ${rowsBeforeClear}件`));
  await page.click('[data-testid="confirm-clear-list"] [data-action="confirm-cancel"]');
  assert.equal(await page.locator('.row').count(), rowsBeforeClear);
  await page.click('[data-testid="clear-list"]');
  await page.click('[data-testid="confirm-clear-list"] [data-action="confirm-ok"]');
  assert.ok(await page.getByText('リストは空っぽです').isVisible());
  assert.equal(await page.locator('[data-testid="clear-list"]').isDisabled(), true);
  const afterList = await readList();
  assert.equal(afterList.items.length, 0);
  assert.deepEqual(afterList.regulars, regularsBefore);
  const histAfterList = await readHist();
  assert.equal(histAfterList.lines.length, linesBefore);
  assert.deepEqual(histAfterList.goods, goodsBefore); ok('リストを空にする前に確認し、履歴と定期購入品は残る');

  await page.click('.tab >> text=マイページ');
  await page.locator('#history-sec').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-testid="history-list"] [data-action="delete-history"]').count(), linesBefore);
  const firstName = (await page.locator('[data-testid="history-list"] .nm').first().innerText()).split('\n')[0];
  await page.locator('[data-testid="history-list"] [data-action="delete-history"]').first().click();
  const oneDlg = page.locator('[data-testid="confirm-history-one"]');
  assert.match(await oneDlg.innerText(), new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(await oneDlg.innerText(), /品名のまとめは残ります/);
  await page.click('[data-testid="confirm-history-one"] [data-action="confirm-cancel"]');
  assert.equal(await page.locator('[data-testid="history-list"] [data-action="delete-history"]').count(), linesBefore);
  await page.locator('[data-testid="history-list"] [data-action="delete-history"]').first().click();
  await page.click('[data-testid="confirm-history-one"] [data-action="confirm-ok"]');
  assert.equal(await page.locator('[data-testid="history-list"] [data-action="delete-history"]').count(), linesBefore - 1);
  const afterOne = await readHist();
  assert.equal(afterOne.lines.length, linesBefore - 1);
  assert.deepEqual(afterOne.goods, goodsBefore); ok('購入履歴を1件消し、品名のまとめは残る');

  const left = linesBefore - 1;
  await page.click('[data-testid="clear-history"]');
  const allDlg = page.locator('[data-testid="confirm-history-all"]');
  assert.match(await allDlg.innerText(), new RegExp(`購入履歴 ${left}件`));
  assert.match(await allDlg.locator('[data-action="confirm-ok"]').getAttribute('class'), /danger/);
  await page.click('[data-testid="confirm-history-all"] [data-action="confirm-cancel"]');
  assert.equal(await page.locator('[data-testid="history-list"] [data-action="delete-history"]').count(), left);
  await page.click('[data-testid="clear-history"]');
  await page.click('[data-testid="confirm-history-all"] [data-action="confirm-ok"]');
  assert.equal(await page.locator('[data-testid="history-list"]').count(), 0);
  assert.match(await page.locator('#history-sec').innerText(), /まだありません/);
  const clearedHist = await readHist();
  assert.equal(clearedHist.lines.length, 0);
  assert.equal(clearedHist.receipts.length, 0);
  assert.deepEqual(clearedHist.goods, goodsBefore);
  const book = await page.evaluate(() => JSON.parse(localStorage.getItem('kaimono-list-v1')).priceBook);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.click('.tab >> text=マイページ');
  assert.match(await page.locator('#history-sec').innerText(), /まだありません/);
  const stayed = await readHist();
  assert.equal(stayed.lines.length, 0);
  assert.equal(stayed.receipts.length, 0);
  assert.deepEqual(stayed.goods, goodsBefore);
  const book2 = await page.evaluate(() => JSON.parse(localStorage.getItem('kaimono-list-v1')).priceBook);
  assert.deepEqual(book2, book); ok('購入履歴をすべて消しても、再読み込み後に別名と値段メモは残る');

  await page.locator('[data-testid="open-history"]').scrollIntoViewIfNeeded();
  await page.click('[data-testid="open-history"]');
  const emptyHist = page.locator('[data-testid="history-empty"]');
  assert.match(await emptyHist.innerText(), /まだありません/);
  assert.match(await emptyHist.innerText(), /丸を押すと/);
  assert.equal(await page.locator('[data-testid="history-reset"]').count(), 0);
  assert.equal(await page.locator('[data-action="delete-history"]').count(), 0);
  await page.click('[data-action="close-history"]');
  assert.match(await page.locator('#history-sec').innerText(), /まだありません/); ok('履歴が無い画面は使い方だけを出し、条件を外すは出さない');

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
