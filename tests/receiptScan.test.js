import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../src/lib/receipt.js';
import {
  countMatchingLines, isReceiptImage, normalizeScanLine, progressView, sameOriginAsset,
} from '../src/lib/receiptScan.js';
import { pasteSheetHtml } from '../src/ui/receipt.js';
import { scanStatusHtml } from '../src/ui/receiptScan.js';

const SAMPLE = ['イオン', '牛乳 198', '卵 258', '合計 456'];

describe('撮って読むの入口', () => {
  it('画像らしいファイルだけ通す', () => {
    expect(isReceiptImage({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true);
    expect(isReceiptImage({ type: '', name: 'receipt.HEIC' })).toBe(true);
    expect(isReceiptImage({ type: 'text/plain', name: 'memo.txt' })).toBe(false);
    expect(isReceiptImage(null)).toBe(false);
  });

  it('進み具合を日本語の文言と百分率にする', () => {
    expect(progressView('recognizing text', 0.126)).toEqual({ phase: 'reading', label: '文字を読んでいます', percent: 13 });
    expect(progressView('loading language traineddata', 0)).toEqual({ phase: 'reading', label: '日本語の学習データを読んでいます', percent: 0 });
    expect(progressView('something else', 2).percent).toBeNull();
    expect(progressView('something else', 2).label).toBe('読み取っています');
  });

  it('部品の URL はページと同じオリジンだけ', () => {
    const page = 'https://user.github.io/shopping-list/index.html';
    expect(sameOriginAsset('ocr/worker.min.js', page)).toBe('https://user.github.io/shopping-list/ocr/worker.min.js');
    expect(sameOriginAsset('ocr/lang', 'http://127.0.0.1:9/')).toBe('http://127.0.0.1:9/ocr/lang');
    expect(() => sameOriginAsset('https://cdn.jsdelivr.net/npm/tesseract.js', page)).toThrow(/ocr-asset-left-origin/);
  });

  it('行の一致は前後の空白と NFKC だけを除き、文字の欠落は数えない', () => {
    const score = countMatchingLines('イオン\n牛 乳 198\n　卵 258\n合計 ４５６\n', SAMPLE);
    expect(score.total).toBe(4);
    expect(score.matched).toBe(3);
    expect(score.detail.map((d) => d.ok)).toEqual([true, false, true, true]);
    expect(normalizeScanLine('  合計\u3000456  ')).toBe('合計 456');
  });

  it('作り例の4行は、今の parseReceipt で明細2行と合計456円になる', () => {
    const parsed = parseReceipt(SAMPLE.join('\n'));
    expect(parsed.items.map((item) => item.name)).toEqual(['牛乳', '卵']);
    expect(parsed.items.map((item) => item.amount)).toEqual([198, 258]);
    expect(parsed.total).toBe(456);
    expect(parsed.matches).toBe(true);
  });
});

describe('撮って読むの入口', () => {
  const html = pasteSheetHtml();

  it('カメラ用の入力と、写真から選ぶ入力を足し、貼る欄と読むボタンは残す', () => {
    expect(html).toContain('撮って読む');
    expect(html).toContain('id="receipt-camera"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain('capture="environment"');
    expect(html).toContain('写真から選ぶ');
    expect(html).toContain('id="receipt-photo"');
    expect(html).not.toMatch(/id="receipt-photo"[^>]*capture=/);
    expect(html).toContain('id="receipt-text"');
    expect(html).toContain('data-action="receipt-read"');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('読み取り中と失敗の表示を出し、待っていないときは空', () => {
    const reading = scanStatusHtml({ phase: 'reading', label: '文字を読んでいます', percent: 40 });
    expect(reading).toContain('data-testid="scan-progress"');
    expect(reading).toContain('文字を読んでいます');
    expect(reading).toContain('width:40%');
    expect(reading).toContain('40%');
    const failed = scanStatusHtml({ phase: 'failed' });
    expect(failed).toContain('data-testid="scan-failed"');
    expect(failed).toContain('もう一度撮る');
    expect(failed).toContain('文字を貼る');
    expect(failed).toContain('data-action="receipt-scan-again"');
    expect(failed).toContain('data-action="receipt-scan-paste"');
    expect(scanStatusHtml(null)).toBe('');
    expect(scanStatusHtml({ phase: 'reading', label: '<b>', percent: 140 })).toContain('&lt;b&gt;');
    expect(scanStatusHtml({ phase: 'reading', label: '<b>', percent: 140 })).toContain('width:100%');
  });
});
