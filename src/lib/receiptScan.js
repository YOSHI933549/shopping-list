// 撮って読む、の端末内処理。画面も通信も持たない。
// このファイルと src/ocr、src/ui/receiptScan.js、public/ocr を外せば試作を外せる。

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tif|tiff)$/i;

/** ファイル選択が画像らしいときだけ true。中身は見ない。 */
export function isReceiptImage(file) {
  if (!file || typeof file !== 'object') return false;
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  return IMAGE_EXT.test(String(file.name || ''));
}

const STATUS_LABEL = {
  'loading tesseract core': '読み取りの部品を開いています',
  'initializing tesseract': '準備しています',
  'loading language traineddata': '日本語の学習データを読んでいます',
  'initializing api': '準備しています',
  'recognizing text': '文字を読んでいます',
};

/** Tesseract の status / progress（0〜1）を、画面に出す文言と百分率にする。 */
export function progressView(status, progress) {
  const label = STATUS_LABEL[status] || '読み取っています';
  const n = Number(progress);
  const percent = Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) : null;
  return { phase: 'reading', label, percent };
}

/** ページと同じオリジンの URL だけ返す。外へのパスは例外にする。 */
export function sameOriginAsset(path, pageHref) {
  const page = new URL(pageHref);
  const url = new URL(path, page);
  if (url.origin !== page.origin) {
    throw new Error('ocr-asset-left-origin');
  }
  return url.href;
}

export function normalizeScanLine(line) {
  return String(line ?? '').normalize('NFKC').replace(/\u3000/g, ' ').trim().replace(/[ \t]+/g, ' ');
}

/** 期待した行が、読み取り結果の行と完全一致した数。前後の空白と NFKC だけそろえる。 */
export function countMatchingLines(text, expected) {
  const got = String(text ?? '').split(/\r?\n/).map(normalizeScanLine).filter(Boolean);
  const used = new Set();
  const detail = [];
  let matched = 0;
  for (const line of expected || []) {
    const want = normalizeScanLine(line);
    if (!want) continue;
    const idx = got.findIndex((g, i) => !used.has(i) && g === want);
    const ok = idx >= 0;
    if (ok) {
      used.add(idx);
      matched += 1;
    }
    detail.push({ want, ok });
  }
  return { matched, total: detail.length, detail, lines: got };
}
