import { KEYWORDS, FALLBACK_AISLE, AISLES } from '../data/aisles.js';

export function normalize(s) {
  return String(s ?? '').normalize('NFKC').trim().toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

// 長い順に並べたキーワード（最長一致のため）。1文字の語は部分一致だと誤爆しやすいので
// 1文字は「完全一致」または「語頭/語末」に限定する。
const SORTED = [...KEYWORDS.keys()].sort((a, b) => b.length - a.length);

/** 品名から売り場カテゴリを返す。完全一致→最長部分一致→その他。 */
export function categorize(name) {
  const n = normalize(name);
  if (!n) return FALLBACK_AISLE;
  if (KEYWORDS.has(n)) return KEYWORDS.get(n);
  for (const k of SORTED) {
    if (k.length === 1) {
      if (n.startsWith(k) || n.endsWith(k)) return KEYWORDS.get(k);
    } else if (n.includes(k)) {
      return KEYWORDS.get(k);
    }
  }
  return FALLBACK_AISLE;
}

export function aisleIndex(aisle) {
  const i = AISLES.indexOf(aisle);
  return i < 0 ? AISLES.length - 1 : i;
}
