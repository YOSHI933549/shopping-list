import {
  binarize, cropRectFor, darkRatio, deskewRotation, estimateSkewDegrees, flattenBackground, inkBounds, lumaPlane,
  otsuThreshold, planeToRgba, prepSize, removeLargeBlobs, softBinarize, stretchContrast, whiteOutsideInk, whitenMask,
} from '../lib/imagePrep.js';

const PAD = 24;
const MAX_DARK_RATIO = 0.6;
const SOFTNESS = 50;
const DETECT_EDGE = 1000;
const PLAIN_MAX_EDGE = 1600;
const BLOB_MEDIAN_FACTOR = 4;

function blobLimit(width, height) {
  return Math.max(60, Math.round(Math.min(width, height) * 0.08));
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function planeCanvas(plane, width, height) {
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(planeToRgba(plane), width, height), 0, 0);
  return canvas;
}

function readPlane(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return lumaPlane(img.data);
}

function rotated(source, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const width = Math.ceil(source.width * cos + source.height * sin);
  const height = Math.ceil(source.width * sin + source.height * cos);
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function inkMask(flat) {
  const stretched = stretchContrast(flat);
  return binarize(stretched, otsuThreshold(stretched));
}

function inkOf(flat, width, height) {
  const stretched = stretchContrast(flat);
  const threshold = otsuThreshold(stretched);
  const bin = binarize(stretched, threshold);
  if (darkRatio(bin) > MAX_DARK_RATIO) return { stretched, threshold, ink: null, mask: null };
  const mask = new Uint8Array(bin.length);
  removeLargeBlobs(bin, width, height, blobLimit(width, height), mask, BLOB_MEDIAN_FACTOR);
  return { stretched, threshold, ink: bin, mask };
}

function planeFor({ stretched, threshold, ink, mask }, width, height, softness) {
  if (!ink) return stretched;
  const plane = softBinarize(stretched, threshold, softness);
  whitenMask(plane, mask, width, height, 5);
  whiteOutsideInk(plane, ink, width, height, 2);
  return plane;
}

/** 小さく縮めて字のある範囲を探し、元の画像での切り取り範囲を返す。見つからなければ null。 */
function findReceiptRect(bitmap) {
  const scale = Math.min(1, DETECT_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = canvasOf(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const flat = flattenBackground(lumaPlane(ctx.getImageData(0, 0, w, h).data), w, h, Math.max(8, Math.round(w / 40)));
  const bin = inkMask(flat);
  if (darkRatio(bin) > MAX_DARK_RATIO) return null;
  removeLargeBlobs(bin, w, h, blobLimit(w, h), null, BLOB_MEDIAN_FACTOR);
  return cropRectFor(inkBounds(bin, w, h, 0, 3), w, h, bitmap.width, bitmap.height);
}

/**
 * 写真を読み取り用の白黒画像にする。元のファイルは保存しない。
 * 字のある範囲を切り取る → 拡大（幅 1500〜2000px）→ 白黒 → 傾き補正 → 影の除去 → コントラスト強調 →
 * 二値化（大津。ふちのぼかしは softness で変えられる）。
 * 返す plain() は、切り取りも傾き補正もせず白黒にしただけの画像（うまくいかなかったときの保険）。
 * 使い終わったら close() で元の画像を手放す。
 * 返す render(softness, scale) は、そのやわらかさと倍率（1 = 上の大きさ）で作った canvas を返す。字が大きすぎる画像は縮めたほうが読める。
 * onStage(名前, canvas) には途中の画像を渡す（見本画像用。通常は使わない）。
 */
export async function prepareReceiptImage(file, { onStage } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const close = () => bitmap.close?.();
  try {
    const rect = findReceiptRect(bitmap) || { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    const size = prepSize(rect.width, rect.height);
    if (!size.width || !size.height) throw new Error('empty-image');
    const base = canvasOf(size.width, size.height);
    const ctx = base.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height);
    onStage?.('resized', base);

    let width = size.width;
    let height = size.height;
    let gray = lumaPlane(ctx.getImageData(0, 0, width, height).data);
    let flat = flattenBackground(gray, width, height);

    const turn = deskewRotation(estimateSkewDegrees(inkMask(flat), width, height));
    if (turn !== 0) {
      const straight = rotated(planeCanvas(gray, width, height), turn);
      width = straight.width;
      height = straight.height;
      gray = readPlane(straight);
      flat = flattenBackground(gray, width, height);
      onStage?.('deskewed', straight);
    }

    const parts = inkOf(flat, width, height);
    const box = parts.ink ? inkBounds(parts.ink, width, height, PAD, 3) : { x: 0, y: 0, width, height };
    const render = (softness = SOFTNESS, scale = 1) => {
      const pad = Math.round(PAD * scale);
      const w = Math.max(1, Math.round(box.width * scale));
      const h = Math.max(1, Math.round(box.height * scale));
      const out = canvasOf(w + pad * 2, h + pad * 2);
      const octx = out.getContext('2d');
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, out.width, out.height);
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(planeCanvas(planeFor(parts, width, height, softness), width, height), box.x, box.y, box.width, box.height, pad, pad, w, h);
      return out;
    };
    const plain = () => {
      const fit = Math.min(1, PLAIN_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * fit));
      const h = Math.max(1, Math.round(bitmap.height * fit));
      const out = canvasOf(w + PAD * 2, h + PAD * 2);
      const octx = out.getContext('2d', { willReadFrequently: true });
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, out.width, out.height);
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(bitmap, PAD, PAD, w, h);
      octx.putImageData(new ImageData(planeToRgba(lumaPlane(octx.getImageData(0, 0, out.width, out.height).data)), out.width, out.height), 0, 0);
      return out;
    };
    onStage?.('final', render());
    return { render, plain, close };
  } catch (err) {
    close();
    throw err;
  }
}
