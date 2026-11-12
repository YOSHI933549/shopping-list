import { normalize } from './categorize.js';

// 買った記録（明細）とレシート。30日で消える bought とは別に残す。
// version 2 で品物の台帳 goods を足す。別名は「店 × normalize した元の表記」。
// 未知の項目は捨てずに通す。版1（台帳なし）は台帳を空で足すだけで、明細は消さない。
// date が null の行は日付不明（以前の値段メモの最新1件）。
// 明細の source: 'check' は丸、'migrate' は移行、'receipt' はレシート。
export const HISTORY_KEY = 'kaimono-history-v1';
export const HISTORY_VERSION = 2;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyHistory() {
  return { version: HISTORY_VERSION, lines: [], receipts: [], goods: [] };
}

export function copyPlain(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = v;
  }
  return out;
}

export function isDate(v) {
  return typeof v === 'string' && DATE_RE.test(v);
}

function validPrice(v) {
  return Number.isInteger(v) && v >= 0 ? v : null;
}

function sanitizeReceipt(r, index, seen) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) {
    return { id: `kept_r_${index}`, storeId: '', date: null, time: null, total: null, tax: '不明', source: 'receipt', text: '', savedAt: null, raw: r };
  }
  let id = typeof r.id === 'string' && r.id ? r.id : `kept_r_${index}_${r.storeId || ''}_${r.date || ''}`;
  if (seen.has(id)) id = `${id}_${index}`;
  seen.add(id);
  const total = Number.isInteger(r.total) ? r.total : null;
  const next = {
    ...copyPlain(r),
    id,
    storeId: typeof r.storeId === 'string' ? r.storeId : '',
    date: isDate(r.date) ? r.date : null,
    time: typeof r.time === 'string' ? r.time : null,
    total: total != null ? total : r.total == null ? null : r.total,
    tax: typeof r.tax === 'string' && r.tax ? r.tax : '不明',
    source: typeof r.source === 'string' && r.source ? r.source : 'receipt',
    text: typeof r.text === 'string' ? r.text : '',
    savedAt: typeof r.savedAt === 'string' ? r.savedAt : null,
  };
  if (!isDate(r.date) && r.date != null) next.keptDate = r.date;
  if (typeof r.time !== 'string' && r.time != null) next.keptTime = r.time;
  if (typeof r.savedAt !== 'string' && r.savedAt != null) next.keptSavedAt = r.savedAt;
  return next;
}

function sanitizeReceiptList(list) {
  const seen = new Set();
  return list.map((r, index) => sanitizeReceipt(r, index, seen));
}

function dedupeAliases(list) {
  const out = [];
  for (const a of list || []) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) continue;
    if (typeof a.storeId !== 'string' || typeof a.notation !== 'string' || !a.notation) continue;
    if (out.some((x) => x.storeId === a.storeId && x.notation === a.notation)) continue;
    out.push({ ...copyPlain(a), storeId: a.storeId, notation: a.notation });
  }
  return out;
}

/** 品物の台帳。壊れた要素も残す。別名は店と表記が同じものを一つにする。 */
export function sanitizeGoods(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map((g, index) => {
    if (!g || typeof g !== 'object' || Array.isArray(g)) {
      return { id: `kept_g_${index}`, name: '', aliases: [], mergedInto: null, raw: g };
    }
    let id = typeof g.id === 'string' && g.id ? g.id : `kept_g_${index}`;
    if (seen.has(id)) id = `${id}_${index}`;
    seen.add(id);
    const next = {
      ...copyPlain(g),
      id,
      name: typeof g.name === 'string' ? g.name : '',
      aliases: dedupeAliases(Array.isArray(g.aliases) ? g.aliases : []),
      mergedInto: typeof g.mergedInto === 'string' && g.mergedInto ? g.mergedInto : null,
    };
    if (!Array.isArray(g.aliases) && g.aliases !== undefined) next.keptAliases = g.aliases;
    return next;
  });
}

/** 履歴オブジェクトを整形する。知らない項目は残す。壊れた行も raw として残す。 */
export function sanitizeHistory(h) {
  if (h == null) return emptyHistory();
  if (!h || typeof h !== 'object' || Array.isArray(h)) return { version: HISTORY_VERSION, lines: [], receipts: [], goods: [], kept: h };
  const base = copyPlain(h);
  const keptReceipts = Array.isArray(h.receipts) || h.receipts === undefined ? undefined : h.receipts;
  const receipts = Array.isArray(h.receipts) ? sanitizeReceiptList(h.receipts) : [];
  const goods = sanitizeGoods(h.goods);
  const keptGoods = Array.isArray(h.goods) || h.goods === undefined ? undefined : h.goods;
  if (!Array.isArray(h.lines)) {
    const out = { ...base, version: HISTORY_VERSION, lines: [], receipts, goods };
    if (h.lines !== undefined) out.keptLines = h.lines;
    if (keptReceipts !== undefined) out.keptReceipts = keptReceipts;
    if (keptGoods !== undefined) out.keptGoods = keptGoods;
    return out;
  }
  const lines = [];
  const seen = new Set();
  h.lines.forEach((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      lines.push({ id: `kept_${index}`, raw: line, source: 'migrate', name: '', storeId: '', date: null, price: null, itemId: null, boughtAt: null });
      return;
    }
    let id = typeof line.id === 'string' && line.id ? line.id : `kept_${index}_${line.storeId || ''}_${line.name || ''}_${line.date || ''}_${line.price ?? ''}`;
    if (seen.has(id)) id = `${id}_${index}`;
    seen.add(id);
    const price = validPrice(line.price);
    const next = {
      ...copyPlain(line),
      id,
      itemId: typeof line.itemId === 'string' ? line.itemId : null,
      name: typeof line.name === 'string' ? line.name : '',
      storeId: typeof line.storeId === 'string' ? line.storeId : '',
      date: isDate(line.date) ? line.date : null,
      boughtAt: typeof line.boughtAt === 'string' ? line.boughtAt : null,
      price: price != null ? price : line.price == null ? null : line.price,
      source: typeof line.source === 'string' && line.source ? line.source : 'migrate',
    };
    if (!isDate(line.date) && line.date != null) next.keptDate = line.date;
    if (typeof line.boughtAt !== 'string' && line.boughtAt != null) next.keptBoughtAt = line.boughtAt;
    lines.push(next);
  });
  const out = { ...base, version: HISTORY_VERSION, lines, receipts, goods };
  if (keptReceipts !== undefined) out.keptReceipts = keptReceipts;
  if (keptGoods !== undefined) out.keptGoods = keptGoods;
  if (out.keptLines === undefined) delete out.keptLines;
  return out;
}

function borrowName(state, storeId, norm) {
  const pools = [
    (state.items || []).filter((i) => i && i.storeId === storeId),
    (state.regulars || []).filter((i) => i && i.storeId === storeId),
    (state.bought || []).filter((i) => i && i.storeId === storeId),
    state.items || [],
    state.regulars || [],
    state.bought || [],
  ];
  for (const pool of pools) {
    const hit = pool.find((i) => i && typeof i.name === 'string' && normalize(i.name) === norm);
    if (hit) return hit.name;
  }
  return norm;
}

function lineFromBought(b) {
  const { id, name, storeId, price, boughtDate, boughtAt, memo, ...rest } = b;
  const line = {
    ...copyPlain(rest),
    id: `m_${id}`,
    itemId: id,
    name,
    storeId,
    date: isDate(boughtDate) ? boughtDate : null,
    boughtAt: typeof boughtAt === 'string' ? boughtAt : null,
    price: validPrice(price) != null ? price : price == null ? null : price,
    memo: typeof memo === 'string' ? memo : '',
    source: 'migrate',
  };
  if (!isDate(boughtDate) && boughtDate != null) line.keptDate = boughtDate;
  if (typeof boughtAt !== 'string' && boughtAt != null) line.keptBoughtAt = boughtAt;
  return line;
}

/**
 * bought と priceBook を明細へ移す。何度呼んでも行は増えない。
 * priceBook は日付不明。同じお店・同じ品・同じ値段の行が既にあれば作らない。
 */
export function migratePurchases(state) {
  const history = sanitizeHistory(state.history);
  const lines = [...history.lines];
  const itemIds = new Set(lines.map((l) => l.itemId).filter(Boolean));

  for (const b of state.bought || []) {
    if (!b || typeof b.id !== 'string' || !b.id || itemIds.has(b.id)) continue;
    if (typeof b.name !== 'string' || typeof b.storeId !== 'string') continue;
    // 同じ日・同じお店・同じ品の明細がすでにある（レシートで丸を置き換えたときなど）は足さない。
    const boughtDate = isDate(b.boughtDate) ? b.boughtDate : null;
    const covered = boughtDate != null && lines.some((l) => l.storeId === b.storeId && l.date === boughtDate && normalize(l.name) === normalize(b.name));
    if (covered) continue;
    lines.push(lineFromBought(b));
    itemIds.add(b.id);
  }

  for (const [key, price] of Object.entries(state.priceBook || {})) {
    if (!Number.isInteger(price) || price < 0) continue;
    const i = key.indexOf('\u0000');
    if (i <= 0) continue;
    const storeId = key.slice(0, i);
    const norm = key.slice(i + 1);
    if (!storeId || !norm) continue;
    const exists = lines.some((l) => l.storeId === storeId && normalize(l.name) === norm && l.price === price);
    if (exists) continue;
    const id = `p_${storeId}_${norm}_${price}`;
    if (lines.some((l) => l.id === id)) continue;
    lines.push({
      id,
      itemId: null,
      name: borrowName(state, storeId, norm),
      storeId,
      date: null,
      boughtAt: null,
      price,
      memo: '',
      source: 'migrate',
    });
  }

  return { ...state, history: { ...history, version: HISTORY_VERSION, lines } };
}

/** 同じ id の行は両方の項目を残して一つにまとめる。 */
export function unionHistory(a, b) {
  const left = sanitizeHistory(a);
  const right = sanitizeHistory(b);
  const map = new Map();
  const mergeLine = (x, y) => {
    const out = { ...x, ...y };
    for (const k of Object.keys(x)) {
      if ((y[k] == null || y[k] === '') && x[k] != null && x[k] !== '') out[k] = x[k];
    }
    return out;
  };
  for (const line of left.lines) map.set(line.id, line);
  for (const line of right.lines) {
    map.set(line.id, map.has(line.id) ? mergeLine(map.get(line.id), line) : line);
  }
  const receiptMap = new Map();
  for (const rec of left.receipts) receiptMap.set(rec.id, rec);
  for (const rec of right.receipts) {
    receiptMap.set(rec.id, receiptMap.has(rec.id) ? mergeLine(receiptMap.get(rec.id), rec) : rec);
  }
  const mergeGood = (a, b) => {
    const aliases = dedupeAliases([...(a.aliases || []), ...(b.aliases || [])]);
    const out = { ...a, ...b, aliases, mergedInto: b.mergedInto || a.mergedInto || null };
    if (!out.name) out.name = a.name || '';
    return out;
  };
  const goodsMap = new Map();
  for (const g of left.goods) goodsMap.set(g.id, g);
  for (const g of right.goods) {
    goodsMap.set(g.id, goodsMap.has(g.id) ? mergeGood(goodsMap.get(g.id), g) : g);
  }
  const out = { ...left, ...right, version: HISTORY_VERSION, lines: [...map.values()], receipts: [...receiptMap.values()], goods: [...goodsMap.values()] };
  if (out.keptLines === undefined) delete out.keptLines;
  return out;
}

/** 丸を押した記録を1件足す。同じ itemId が既にあれば足さない。 */
export function appendPurchase(history, line) {
  const h = sanitizeHistory(history);
  if (line.itemId && h.lines.some((l) => l.itemId === line.itemId)) return h;
  return { ...h, lines: [...h.lines, line] };
}

/** 戻した品の明細を外す。removed が false のときは値段メモを触らない。 */
export function dropPurchase(history, itemId) {
  const h = sanitizeHistory(history);
  const lines = h.lines.filter((l) => l.itemId !== itemId);
  if (lines.length === h.lines.length) return { history: h, removed: false };
  return { history: { ...h, lines }, removed: true };
}

/** 残った明細から、そのお店・品の値段を決める。日付のある行を優先し、無ければ日付不明。 */
export function priceFromLines(lines, storeId, name) {
  const norm = normalize(name);
  let dated = null;
  let unknown = null;
  for (const line of lines || []) {
    if (!line || line.storeId !== storeId || normalize(line.name) !== norm) continue;
    if (!Number.isInteger(line.price) || line.price < 0) continue;
    if (isDate(line.date)) {
      const at = line.boughtAt || '';
      if (!dated || line.date > dated.date || (line.date === dated.date && at > (dated.boughtAt || ''))) dated = line;
    } else if (!unknown) unknown = line;
  }
  const hit = dated || unknown;
  return hit ? hit.price : null;
}

/** 同じお店・正規化した品名で、いちばん新しい日付。日付不明は無視。無ければ null。 */
export function lastBoughtDate(lines, storeId, name) {
  const norm = normalize(name);
  let best = null;
  for (const line of lines || []) {
    if (!line || line.storeId !== storeId || normalize(line.name) !== norm) continue;
    if (!isDate(line.date)) continue;
    if (!best || line.date > best) best = line.date;
  }
  return best;
}

/** カレンダー日の差（今日が新しいほど正）。タイムゾーンのずれで1日ずれないよう日付だけで比べる。 */
export function daysBefore(dateStr, now = new Date()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000);
}

/** 「前回 10/28（14日前）」。記録が無ければ null。 */
export function formatLastBought(date, now = new Date()) {
  if (!isDate(date)) return null;
  const [, m, d] = date.split('-').map(Number);
  const days = daysBefore(date, now);
  const md = `${m}/${d}`;
  if (days === 0) return `前回 ${md}（今日）`;
  if (days === 1) return `前回 ${md}（昨日）`;
  if (days > 1) return `前回 ${md}（${days}日前）`;
  return `前回 ${md}`;
}
