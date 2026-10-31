import { normalize } from './categorize.js';

export const MAX_PRICE = 9999999;

/**
 * 値段の入力を解釈する。全角数字・「¥」「￥」「円」「,」「、」・空白は無視。
 * 空 → { ok: true, value: null }（値段なし）/ 0以上の整数 → { ok: true, value } / それ以外 → { ok: false }
 */
export function parsePrice(input) {
  if (input == null) return { ok: true, value: null };
  if (typeof input === 'number') {
    return Number.isInteger(input) && input >= 0 && input <= MAX_PRICE ? { ok: true, value: input } : { ok: false };
  }
  const s = String(input).normalize('NFKC').replace(/[\s¥円,、，]/g, '');
  if (s === '') return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const v = Number(s);
  return v <= MAX_PRICE ? { ok: true, value: v } : { ok: false };
}

/** 1280 → "1,280円" */
export function formatYen(n) {
  return `${Number(n).toLocaleString('en-US')}円`;
}

/** priceBook のキー: お店 + 正規化した商品名 */
export function priceKey(storeId, name) {
  return `${storeId}\u0000${normalize(name)}`;
}
