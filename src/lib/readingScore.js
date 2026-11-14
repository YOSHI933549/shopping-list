import { categorize } from './categorize.js';
import { FALLBACK_AISLE } from '../data/aisles.js';
import { parseReceipt } from './receipt.js';

const CONFIDENT_KNOWN_SHARE = 0.75;

function knownCount(items) {
  return items.filter((it) => categorize(it.name) !== FALLBACK_AISLE).length;
}

/**
 * 読み取った文字の出来の目安。明細の数が多く、不明な行が少ないほど高い。
 * 印字の合計と明細の合計がぴったり合えば大きく加点する（値段の読み違いがほぼ無い印）。
 * 品名が売り場の辞書にある食品・日用品なら加点する（名前の読み違いが少ない印）。
 */
export function scoreReading(text) {
  const parsed = parseReceipt(text);
  const items = parsed.items.length;
  if (!items) return 0;
  return (parsed.matches === true ? 10 : 0) + items + knownCount(parsed.items) - parsed.unknown.length * 0.25;
}

/** 候補の文字のうち、scoreReading が最も高いもの。同点なら先の候補。候補が無ければ空文字。 */
export function pickBestReading(texts) {
  let best = '';
  let bestScore = -Infinity;
  for (const text of texts || []) {
    const score = scoreReading(text);
    if (score > bestScore) {
      best = String(text ?? '');
      bestScore = score;
    }
  }
  return best;
}

/** これ以上は読み直さなくてよいか。合計が合い、明細が2行以上あり、品名の4分の3以上が辞書にある。 */
export function isConfidentReading(text) {
  const parsed = parseReceipt(text);
  const items = parsed.items.length;
  return parsed.matches === true && items >= 2 && knownCount(parsed.items) / items >= CONFIDENT_KNOWN_SHARE;
}
