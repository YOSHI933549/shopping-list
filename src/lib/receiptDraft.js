import { normalize } from './categorize.js';
import { daysBefore, isDate } from './history.js';
import { formatYen, MAX_PRICE } from './price.js';

// 確認画面の下書き。品名は normalize 後の完全一致と、手で選んだ名前だけを使う。
// あいまいな一致ではまとめない。別名を覚える処理はここではしない。

export const EXPORT_NUDGE_DAYS = 30;
export const EXPORT_NUDGE_COUNT = 8;

/** キーボードに隠れる高さ（px）。レイアウトが縮んだときは 0。 */
export function keyboardInset(innerHeight, viewHeight, offsetTop = 0) {
  const h = Number(innerHeight);
  const v = Number(viewHeight);
  const o = Number(offsetTop) || 0;
  if (!Number.isFinite(h) || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(h - v - o));
}

/** 金額・数量の入力。negative のときだけマイナスを許す。空は null。 */
export function readYen(value, { negative = false } = {}) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || Math.abs(value) > MAX_PRICE) return null;
    if (!negative && value < 0) return null;
    return value;
  }
  const s = String(value).normalize('NFKC').replace(/[¥￥円,\s、，]/g, '').replace(/[−ー―]/g, '-');
  const ok = negative ? /^-?\d+$/.test(s) : /^\d+$/.test(s);
  if (!ok) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || Math.abs(n) > MAX_PRICE) return null;
  return n;
}

/** 店名の文字がレシート本文に含まれるお店。長い名前を先にする。未設定は出さない。 */
export function suggestStores(stores, text) {
  const hay = normalize(text);
  if (!hay) return [];
  const hits = [];
  for (const s of stores || []) {
    if (!s || s.id === 'unset' || typeof s.name !== 'string') continue;
    const name = normalize(s.name);
    if (name.length < 2) continue;
    if (hay.includes(name)) hits.push(s);
  }
  hits.sort((a, b) => normalize(b.name).length - normalize(a.name).length || String(a.name).localeCompare(String(b.name), 'ja'));
  return hits;
}

/** 手で選ぶときの品名。同じお店を先に、normalize で同じものは一つ。 */
export function productChoices(state, storeId) {
  const seen = new Set();
  const out = [];
  const push = (name) => {
    const n = String(name ?? '').trim();
    const key = normalize(n);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  const pools = [state?.items, state?.bought, state?.regulars, state?.history?.lines];
  for (const list of pools) {
    for (const row of list || []) if (row && row.storeId === storeId) push(row.name);
  }
  for (const list of pools) {
    for (const row of list || []) if (row) push(row.name);
  }
  return out;
}

/** normalize 後の完全一致だけ。無ければ null。部分一致では選ばない。 */
export function existingName(state, storeId, parsedName) {
  const want = normalize(parsedName);
  if (!want) return null;
  return productChoices(state, storeId).find((name) => normalize(name) === want) || null;
}

function lineKey(kind, index) {
  return `${kind}-${index}`;
}

/** parseReceipt の結果を、確認画面で直す下書きにする。 */
export function buildReceiptDraft(parsed, state, today) {
  const text = parsed?.text || '';
  const suggestions = suggestStores(state?.stores, text);
  const last = state?.settings?.lastStoreId;
  const known = new Set((state?.stores || []).map((s) => s.id));
  const storeId = suggestions[0]?.id || (last && last !== 'unset' && known.has(last) ? last : '');
  const lines = [];
  (parsed?.items || []).forEach((item, index) => {
    const parsedName = typeof item.name === 'string' ? item.name : '';
    const exact = existingName(state, storeId, parsedName);
    const quantity = item.quantity || 1;
    const unitPrice = Number.isInteger(item.unitPrice) ? item.unitPrice : null;
    const discount = Number.isInteger(item.discount) ? item.discount : 0;
    const amount = Number.isInteger(item.amount) ? item.amount : null;
    const formula = unitPrice == null ? null : unitPrice * quantity - discount;
    lines.push({
      key: lineKey('item', index),
      kind: 'item',
      raw: typeof item.raw === 'string' ? item.raw : '',
      parsedName,
      name: exact || parsedName,
      nameTouched: false,
      quantity,
      unitPrice,
      amount,
      discount,
      amountTouched: formula != null && formula !== amount,
      volumeMl: item.volumeMl ?? null,
      packCount: item.packCount ?? null,
      packUnit: item.packUnit ?? null,
    });
  });
  (parsed?.unknown || []).forEach((row, index) => {
    lines.push({ key: lineKey('unknown', index), kind: 'unknown', raw: typeof row?.raw === 'string' ? row.raw : '' });
  });
  return {
    storeId,
    suggestedIds: suggestions.map((s) => s.id),
    date: parsed?.date || today,
    time: parsed?.time || null,
    total: Number.isInteger(parsed?.total) ? parsed.total : null,
    tax: parsed?.tax === '税込' || parsed?.tax === '税抜' ? parsed.tax : '不明',
    text,
    lines,
  };
}

/** 店を変えたとき、まだ手で直していない行だけ完全一致を付け直す。 */
export function namesForStore(draft, state, storeId) {
  return {
    ...draft,
    storeId,
    lines: (draft.lines || []).map((line) => {
      if (!line || line.kind !== 'item' || line.nameTouched) return line;
      const exact = existingName(state, storeId, line.parsedName);
      return { ...line, name: exact || line.parsedName };
    }),
  };
}

/** 行の入力。数量・単価・割引を変えて、金額をまだ直していなければ金額を計算し直す。 */
export function editLine(line, field, value) {
  if (!line || line.kind !== 'item') return line;
  const next = { ...line, [field]: value };
  if (field === 'name') next.nameTouched = true;
  if (field === 'amount') {
    next.amountTouched = true;
    return next;
  }
  if (next.amountTouched) return next;
  const qty = readYen(next.quantity);
  const unit = readYen(next.unitPrice);
  const disc = readYen(next.discount) ?? 0;
  if (qty != null && qty > 0 && unit != null) next.amount = unit * qty - disc;
  return next;
}

export function draftSum(lines) {
  let sum = 0;
  for (const line of lines || []) {
    if (!line || line.kind === 'unknown') continue;
    const n = readYen(line.amount, { negative: true });
    if (n != null) sum += n;
  }
  return sum;
}

/** 明細の合計と印字の合計。合わないときの文言は色を変えない前提で、文だけ返す。 */
export function describeTotals(sum, total) {
  const safeSum = Number.isInteger(sum) ? sum : 0;
  if (!Number.isInteger(total)) return { sum: safeSum, total: null, difference: null, matches: null, note: '' };
  const difference = Math.abs(total - safeSum);
  const matches = difference === 0;
  return {
    sum: safeSum,
    total,
    difference,
    matches,
    note: matches ? '一致' : `合計と${difference}円ずれています`,
  };
}

export function totalsLabel(draft) {
  const t = describeTotals(draftSum(draft?.lines), Number.isInteger(draft?.total) ? draft.total : null);
  const right = t.total == null ? 'レシートの合計は読めませんでした' : `レシートの合計 ${formatYen(t.total)}`;
  return { ...t, line: `明細の合計 ${formatYen(t.sum)} ／ ${right}` };
}

/**
 * 前回の書き出しから日数と枚数が両方たまったときだけ文を返す。
 * どちらかが足りない、書き出し直後、枚数が少ないときは null。
 */
export function exportNudge(state, now = new Date()) {
  const receipts = (state?.history?.receipts || []).filter((r) => r && typeof r === 'object');
  const lastAt = state?.settings?.lastExportAt;
  const lastDate = state?.settings?.lastExportDate;
  if (typeof lastAt === 'string' && isDate(lastDate)) {
    const days = daysBefore(lastDate, now);
    const count = receipts.filter((r) => typeof r.savedAt === 'string' && r.savedAt > lastAt).length;
    if (days >= EXPORT_NUDGE_DAYS && count >= EXPORT_NUDGE_COUNT) {
      return { days, count, message: `前回の書き出しから${days}日、レシート${count}枚ぶんたまっています` };
    }
    return null;
  }
  if (receipts.length < EXPORT_NUDGE_COUNT) return null;
  const dates = receipts.map((r) => r.date).filter(isDate).sort();
  if (!dates.length) return null;
  const days = daysBefore(dates[0], now);
  if (days < EXPORT_NUDGE_DAYS) return null;
  return { days, count: receipts.length, message: `最初のレシートから${days}日、レシート${receipts.length}枚ぶんたまっています` };
}
