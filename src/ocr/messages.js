// 読み取り中の文言。Tesseract.js 7 の status を、画面に出す日本語にする。

const STATUS = {
  'loading tesseract core': '読み取りの部品を読み込んでいます',
  'initializing tesseract': '読み取りの部品を準備しています',
  'loading language traineddata': '日本語のデータを読み込んでいます',
  'initializing api': '日本語のデータを準備しています',
  'recognizing text': '文字を読んでいます',
};

/** 進み具合の 1 行。progress は 0〜1。分からない status は「準備しています」。 */
export function scanProgressLabel(status, progress) {
  const head = STATUS[status] || '準備しています';
  const n = Number(progress);
  if (!Number.isFinite(n)) return head;
  const pct = Math.max(0, Math.min(100, Math.round(n * 100)));
  return `${head} ${pct}%`;
}

/** 失敗の 1 行。reason は image / empty / それ以外。 */
export function scanFailureMessage(reason) {
  if (reason === 'image') return '画像を読めませんでした';
  if (reason === 'empty') return '文字を読み取れませんでした';
  return '読み取りに失敗しました';
}
