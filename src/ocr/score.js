// 作り例のレシートを、何行読めたか数える。空白と全角数字の差は無視する。

export const SAMPLE_RECEIPT_LINES = Object.freeze([
  'イオン',
  '2026年11月11日',
  '牛乳 198',
  '卵 258',
  '食パン 128',
  '合計 584',
]);

/** NFKC にして空白を除く。 */
export function compactReceiptText(text) {
  return String(text ?? '').normalize('NFKC').replace(/\s+/g, '');
}

/**
 * 期待した行が、読んだ文字の中にそのまま（空白を除いて）含まれる数。
 * 文字が置き換わっている行は不正解にする。
 */
export function scoreReceiptLines(text, lines = SAMPLE_RECEIPT_LINES) {
  const got = compactReceiptText(text);
  const hits = lines.map((line) => ({ line, ok: got.includes(compactReceiptText(line)) }));
  return { total: lines.length, correct: hits.filter((hit) => hit.ok).length, hits };
}
