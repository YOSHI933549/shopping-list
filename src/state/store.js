import { parsePrice, priceKey } from '../lib/price.js';
import { normalize } from '../lib/categorize.js';
import { assignGoods, mergeGoods, splitGoods } from '../lib/goods.js';
import { stripSensitiveLines } from '../lib/receipt.js';
import { readYen } from '../lib/receiptDraft.js';
import {
  HISTORY_KEY, HISTORY_VERSION, emptyHistory, copyPlain, sanitizeHistory, migratePurchases, unionHistory,
  appendPurchase, dropPurchase, priceFromLines, isDate, removeHistoryLine, clearHistoryRecords,
} from '../lib/history.js';

// 状態の純粋な操作 + localStorage への保存。操作関数は新しい state を返す（元は変更しない）。
export const STORAGE_KEY = 'kaimono-list-v1';
export { HISTORY_KEY };
export const UNSET_ID = 'unset';
export const VERSION = 1;

export const DEFAULT_STORES = [
  { id: 'amazon', name: 'Amazon' },
  { id: 'aeon', name: 'イオン' },
  { id: 'matsukiyo', name: 'マツキヨ' },
  { id: UNSET_ID, name: '未設定' },
];

export function initialState() {
  return {
    version: VERSION,
    stores: DEFAULT_STORES.map((s) => ({ ...s })),
    items: [],
    bought: [],
    regulars: [],
    priceBook: {},
    history: emptyHistory(),
    settings: { aisleOrder: false, lastStoreId: UNSET_ID },
  };
}

let seq = 0;
export function newId() {
  seq += 1;
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + seq.toString(36);
}

/** ローカル日付 YYYY-MM-DD */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function storeName(state, id) {
  return (state.stores.find((s) => s.id === id) || state.stores.find((s) => s.id === UNSET_ID) || { name: '未設定' }).name;
}

// ---- 品物 ----
export function addItem(state, { name, storeId, memo = '', price = null }, now = new Date()) {
  const n = String(name ?? '').trim();
  if (!n) return { state, item: null };
  const sid = state.stores.some((s) => s.id === storeId) ? storeId : UNSET_ID;
  const item = { id: newId(), name: n, storeId: sid, memo: String(memo ?? '').trim(), price: parsePrice(price).value ?? null, addedAt: now.toISOString() };
  return { state: { ...state, items: [...state.items, item] }, item };
}

export function removeItem(state, id) {
  return { ...state, items: state.items.filter((i) => i.id !== id) };
}

/** 消した品を、元の位置へ戻す。同じ id が既にあれば何もしない。 */
export function insertItem(state, item, index) {
  if (!item || typeof item.id !== 'string' || state.items.some((i) => i.id === item.id)) return state;
  const items = state.items.slice();
  const at = Number.isInteger(index) ? Math.max(0, Math.min(index, items.length)) : items.length;
  items.splice(at, 0, item);
  return { ...state, items };
}

/** 買い物リストの品をすべて外す。チェック済み・履歴・定期購入品は残す。 */
export function clearItems(state) {
  if (!state.items.length) return state;
  return { ...state, items: [] };
}

/** チェック → 買い物リストから「今日買ったもの」へ。明細にも1件残す（30日では消えない）。 */
export function checkItem(state, id, now = new Date()) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return state;
  const ready = migratePurchases(state);
  const b = { ...item, boughtAt: now.toISOString(), boughtDate: localDate(now) };
  const priced = recordPrice(ready, item);
  const { id: itemId, name, storeId, memo, price, ...rest } = item;
  const history = appendPurchase(priced.history, {
    ...copyPlain(rest),
    id: newId(),
    itemId,
    name,
    storeId,
    date: b.boughtDate,
    boughtAt: b.boughtAt,
    price: Number.isInteger(price) ? price : null,
    memo: typeof memo === 'string' ? memo : '',
    source: 'check',
  });
  return { ...priced, history, items: state.items.filter((i) => i.id !== id), bought: [...state.bought, b] };
}

/** 値段を変更する（null で値段なし）。不正な値は無視。 */
export function setItemPrice(state, id, price) {
  const p = parsePrice(price);
  if (!p.ok || !state.items.some((i) => i.id === id)) return state;
  return { ...state, items: state.items.map((i) => (i.id === id ? { ...i, price: p.value } : i)) };
}

/** 値段付きの品物なら priceBook（お店×商品名）に記録する。購入（チェック）時に呼ぶ。 */
export function recordPrice(state, item) {
  if (!Number.isInteger(item.price)) return state;
  return { ...state, priceBook: { ...state.priceBook, [priceKey(item.storeId, item.name)]: item.price } };
}

/** 前回の値段。なければ null。 */
export function lastPrice(state, storeId, name) {
  const v = state.priceBook?.[priceKey(storeId, name)];
  return Number.isInteger(v) ? v : null;
}

/** 戻す。対応する明細も外し、値段メモは残った明細から付け直す。 */
export function undoBought(state, id) {
  const ready = migratePurchases(state);
  const b = ready.bought.find((i) => i.id === id);
  if (!b) return state;
  const { boughtAt, boughtDate, ...item } = b;
  const dropped = dropPurchase(ready.history, id);
  let priceBook = state.priceBook;
  if (dropped.removed) {
    const price = priceFromLines(dropped.history.lines, item.storeId, item.name);
    priceBook = { ...(state.priceBook || {}) };
    const key = priceKey(item.storeId, item.name);
    if (price == null) delete priceBook[key];
    else priceBook[key] = price;
  }
  return { ...ready, bought: ready.bought.filter((i) => i.id !== id), items: [...ready.items, item], history: dropped.history, priceBook };
}

export function boughtToday(state, now = new Date()) {
  const today = localDate(now);
  return state.bought.filter((b) => b.boughtDate === today);
}

/** 今日チェックした品を「今日買ったもの」から外す。購入履歴と値段メモは残す。 */
export function clearBoughtToday(state, now = new Date()) {
  const today = localDate(now);
  const bought = state.bought.filter((b) => b.boughtDate !== today);
  if (bought.length === state.bought.length) return state;
  return { ...state, bought };
}

function boughtIdsCoveredBy(state, line) {
  if (!line || !isDate(line.date) || typeof line.storeId !== 'string' || typeof line.name !== 'string') return [];
  const norm = normalize(line.name);
  return (state.bought || [])
    .filter((b) => b && typeof b.id === 'string' && b.storeId === line.storeId && b.boughtDate === line.date && normalize(b.name) === norm)
    .map((b) => b.id);
}

function priceKeysToSuppress(lines, priceBook, storeId, name) {
  if (typeof storeId !== 'string' || typeof name !== 'string') return [];
  const key = priceKey(storeId, name);
  const price = priceBook?.[key];
  if (!Number.isInteger(price) || price < 0) return [];
  const norm = normalize(name);
  const remains = (lines || []).some((l) => l && l.storeId === storeId && normalize(l.name) === norm && l.price === price);
  return remains ? [] : [key];
}

/** 購入履歴を1件消す。品名のまとめ（別名）と値段メモは残す。 */
export function removePurchase(state, lineId) {
  const ready = migratePurchases(state);
  const line = ready.history.lines.find((l) => l.id === lineId);
  if (!line) return ready;
  const linesAfter = ready.history.lines.filter((l) => l.id !== lineId);
  const history = removeHistoryLine(ready.history, lineId, {
    itemIds: boughtIdsCoveredBy(ready, line),
    prices: priceKeysToSuppress(linesAfter, ready.priceBook, line.storeId, line.name),
  });
  return { ...ready, history };
}

/** 購入履歴をすべて消す。品名のまとめ（別名・名前の学習）と値段メモは残す。 */
export function clearPurchases(state) {
  const ready = migratePurchases(state);
  const itemIds = (ready.bought || []).map((b) => b && b.id).filter((id) => typeof id === 'string' && id);
  const prices = Object.entries(ready.priceBook || {})
    .filter(([, v]) => Number.isInteger(v) && v >= 0)
    .map(([k]) => k);
  return { ...ready, history: clearHistoryRecords(ready.history, { itemIds, prices }) };
}

/** 古い購入履歴を捨てる（今日以外を残したいなら keepDays を使う）。 */
export function pruneBought(state, now = new Date(), keepDays = 30) {
  const limit = localDate(new Date(now.getTime() - keepDays * 86400000));
  return { ...state, bought: state.bought.filter((b) => b.boughtDate >= limit) };
}

// ---- お店 ----
export function addStore(state, name) {
  const n = String(name ?? '').trim();
  if (!n || state.stores.some((s) => s.name === n)) return { state, store: null };
  const store = { id: newId(), name: n };
  // 未設定は常に末尾
  const stores = state.stores.filter((s) => s.id !== UNSET_ID);
  const unset = state.stores.filter((s) => s.id === UNSET_ID);
  return { state: { ...state, stores: [...stores, store, ...unset] }, store };
}

export function renameStore(state, id, name) {
  const n = String(name ?? '').trim();
  if (!n || id === UNSET_ID || state.stores.some((s) => s.name === n && s.id !== id)) return state;
  return { ...state, stores: state.stores.map((s) => (s.id === id ? { ...s, name: n } : s)) };
}

/** お店を消す。そのお店の品物は未設定へ移る。 */
export function deleteStore(state, id) {
  if (id === UNSET_ID || !state.stores.some((s) => s.id === id)) return state;
  const mv = (x) => (x.storeId === id ? { ...x, storeId: UNSET_ID } : x);
  return {
    ...state,
    stores: state.stores.filter((s) => s.id !== id),
    items: state.items.map(mv),
    bought: state.bought.map(mv),
    regulars: state.regulars.map(mv),
    priceBook: Object.fromEntries(Object.entries(state.priceBook ?? {}).filter(([k]) => !k.startsWith(`${id}\u0000`))),
    settings: { ...state.settings, lastStoreId: state.settings.lastStoreId === id ? UNSET_ID : state.settings.lastStoreId },
  };
}

export function moveStore(state, id, dir) {
  const list = state.stores.filter((s) => s.id !== UNSET_ID);
  const i = list.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return state;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...state, stores: [...list, ...state.stores.filter((s) => s.id === UNSET_ID)] };
}

/** 初期のお店（Amazon/イオン/マツキヨ）のうち無いものを足す */
export function restoreDefaultStores(state) {
  const have = new Set(state.stores.map((s) => s.name));
  let st = state;
  for (const d of DEFAULT_STORES) {
    if (d.id === UNSET_ID || have.has(d.name) || st.stores.some((s) => s.id === d.id)) continue;
    st = addStore(st, d.name).state;
  }
  return st;
}

// ---- 定期購入品 ----
export function addRegular(state, { name, storeId, memo = '' }) {
  const n = String(name ?? '').trim();
  if (!n) return { state, regular: null };
  const sid = state.stores.some((s) => s.id === storeId) ? storeId : UNSET_ID;
  const regular = { id: newId(), name: n, storeId: sid, memo: String(memo ?? '').trim() };
  return { state: { ...state, regulars: [...state.regulars, regular] }, regular };
}

export function removeRegular(state, id) {
  return { ...state, regulars: state.regulars.filter((r) => r.id !== id) };
}

/** 定期購入品をリストへ。同じ名前・同じお店がすでにあれば追加しない。 */
export function regularToList(state, id, now = new Date()) {
  const r = state.regulars.find((x) => x.id === id);
  if (!r) return { state, status: 'missing' };
  if (state.items.some((i) => i.name === r.name && i.storeId === r.storeId)) return { state, status: 'exists' };
  const res = addItem(state, r, now);
  return { state: res.state, status: 'added', item: res.item };
}

export function setSetting(state, key, value) {
  return { ...state, settings: { ...state.settings, [key]: value } };
}

/** 書き出しをした印。促しは、この日時よりあとで枚数と日数がたまったときだけ出す。 */
export function markExported(state, now = new Date()) {
  return setSetting(setSetting(state, 'lastExportAt', now.toISOString()), 'lastExportDate', localDate(now));
}

function bookPriceOf(qty, unitPrice, amount) {
  if (unitPrice != null && unitPrice >= 0) return unitPrice;
  if (qty === 1 && amount != null && amount >= 0) return amount;
  return null;
}

/**
 * 確認画面の下書きを、レシート1件と明細にして履歴に足す。
 * 入れ方はレシート（source: 'receipt'）。会員番号らしい行は保存前に落とす。
 * リストの同じお店・同じ品（normalize の完全一致）は買った扱いにする。
 * 同じ日に丸で押した同じ品は、その明細を外してレシートの行を正にする。
 */
export function saveReceipt(state, draft, now = new Date()) {
  const ready = migratePurchases(state);
  const storeId = draft?.storeId;
  if (typeof storeId !== 'string' || !storeId || storeId === UNSET_ID || !ready.stores.some((s) => s.id === storeId)) {
    return { state: ready, saved: false, reason: 'store' };
  }
  const date = isDate(draft.date) ? draft.date : localDate(now);
  const prepared = [];
  for (const line of draft.lines || []) {
    if (!line || line.kind === 'unknown') continue;
    const name = String(line.name ?? '').trim() || String(line.parsedName ?? '').trim();
    if (!name) continue;
    const quantity = readYen(line.quantity);
    if (line.quantity != null && line.quantity !== '' && quantity == null) return { state: ready, saved: false, reason: 'line' };
    const qty = quantity == null ? 1 : quantity;
    if (qty < 1) return { state: ready, saved: false, reason: 'line' };
    const unitPrice = readYen(line.unitPrice);
    if (line.unitPrice != null && line.unitPrice !== '' && unitPrice == null) return { state: ready, saved: false, reason: 'line' };
    const discountRaw = readYen(line.discount);
    if (line.discount != null && line.discount !== '' && discountRaw == null) return { state: ready, saved: false, reason: 'line' };
    const discount = discountRaw == null ? 0 : discountRaw;
    const amount = readYen(line.amount, { negative: true });
    if (amount == null) return { state: ready, saved: false, reason: 'line' };
    prepared.push({ line, name, qty, unitPrice, discount, amount });
  }
  if (!prepared.length) return { state: ready, saved: false, reason: 'empty' };

  const filed = assignGoods(ready.history, prepared.map((row) => {
    const typed = String(row.line.name ?? '').trim();
    return {
      name: typed || row.name,
      notation: row.line.notation || '',
      storeId,
      goodsId: typed ? (row.line.goodsId || null) : null,
    };
  }), newId);
  prepared.forEach((row, i) => {
    row.name = filed.rows[i].name || row.name;
    row.goodsId = filed.rows[i].goodsId;
  });

  const receiptId = newId();
  const savedAt = now.toISOString();
  const time = typeof draft.time === 'string' && /^\d{2}:\d{2}$/.test(draft.time) ? draft.time : null;
  const total = Number.isInteger(draft.total) ? draft.total : null;
  const tax = draft.tax === '税込' || draft.tax === '税抜' || draft.tax === '不明' ? draft.tax : '不明';
  const receipt = {
    id: receiptId,
    storeId,
    date,
    time,
    total,
    tax,
    source: 'receipt',
    text: stripSensitiveLines(draft.text || ''),
    savedAt,
  };

  let historyLines = filed.history.lines.slice();
  let items = ready.items.slice();
  let bought = ready.bought.slice();
  const priceBook = { ...(ready.priceBook || {}) };
  const added = [];

  for (const row of prepared) {
    const norm = normalize(row.name);
    historyLines = historyLines.filter((l) => {
      if (l.source !== 'check' || l.storeId !== storeId || l.date !== date) return true;
      return normalize(l.name) !== norm;
    });
    const bookPrice = bookPriceOf(row.qty, row.unitPrice, row.amount);
    const matches = items.filter((i) => i.storeId === storeId && normalize(i.name) === norm);
    for (const item of matches) {
      const price = bookPrice != null ? bookPrice : (Number.isInteger(item.price) && item.price >= 0 ? item.price : null);
      bought.push({ ...item, price, boughtAt: savedAt, boughtDate: date });
      if (price != null) priceBook[priceKey(storeId, item.name)] = price;
    }
    if (matches.length) {
      const ids = new Set(matches.map((i) => i.id));
      items = items.filter((i) => !ids.has(i.id));
    }
    if (bookPrice != null) priceBook[priceKey(storeId, row.name)] = bookPrice;
    bought = bought.map((b) => {
      if (b.storeId !== storeId || b.boughtDate !== date || normalize(b.name) !== norm || bookPrice == null) return b;
      return { ...b, price: bookPrice };
    });
    added.push({
      id: newId(),
      receiptId,
      itemId: null,
      name: row.name,
      raw: typeof row.line.raw === 'string' ? row.line.raw : '',
      storeId,
      date,
      boughtAt: savedAt,
      price: bookPrice != null ? bookPrice : (row.amount >= 0 ? row.amount : null),
      unitPrice: row.unitPrice,
      quantity: row.qty,
      discount: row.discount,
      amount: row.amount,
      volumeMl: row.line.volumeMl ?? null,
      weightG: Number.isInteger(row.line.weightG) ? row.line.weightG : null,
      packCount: row.line.packCount ?? null,
      packUnit: row.line.packUnit ?? null,
      notation: typeof row.line.notation === 'string' ? row.line.notation : '',
      label: typeof row.line.label === 'string' ? row.line.label : '',
      goodsId: row.goodsId || null,
      memo: '',
      source: 'receipt',
    });
  }

  const next = {
    ...ready,
    items,
    bought,
    priceBook,
    history: { ...filed.history, version: HISTORY_VERSION, receipts: [...(filed.history.receipts || []), receipt], lines: [...historyLines, ...added] },
    settings: { ...ready.settings, lastStoreId: storeId },
  };
  return { state: next, saved: true, receipt };
}

/** 履歴の品を別の品へまとめる。明細の元の表記は残す。 */
export function mergeProducts(state, sourceId, targetId) {
  const ready = migratePurchases(state);
  return { ...ready, history: mergeGoods(ready.history, sourceId, targetId, newId) };
}

/** まとめた品を分けて、元の品名に戻す。 */
export function splitProducts(state, sourceId) {
  const ready = migratePurchases(state);
  return { ...ready, history: splitGoods(ready.history, sourceId) };
}

// ---- 検証・読み込み・書き出し ----
const isStr = (v) => typeof v === 'string';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** 取り込み用の検証。OK なら { ok:true, state }（整形済み）、NG なら { ok:false, error }。 */
export function validateState(data) {
  if (!isObj(data)) return { ok: false, error: 'データの形式が正しくありません' };
  if (data.version !== VERSION) return { ok: false, error: `対応していないバージョンです (${data.version})` };
  for (const k of ['stores', 'items', 'bought', 'regulars']) {
    if (!Array.isArray(data[k])) return { ok: false, error: `${k} がありません` };
  }
  if (!data.stores.every((s) => isObj(s) && isStr(s.id) && isStr(s.name) && s.name.trim())) return { ok: false, error: 'stores が正しくありません' };
  const ids = new Set(data.stores.map((s) => s.id));
  if (ids.size !== data.stores.length) return { ok: false, error: 'stores の id が重複しています' };
  const okItem = (i) => isObj(i) && isStr(i.id) && isStr(i.name) && i.name.trim() && isStr(i.storeId);
  if (!data.items.every(okItem)) return { ok: false, error: 'items が正しくありません' };
  if (!data.bought.every((b) => okItem(b) && isStr(b.boughtDate))) return { ok: false, error: 'bought が正しくありません' };
  if (!data.regulars.every(okItem)) return { ok: false, error: 'regulars が正しくありません' };
  const settings = isObj(data.settings) ? data.settings : {};
  let stores = data.stores.map((s) => ({ ...copyPlain(s), id: s.id, name: s.name }));
  if (!ids.has(UNSET_ID)) stores = [...stores, { id: UNSET_ID, name: '未設定' }];
  const fixPrice = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  // priceBook は v1 の旧データには無い。無ければ空で補い、あれば不正な値だけ捨てる
  const priceBook = Object.fromEntries(
    Object.entries(isObj(data.priceBook) ? data.priceBook : {}).filter(([, v]) => Number.isInteger(v) && v >= 0),
  );
  const fix = (x) => ({ ...copyPlain(x), price: fixPrice(x.price), memo: isStr(x.memo) ? x.memo : '', storeId: ids.has(x.storeId) || x.storeId === UNSET_ID ? x.storeId : UNSET_ID });
  // 知っている項目だけを組み立て直すと、将来足した項目が書き出し→取り込みで消える。未知の項目は残す。
  const state = {
    ...copyPlain(data),
    version: VERSION,
    stores,
    items: data.items.map(fix),
    bought: data.bought.map(fix),
    regulars: data.regulars.map(fix),
    priceBook,
    history: sanitizeHistory(data.history),
    settings: { ...copyPlain(settings), aisleOrder: !!settings.aisleOrder, lastStoreId: isStr(settings.lastStoreId) ? settings.lastStoreId : UNSET_ID },
  };
  return { ok: true, state };
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON として読めませんでした' };
  }
  const r = validateState(data);
  if (!r.ok) return r;
  return { ok: true, state: migratePurchases(r.state) };
}

/** テキストを状態にする。保存場所は触らない。無いデータは初期状態。 */
export function parseStored(text) {
  if (text == null) return { ok: true, state: initialState() };
  return importJSON(text);
}

function trySet(storage, key, value) {
  try {
    if (typeof storage?.setItem !== 'function') return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 読めなかった文字列を別キーへ残す。同じ文字列は二重に足さない。元のキーは消さない。 */
export function quarantineRaw(storage, storageKey, raw) {
  const qKey = `${storageKey}-unreadable`;
  let entries = [];
  try {
    const cur = storage.getItem(qKey);
    if (cur) {
      try {
        const parsed = JSON.parse(cur);
        if (Array.isArray(parsed?.entries)) entries = parsed.entries.filter((e) => e && typeof e.raw === 'string');
        else if (typeof parsed?.raw === 'string') entries = [{ savedAt: parsed.savedAt || null, raw: parsed.raw }];
        else entries = [{ savedAt: null, raw: cur }];
      } catch {
        entries = [{ savedAt: null, raw: cur }];
      }
    }
  } catch {
    return false;
  }
  if (!entries.some((e) => e.raw === raw)) entries.push({ savedAt: new Date().toISOString(), raw });
  return trySet(storage, qKey, JSON.stringify({ entries }));
}

function failList(reason, preserved, raw) {
  return { state: initialState(), problem: { scope: 'list', reason, preserved, raw } };
}

/** 別キーの履歴を合流し、bought と priceBook を明細へ移す。リストのキーは書き換えない。 */
function attachHistory(state, storage) {
  let histText = null;
  let histReadError = false;
  try {
    histText = storage.getItem(HISTORY_KEY);
  } catch {
    histReadError = true;
  }
  let problem = null;
  let history = state.history;
  if (histReadError) {
    problem = { scope: 'history', reason: 'unavailable', preserved: false, raw: null };
  } else if (histText != null) {
    try {
      const parsed = JSON.parse(histText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        const preserved = quarantineRaw(storage, HISTORY_KEY, histText);
        problem = { scope: 'history', reason: 'shape', preserved, raw: histText };
      } else {
        history = unionHistory(state.history, parsed);
      }
    } catch {
      const preserved = quarantineRaw(storage, HISTORY_KEY, histText);
      problem = { scope: 'history', reason: 'json', preserved, raw: histText };
    }
  }
  const migrated = migratePurchases({ ...state, history });
  if (!problem) trySet(storage, HISTORY_KEY, JSON.stringify(migrated.history));
  return { state: migrated, problem };
}

/**
 * 保存データを読む。
 * 読めないときは初期状態で黙って上書きせず、元の文字列を別キーへ退避して problem を返す。
 * データが無いときだけ problem は null。
 */
export function load(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') return failList('unavailable', false, null);
  let text;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return failList('unavailable', false, null);
  }
  if (text == null) return attachHistory(initialState(), storage);
  const parsed = importJSON(text);
  if (!parsed.ok) {
    const preserved = quarantineRaw(storage, STORAGE_KEY, text);
    // リストが読めなくても、別キーの購入履歴は読み、空のリストで上書きしない。
    const kept = attachHistory(initialState(), storage);
    return { state: kept.state, problem: { scope: 'list', reason: parsed.error, preserved, raw: text } };
  }
  return attachHistory(parsed.state, storage);
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    storage.setItem(HISTORY_KEY, JSON.stringify(state.history ?? emptyHistory()));
    return true;
  } catch {
    return false;
  }
}

export { migratePurchases };
