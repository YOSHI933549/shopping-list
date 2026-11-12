import { normalize } from './categorize.js';
import { resolveGoods } from './goods.js';
import { isDate, sanitizeHistory } from './history.js';

// 入力欄に出す候補の最大件数。画面・テスト・撮影はここだけを見る。
export const SUGGESTION_LIMIT = 6;

function pushKey(keys, value) {
  if (typeof value === 'string' && normalize(value)) keys.add(value);
}

/**
 * 打ちかけの文字から、買ったことのある品名を返す。
 * 名前は別名とまとめをたどったあとの名前。並びは回数の多い順、同じなら最近買った順。
 * 空の入力、履歴が0件、一致なしは空。ひらがな・カタカナ・半角/全角は normalize でそろえる。
 */
export function itemSuggestions(history, query, limit = SUGGESTION_LIMIT) {
  const q = normalize(query);
  if (!q) return [];
  const h = sanitizeHistory(history);
  if (!h.lines.length) return [];
  const groups = new Map();
  for (const line of h.lines) {
    const resolved = line.goodsId ? resolveGoods(h.goods, line.goodsId) : null;
    const display = String((resolved?.name || line.name || '')).trim();
    const key = normalize(display);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { name: display, goodsId: resolved?.id || null, lines: [], goods: new Set() });
    const group = groups.get(key);
    group.lines.push(line);
    if (resolved?.id) group.goods.add(resolved.id);
    if (line.goodsId) group.goods.add(line.goodsId);
  }
  const items = [];
  for (const group of groups.values()) {
    const keys = new Set();
    pushKey(keys, group.name);
    for (const line of group.lines) pushKey(keys, line.name);
    for (const good of h.goods) {
      if (!group.goods.has(good.id)) continue;
      pushKey(keys, good.name);
      for (const alias of good.aliases || []) pushKey(keys, alias?.notation);
    }
    if (![...keys].some((key) => normalize(key).includes(q))) continue;
    let lastDate = '';
    for (const line of group.lines) {
      if (isDate(line.date) && line.date > lastDate) lastDate = line.date;
    }
    items.push({ name: group.name, count: group.lines.length, lastDate, goodsId: group.goodsId });
  }
  items.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1;
    return a.name.localeCompare(b.name, 'ja');
  });
  const cap = Number.isInteger(limit) && limit > 0 ? limit : SUGGESTION_LIMIT;
  return items.slice(0, cap);
}
