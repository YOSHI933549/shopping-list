import { isReceiptImage, progressView } from '../lib/receiptScan.js';

/**
 * ボタンを押したあとだけ、文字認識の部品を読み込む。
 * 画像でなければ部品を読まずに失敗させる。中断されたら null。
 */
export async function runReceiptScan(file, { onProgress, isCurrent } = {}) {
  if (!isReceiptImage(file)) throw new Error('not-image');
  const current = () => (typeof isCurrent === 'function' ? isCurrent() : true);
  onProgress?.(progressView('loading tesseract core', 0));
  const { recognizeReceiptImage } = await import('./recognize.js');
  if (!current()) return null;
  const text = await recognizeReceiptImage(file, (view) => {
    if (current()) onProgress?.(view);
  });
  if (!current()) return null;
  return text;
}
