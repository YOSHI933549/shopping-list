import { normalize } from './categorize.js';
import { resolveGoods } from './goods.js';
import { isDate } from './history.js';

// 購入履歴を「見る」ための集計。保存データは変えず、画面の絞り込みだけを返す。
export const PERIODS = [
  { id: 'month', name: '今月' },
  { id: 'last', name: '先月' },
  { id: 'all', name: 'すべて' },
];

export const DELETED_STORE = 'deleted:';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export function formatMark(n) {
  return `¥${Number(n).toLocaleString('en-US')}`;
}

export function linePrice(line) {
  return Number.isInteger(line?.price) && line.price >= 0 ? line.price : null;
}

export function displayName(line, goods) {
  if (!line || typeof line !== 'object') return '（名前なし）';
  const resolved = line.goodsId ? resolveGoods(goods, line.goodsId) : null;
  const name = String((resolved && resolved.name) || line.name || '').trim();
  return name || '（名前なし）';
}

export function itemKeyOf(line, goods) {
  const name = displayName(line, goods);
  const key = normalize(name);
  return key ? `name:${key}` : `line:${line?.id || ''}`;
}

export function storeLabel(stores, id) {
  const hit = (stores || []).find((s) => s && s.id === id);
  return hit?.name || '削除したお店';
}

export function formatPurchaseDate(date) {
  if (!isDate(date)) return '日付不明';
  const [y, m, d] = date.split('-').map(Number);
  const w = WEEK[new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日（${w}）`;
}

function monthKey(now, offset) {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}

export function periodMonth(period, now) {
  if (period === 'month') return monthKey(now, 0);
  if (period === 'last') return monthKey(now, -1);
  return null;
}

/** 日付・買った時刻・元の並びで、a が b より古ければ true。日付不明は日付のある行より古い。 */
export function earlierThan(a, b) {
  const aDate = isDate(a?.date) ? a.date : '';
  const bDate = isDate(b?.date) ? b.date : '';
  if (aDate !== bDate) {
    if (!aDate) return true;
    if (!bDate) return false;
    return aDate < bDate;
  }
  const at = typeof a?.boughtAt === 'string' ? a.boughtAt : '';
  const bt = typeof b?.boughtAt === 'string' ? b.boughtAt : '';
  if (at !== bt) return at < bt;
  return (a?.index ?? 0) < (b?.index ?? 0);
}

function byRecent(a, b) {
  if (earlierThan(a, b)) return 1;
  if (earlierThan(b, a)) return -1;
  return 0;
}

function addText(out, value) {
  if (typeof value === 'string' && value.trim()) out.push(value);
}

function searchTexts(line, goods) {
  const out = [];
  addText(out, displayName(line, goods));
  addText(out, line?.name);
  addText(out, line?.notation);
  const resolved = line?.goodsId ? resolveGoods(goods, line.goodsId) : null;
  const wanted = new Set();
  if (typeof line?.goodsId === 'string') wanted.add(line.goodsId);
  if (resolved?.id) {
    wanted.add(resolved.id);
    for (const g of goods || []) {
      if (g && resolveGoods(goods, g.id)?.id === resolved.id) wanted.add(g.id);
    }
  }
  for (const g of goods || []) {
    if (!g || !wanted.has(g.id)) continue;
    addText(out, g.name);
    for (const alias of g.aliases || []) addText(out, alias?.notation);
  }
  return out;
}

function decorate(history) {
  const goods = Array.isArray(history?.goods) ? history.goods : [];
  const lines = Array.isArray(history?.lines) ? history.lines : [];
  return lines.filter((line) => line && typeof line === 'object').map((line, index) => {
    const price = linePrice(line);
    const row = {
      id: typeof line.id === 'string' ? line.id : `line:${index}`,
      key: itemKeyOf(line, goods),
      name: displayName(line, goods),
      storeId: typeof line.storeId === 'string' ? line.storeId : '',
      date: isDate(line.date) ? line.date : null,
      boughtAt: typeof line.boughtAt === 'string' ? line.boughtAt : '',
      price,
      previous: null,
      index,
    };
    row.search = searchTexts(line, goods).map((text) => normalize(text)).join('\n');
    return row;
  });
}

function attachPrevious(rows) {
  const byKey = new Map();
  for (const row of rows) {
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(row);
  }
  for (const row of rows) {
    if (!isDate(row.date)) continue;
    let prev = null;
    for (const other of byKey.get(row.key)) {
      if (other === row || other.price == null || !isDate(other.date)) continue;
      if (!earlierThan(other, row)) continue;
      if (!prev || earlierThan(prev, other)) prev = other;
    }
    if (prev) row.previous = prev.price;
  }
}

export function storeChoices(rows, stores) {
  const present = new Set(rows.map((row) => row.storeId));
  const choices = [{ id: 'all', name: 'すべて' }];
  const known = new Set();
  for (const store of stores || []) {
    if (!store || typeof store.id !== 'string') continue;
    known.add(store.id);
    if (present.has(store.id)) choices.push({ id: store.id, name: store.name || store.id });
  }
  if ([...present].some((id) => !known.has(id))) choices.push({ id: DELETED_STORE, name: '削除したお店' });
  return choices;
}

function matchStore(row, storeId, stores) {
  if (!storeId || storeId === 'all') return true;
  if (storeId === DELETED_STORE) {
    const known = new Set((stores || []).filter((s) => s && typeof s.id === 'string').map((s) => s.id));
    return !known.has(row.storeId);
  }
  return row.storeId === storeId;
}

function matchPeriod(row, period, now) {
  const month = periodMonth(period, now);
  if (!month) return true;
  return isDate(row.date) && row.date.startsWith(`${month}-`);
}

function matchQuery(row, query) {
  const q = normalize(query);
  if (!q) return true;
  return row.search.includes(q);
}

function storeOrder(items, stores) {
  const ids = [];
  for (const store of stores || []) {
    if (store && items.some((item) => item.storeId === store.id)) ids.push(store.id);
  }
  for (const item of items) {
    if (!ids.includes(item.storeId)) ids.push(item.storeId);
  }
  return ids;
}

function storesLabel(items, stores) {
  const labels = [];
  for (const id of storeOrder(items, stores)) {
    const label = storeLabel(stores, id);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join('・');
}

function sumPriced(items) {
  const priced = items.filter((item) => item.price != null);
  return {
    total: priced.length ? priced.reduce((sum, item) => sum + item.price, 0) : null,
    missing: items.length - priced.length,
  };
}

export function conditionLabel(period, storeId, choices, query) {
  const periodLabel = PERIODS.find((p) => p.id === period)?.name || 'すべて';
  const storeName = storeId === 'all' ? 'すべてのお店' : (choices.find((c) => c.id === storeId)?.name || 'お店');
  let label = `${periodLabel}・${storeName}`;
  const q = String(query ?? '').trim();
  if (normalize(q)) label += `・「${q}」`;
  return label;
}

function publicRow(row, stores) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    storeId: row.storeId,
    storeName: storeLabel(stores, row.storeId),
    date: row.date,
    boughtAt: row.boughtAt,
    price: row.price,
    previous: row.previous,
  };
}

/**
 * 履歴を日付の新しい順にまとめる。
 * total は値段がある品だけの合計。1件も値段が無いときは null。該当0件の合計は 0。
 * previous は、同じ品のそれより古い購入のうち、値段があるいちばん新しいもの。
 */
export function purchaseView(history, stores, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const rows = decorate(history);
  attachPrevious(rows);
  const choices = storeChoices(rows, stores);
  const period = opts.period === 'month' || opts.period === 'last' ? opts.period : 'all';
  const storeId = choices.some((c) => c.id === opts.storeId) ? opts.storeId : 'all';
  const query = String(opts.query ?? '');
  const filtered = rows.filter((row) => matchStore(row, storeId, stores) && matchPeriod(row, period, now) && matchQuery(row, query));
  const groups = new Map();
  for (const row of filtered) {
    const key = row.date || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const days = [...groups.entries()].sort((a, b) => {
    if (!a[0]) return 1;
    if (!b[0]) return -1;
    return a[0] < b[0] ? 1 : -1;
  }).map(([date, items]) => {
    items.sort(byRecent);
    const sums = sumPriced(items);
    return {
      date: date || null,
      heading: formatPurchaseDate(date || null),
      storesLabel: storesLabel(items, stores),
      total: sums.total,
      missing: sums.missing,
      items: items.map((item) => publicRow(item, stores)),
    };
  });
  const sums = sumPriced(filtered);
  return {
    period,
    storeId,
    query,
    choices,
    condition: conditionLabel(period, storeId, choices, query),
    total: filtered.length === 0 ? 0 : sums.total,
    missing: sums.missing,
    matchCount: filtered.length,
    lineCount: rows.length,
    empty: rows.length === 0 ? 'none' : filtered.length === 0 ? 'filtered' : null,
    days,
  };
}

/** 同じ品（まとめ後の名前）の購入を新しい順に。最安は同額なら新しい方のお店。平均は四捨五入。 */
export function itemHistory(history, stores, key) {
  const rows = decorate(history).filter((row) => row.key === key).sort(byRecent);
  if (!rows.length) return null;
  const priced = rows.filter((row) => row.price != null);
  let stats = null;
  if (priced.length) {
    let best = priced[0];
    for (const row of priced.slice(1)) {
      if (row.price < best.price || (row.price === best.price && earlierThan(best, row))) best = row;
    }
    const sum = priced.reduce((total, row) => total + row.price, 0);
    stats = { min: best.price, storeName: storeLabel(stores, best.storeId), avg: Math.round(sum / priced.length) };
  }
  return {
    key,
    name: rows[0].name,
    stats,
    rows: rows.map((row) => publicRow(row, stores)),
  };
}
