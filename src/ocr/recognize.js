// 試作の端末内 OCR。Tesseract.js と日本語データは、写真を選んだあとだけ読む。
// 画像も文字も、このサイト以外へは送らない。このフォルダと取り込み画面のボタンを消せば外せる。

import { prepareImageData } from './imagePrep.js';
import { scanProgressLabel } from './messages.js';

const MAX_EDGE = 2000;

function asset(file) {
  const base = import.meta.env.BASE_URL || './';
  const root = new URL(base, document.baseURI);
  return new URL(file, root).href;
}

function fail(reason) {
  const err = new Error(reason);
  err.reason = reason;
  return err;
}

let workerPromise = null;
let listener = () => {};

async function loadWorker() {
  const mod = await import('tesseract.js/dist/tesseract.esm.min.js');
  const createWorker = mod.default?.createWorker;
  if (typeof createWorker !== 'function') throw fail('engine');
  return createWorker('jpn', 1, {
    workerPath: asset('ocr/worker.min.js'),
    corePath: asset('ocr/core'),
    langPath: asset('ocr/lang'),
    gzip: true,
    cacheMethod: 'none',
    workerBlobURL: true,
    logger: (m) => listener(m),
    errorHandler: () => {},
  });
}

function engine() {
  if (!workerPromise) {
    workerPromise = loadWorker().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** 読み取りを中断し、部品を捨てる。シートを閉じたときに呼ぶ。 */
export async function releaseEngine() {
  const pending = workerPromise;
  workerPromise = null;
  listener = () => {};
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* 起動前の失敗は捨ててよい */
  }
}

function canvasFromFileBitmap(bitmap) {
  const src = document.createElement('canvas');
  src.width = bitmap.width;
  src.height = bitmap.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(bitmap, 0, 0);
  const prepared = prepareImageData(sctx.getImageData(0, 0, src.width, src.height), { maxEdge: MAX_EDGE });
  const out = document.createElement('canvas');
  out.width = prepared.width;
  out.height = prepared.height;
  out.getContext('2d').putImageData(new ImageData(prepared.data, prepared.width, prepared.height), 0, 0);
  return out;
}

/**
 * 画像ファイルを日本語の文字にする。重い部品はこの関数の中で初めて読む。
 * onProgress({ phase, message, progress }) を読む途中で呼ぶ。
 * 画像でない、文字が空、部品の失敗は reason 付きで reject する。
 */
export async function recognizeReceiptFile(file, { onProgress } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) throw fail('image');
  onProgress?.({ phase: 'run', message: scanProgressLabel('loading tesseract core', 0), progress: 0 });
  listener = (m) => {
    const progress = Number(m?.progress);
    onProgress?.({
      phase: 'run',
      message: scanProgressLabel(m?.status, progress),
      progress: Number.isFinite(progress) ? progress : 0,
    });
  };
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw fail('image');
  }
  let canvas;
  try {
    canvas = canvasFromFileBitmap(bitmap);
  } finally {
    bitmap.close?.();
  }
  const worker = await engine();
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    user_defined_dpi: '300',
  });
  const result = await worker.recognize(canvas);
  const text = String(result?.data?.text ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) throw fail('empty');
  return text;
}
