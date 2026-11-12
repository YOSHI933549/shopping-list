// 試作。画像も文字もこの端末の中だけで扱う。
// 学習データと部品は同じサイトの /ocr/ から読む（public/ocr）。
// 外すときはこのフォルダと、入口のボタン、public/ocr を一緒に消す。
import Tesseract from 'tesseract.js/dist/tesseract.esm.min.js';
import { progressView, sameOriginAsset } from '../lib/receiptScan.js';
import { prepareReceiptImage } from './prepareImage.js';

function asset(path) {
  return sameOriginAsset(path, window.location.href);
}

export async function recognizeReceiptImage(file, onProgress) {
  const report = (status, progress) => onProgress?.(progressView(status, progress));
  const image = await prepareReceiptImage(file);
  const { createWorker, PSM } = Tesseract;
  const worker = await createWorker('jpn', 1, {
    workerPath: asset('ocr/worker.min.js'),
    corePath: asset('ocr/tesseract-core-simd-lstm.wasm.js'),
    langPath: asset('ocr/lang'),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'write',
    logger: (m) => report(m?.status, m?.progress),
    errorHandler: () => {},
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      user_defined_dpi: '300',
    });
    report('recognizing text', 0);
    const { data } = await worker.recognize(image);
    return typeof data?.text === 'string' ? data.text : '';
  } finally {
    await worker.terminate();
  }
}
