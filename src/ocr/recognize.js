// 試作。画像も文字もこの端末の中だけで扱う。
// 学習データと部品は同じサイトの /ocr/ から読む（public/ocr）。
// 外すときはこのフォルダと、入口のボタン、public/ocr を一緒に消す。
import Tesseract from 'tesseract.js/dist/tesseract.esm.min.js';
import { progressView, sameOriginAsset } from '../lib/receiptScan.js';
import { isConfidentReading, pickBestReading, scoreReading } from '../lib/readingScore.js';
import { joinCjkSpaces } from '../lib/receiptLines.js';
import { layoutRows, priceColumnEdge, priceSpan, replaceSpan, rowText, wordsFromBlocks } from '../lib/receiptRows.js';
import { prepareReceiptImage } from './prepareImage.js';

function asset(path) {
  return sameOriginAsset(path, window.location.href);
}

const PRICE_CHARS = '0123456789,.¥-';

function cropCanvas(source, box, lineH) {
  const pad = Math.round(lineH * 0.5);
  const sx = Math.max(0, Math.floor(box.x0 - pad));
  const sy = Math.max(0, Math.floor(box.y0 - pad));
  const sw = Math.min(source.width - sx, Math.ceil(box.x1 - box.x0 + pad * 2));
  const sh = Math.min(source.height - sy, Math.ceil(box.y1 - box.y0 + pad * 2));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

// 読み方の候補。うまく読めないときだけ次を試す。
// 二値化のやわらかさ（softness）、画像の倍率（scale）、ページの区切り方（PSM）を変える。
// plain は下ごしらえをしない画像で、下ごしらえがうまく効かない写真でも、以前と同じ程度には読めるようにする保険。
const ATTEMPTS = [
  { softness: 50, scale: 1, psm: 'SINGLE_COLUMN' },
  { plain: true, psm: 'SINGLE_BLOCK' },
  { softness: 50, scale: 1, psm: 'SPARSE_TEXT' },
  { softness: 50, scale: 0.6, psm: 'SINGLE_COLUMN' },
];

/**
 * 画像を読んで文字にする。レシートは1列に並ぶので、まず「1列」(SINGLE_COLUMN) で読む。
 * 合計が明細と合わない、または品名が辞書にないものが多いときは、読み方を変えて読み直し、いちばんよい結果を採る。
 * 単語の位置から行を作り直すので、値段が別のかたまりに読まれても品名と同じ行に戻る。
 */
export async function recognizeReceiptImage(file, onProgress, { onStage } = {}) {
  const report = (status, progress) => onProgress?.(progressView(status, progress));
  const prepared = await prepareReceiptImage(file, { onStage });
  const { createWorker, PSM } = Tesseract;
  let worker;
  try {
  worker = await createWorker('jpn', 1, {
    workerPath: asset('ocr/worker.min.js'),
    corePath: asset('ocr/tesseract-core-simd-lstm.wasm.js'),
    langPath: asset('ocr/lang'),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'write',
    logger: (m) => report(m?.status, m?.progress),
    errorHandler: () => {},
  });
  const read = async ({ softness, scale, psm, plain }) => {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM[psm],
      tessedit_char_whitelist: '',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    report('recognizing text', 0);
    const image = plain ? prepared.plain() : prepared.render(softness, scale);
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    const layout = layoutRows(wordsFromBlocks(data?.blocks));
    const text = layout.rows.map((row) => joinCjkSpaces(rowText(row, layout.lineH))).join('\n');
    return { text: text.trim() ? text : (typeof data?.text === 'string' ? data.text : ''), layout, image };
  };

  // 右端の値段だけを、数字と記号に絞って1行ずつ読み直す。品名の字より数字の読み違いのほうが痛いので。
  const rereadPrices = async (reading) => {
    const { layout, image } = reading;
    if (!layout.rows.length) return reading.text;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: PRICE_CHARS });
    const edge = priceColumnEdge(layout.rows);
    for (const row of layout.rows) {
      const span = priceSpan(row, edge, layout.lineH);
      if (!span) continue;
      const part = row.words.slice(span.start, span.end + 1);
      const box = {
        x0: Math.min(...part.map((w) => w.x0)), y0: row.cy - layout.lineH * 0.7,
        x1: Math.max(...part.map((w) => w.x1)), y1: row.cy + layout.lineH * 0.7,
      };
      const { data } = await worker.recognize(cropCanvas(image, box, layout.lineH));
      const fixed = String(data?.text ?? '').replace(/\s+/g, '');
      if (/^[-¥]?\d[\d,.]*$/.test(fixed)) replaceSpan(row, span, fixed);
    }
    return layout.rows.map((row) => joinCjkSpaces(rowText(row, layout.lineH))).join('\n');
  };

    const readings = [];
    for (const attempt of ATTEMPTS) {
      const reading = await read(attempt);
      readings.push(reading);
      if (isConfidentReading(reading.text)) break;
    }
    const best = readings.find((r) => r.text === pickBestReading(readings.map((x) => x.text))) || readings[0];
    const fixed = await rereadPrices(best);
    return scoreReading(fixed) >= scoreReading(best.text) ? fixed : best.text;
  } finally {
    prepared.close();
    if (worker) await worker.terminate();
  }
}
