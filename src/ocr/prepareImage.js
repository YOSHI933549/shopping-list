import { grayPixels, scaledSize } from '../lib/receiptScan.js';

const PAD = 24;

/** 画像を長辺 1600px 以内に縮め、白黒にしてから返す。元のファイルは保存しない。 */
export async function prepareReceiptImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const size = scaledSize(bitmap.width, bitmap.height);
    if (!size.width || !size.height) throw new Error('empty-image');
    const canvas = document.createElement('canvas');
    canvas.width = size.width + PAD * 2;
    canvas.height = size.height + PAD * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, PAD, PAD, size.width, size.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    img.data.set(grayPixels(img.data));
    ctx.putImageData(img, 0, 0);
    return canvas;
  } finally {
    bitmap.close?.();
  }
}
