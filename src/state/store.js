import { parsePrice, priceKey } from '../lib/price.js';

// 状態の純粋な操作 + localStorage への保存。操作関数は新しい state を返す（元は変更しない）。
export const STORAGE_KEY = 'kaimono-list-v1';
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

/** チェック → 買い物リストから「今日買ったもの」へ */
export function checkItem(state, id, now = new Date()) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return state;
  const b = { ...item, boughtAt: now.toISOString(), boughtDate: localDate(now) };
  return { ...recordPrice(state, item), items: state.items.filter((i) => i.id !== id), bought: [...state.bought, b] };
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

/** 戻す */
export function undoBought(state, id) {
  const b = state.bought.find((i) => i.id === id);
  if (!b) return state;
  const { boughtAt, boughtDate, ...item } = b;
  return { ...state, bought: state.bought.filter((i) => i.id !== id), items: [...state.items, item] };
}

export function boughtToday(state, now = new Date()) {
  const today = localDate(now);
  return state.bought.filter((b) => b.boughtDate === today);
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
  let stores = data.stores.map((s) => ({ id: s.id, name: s.name }));
  if (!ids.has(UNSET_ID)) stores = [...stores, { id: UNSET_ID, name: '未設定' }];
  const fixPrice = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  // priceBook は v1 の旧データには無い。無ければ空で補い、あれば不正な値だけ捨てる
  const priceBook = Object.fromEntries(
    Object.entries(isObj(data.priceBook) ? data.priceBook : {}).filter(([, v]) => Number.isInteger(v) && v >= 0),
  );
  const fix = (x) => ({ ...x, price: fixPrice(x.price), memo: isStr(x.memo) ? x.memo : '', storeId: ids.has(x.storeId) || x.storeId === UNSET_ID ? x.storeId : UNSET_ID });
  const state = {
    version: VERSION,
    stores,
    items: data.items.map(fix),
    bought: data.bought.map(fix),
    regulars: data.regulars.map(fix),
    priceBook,
    settings: { aisleOrder: !!settings.aisleOrder, lastStoreId: isStr(settings.lastStoreId) ? settings.lastStoreId : UNSET_ID },
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
  return validateState(data);
}

/** 壊れた/無い保存データは初期状態にフォールバック */
export function parseStored(text) {
  if (text == null) return initialState();
  const r = importJSON(text);
  return r.ok ? r.state : initialState();
}

export function load(storage = globalThis.localStorage) {
  try {
    return parseStored(storage.getItem(STORAGE_KEY));
  } catch {
    return initialState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
