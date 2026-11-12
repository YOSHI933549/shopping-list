import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareImageData, resizeRGBA, stretchContrast, targetSize, toGray } from '../src/ocr/imagePrep.js';
import { scanFailureMessage, scanProgressLabel } from '../src/ocr/messages.js';
import { SAMPLE_RECEIPT_LINES, scoreReceiptLines } from '../src/ocr/score.js';
import { ocrFiles } from '../scripts/ocr-assets.mjs';
import { pasteSheetHtml } from '../src/ui/receipt.js';

describe('レシート写真の前処理', () => {
  it('長辺が上限を超えるときだけ縮小する', () => {
    expect(targetSize(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
    expect(targetSize(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(targetSize(0, 10, 2000)).toEqual({ width: 1, height: 1 });
  });

  it('同じ色の画像は縮小してもその色のまま', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 255,
    ]);
    expect([...resizeRGBA(data, 2, 2, 1, 1)]).toEqual([255, 0, 0, 255]);
    expect(resizeRGBA(data, 2, 2, 2, 2)).toBe(data);
  });

  it('透明は白にし、不透明な赤は灰色にする', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 255]);
    const gray = toGray(data, 2, 1);
    expect([...gray.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(gray[4]).toBe(76);
    expect(gray[5]).toBe(76);
    expect(gray[6]).toBe(76);
  });

  it('薄い印字を白と黒に近づける', () => {
    const pixels = new Uint8ClampedArray(200 * 4);
    for (let i = 0; i < 100; i++) pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 20;
    for (let i = 100; i < 200; i++) pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 200;
    for (let i = 0; i < 200; i++) pixels[i * 4 + 3] = 255;
    const out = stretchContrast(pixels, 20, 10);
    expect(out[0]).toBe(0);
    expect(out[100 * 4]).toBe(255);
  });

  it('空の画像は白い 1px になる', () => {
    const out = prepareImageData(null);
    expect(out).toEqual({ width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) });
  });
});

describe('読み取りの文言', () => {
  it('進み具合を日本語にする', () => {
    expect(scanProgressLabel('recognizing text', 0.42)).toBe('文字を読んでいます 42%');
    expect(scanProgressLabel('loading language traineddata', 1)).toBe('日本語のデータを読み込んでいます 100%');
    expect(scanProgressLabel('something else', 0)).toBe('準備しています 0%');
    expect(scanProgressLabel('recognizing text', Number.NaN)).toBe('文字を読んでいます');
  });

  it('失敗の理由で文言を分ける', () => {
    expect(scanFailureMessage('image')).toBe('画像を読めませんでした');
    expect(scanFailureMessage('empty')).toBe('文字を読み取れませんでした');
    expect(scanFailureMessage('fail')).toBe('読み取りに失敗しました');
  });
});

describe('作り例の正解数', () => {
  it('6行すべて含まれるとき 6/6', () => {
    const text = SAMPLE_RECEIPT_LINES.join('\n');
    expect(scoreReceiptLines(text)).toMatchObject({ total: 6, correct: 6 });
  });

  it('全角数字と空白の差は正解にし、別の文字は不正解', () => {
    const text = 'イオン\n2026年11月11日\n牛 乳 １９８\n卵 258\n食バン 128\n合計 584';
    const scored = scoreReceiptLines(text);
    expect(scored.total).toBe(6);
    expect(scored.hits.find((h) => h.line === '牛乳 198').ok).toBe(true);
    expect(scored.hits.find((h) => h.line === '食パン 128').ok).toBe(false);
    expect(scored.correct).toBe(5);
  });
});

describe('撮って読むの入口', () => {
  it('貼る欄と読むボタンを残したまま、カメラの入力を足す', () => {
    const html = pasteSheetHtml();
    expect(html).toContain('撮って読む');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain('capture="environment"');
    expect(html).toContain('id="receipt-text"');
    expect(html).toContain('data-action="receipt-read"');
    expect(html).toContain('もう一度撮る');
    expect(html).toContain('文字を貼る');
  });

  it('最初の画面は tesseract を静的 import しない', () => {
    const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).not.toMatch(/from ['"]tesseract\.js/);
    expect(main).toMatch(/import\('\.\/ocr\/recognize\.js'\)/);
  });

  it('学習データとワーカーがパッケージの中にある', () => {
    const files = ocrFiles();
    expect(files.map((f) => f.dest)).toContain('lang/jpn.traineddata.gz');
    expect(files.map((f) => f.dest)).toContain('worker.min.js');
    for (const file of files) expect(fs.existsSync(file.src), file.dest).toBe(true);
  });
});
