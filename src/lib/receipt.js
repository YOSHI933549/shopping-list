import { normalize } from './categorize.js';
import { MAX_PRICE } from './price.js';

// レシートの貼り付け文字を、明細と合計の照合に分ける。
// 画面にも保存にも書かない。渡された文字列だけを見る（外には送らない）。
//
// 品名は categorize.normalize でそろえる。容量・重さ・個数・先頭の商品番号・税の印は品名から外す。
// 元の行は raw にそのまま残す。別名のキー（notation）は、容量や重さを残した元の表記を normalize したもの。
// 会員番号・カード番号・電話番号らしい行は明細に入れず、stripSensitiveLines で本文からも落とす。
// 品名の塊と金額の塊が別々に並ぶ列のずれは、順番で結び付けない（不明な行のまま返す）。

const TOTAL_LABELS = ['税込合計', '税抜合計', 'お買上げ金額', 'お買上金額', 'お買上げ合計', 'お買上合計', '合計金額', '総合計', 'ご請求額', '請求額', 'お会計', '御会計', '合計'];
const SUBTOTAL_LABELS = ['小計'];
const TAX_LABELS = ['内消費税等', '内消費税', '消費税等', '消費税', '外税額', '外税', '内税'];
const PAYMENT_LABELS = ['お預かり', 'お預り', 'お釣り', 'お釣', '釣銭', 'クレジットカード', 'クレジット', '商品券', '現計', '現金'];
const FIGURE = /^[0-9¥円%().\-内税外軽減込抜対象等消費税]*$/;
const STRONG_ID = /会員番号|会員\s*No\.?|メンバーズ?(?:番号|\s*No\.?)|カード番号|カード\s*No\.?|下\s*4\s*桁|下四桁|カード下|顧客番号|お客様番号|ポイントカード番号/i;

function toText(input) {
  if (input == null) return '';
  return String(input);
}

function prep(s) {
  let t = toText(s).normalize('NFKC').replace(/\u2212/g, '-').replace(/[▲△▼]/g, '-');
  let prev;
  do {
    prev = t;
    t = t.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  } while (t !== prev);
  return t;
}

function unwrap(compact) {
  return compact.replace(/^[()]+/, '').replace(/[()]+$/, '');
}

function matchesLabel(compact, labels) {
  const bare = unwrap(compact);
  const ordered = [...labels].sort((a, b) => b.length - a.length);
  for (const label of ordered) {
    if (!bare.startsWith(label)) continue;
    const rest = bare.slice(label.length);
    if (rest === '' || FIGURE.test(rest)) return true;
  }
  return false;
}

function lastAmount(s) {
  const nums = [];
  for (const m of s.matchAll(/(?:¥\s*)?(-?\d+)\s*(円|%|％)?/g)) {
    if (m[2] === '%' || m[2] === '％') continue;
    const n = Number(m[1]);
    if (Number.isInteger(n) && Math.abs(n) <= MAX_PRICE) nums.push(n);
  }
  return nums.length ? nums[nums.length - 1] : null;
}

function splitTotal(s) {
  const idx = s.search(/内消費税|消費税|内税|外税/);
  if (idx < 0) return { total: lastAmount(s), taxAmount: null };
  return { total: lastAmount(s.slice(0, idx)), taxAmount: lastAmount(s.slice(idx)) };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(y, m, d) {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (yy < 2000 || yy > 2099 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null;
  return `${yy}-${pad(mm)}-${pad(dd)}`;
}

/** 最初の日付。年が無い「11月11日」は null。 */
function findDate(s) {
  const text = prep(s);
  const patterns = [
    [/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/, (m) => ymd(m[1], m[2], m[3])],
    [/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/, (m) => ymd(2018 + Number(m[1]), m[2], m[3])],
    [/(?<![A-Za-z\d])R\.?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/, (m) => ymd(2018 + Number(m[1]), m[2], m[3])],
    [/(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/, (m) => ymd(m[1], m[2], m[3])],
  ];
  for (const [re, to] of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const date = to(m);
    if (date) return date;
  }
  return null;
}

/** 最初の時刻。秒は捨てて HH:MM。 */
function findTime(s) {
  const text = prep(s);
  const m = text.match(/(午前|午後)?\s*(?<!\d)(\d{1,2})\s*[:：時]\s*(\d{2})\s*分?(?!\d)/);
  if (!m) return null;
  let h = Number(m[2]);
  const min = Number(m[3]);
  if (min > 59 || h > 23) return null;
  if (m[1] === '午後' && h < 12) h += 12;
  if (m[1] === '午前' && h === 12) h = 0;
  if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

function isSeparator(s) {
  return /^[-ー―=_*＊※・.。~\s〜]{2,}$/.test(s);
}

function isGreeting(s) {
  const c = s.replace(/\s+/g, '');
  return /ありがとうございました|またのお越し|またのご来店|領収書|登録番号|インボイス|伝票番号/.test(c);
}

function isDateOrTimeLine(s) {
  const hasDateLike = findDate(s) || findTime(s) || /\d{1,2}\s*月\s*\d{1,2}\s*日/.test(s);
  if (!hasDateLike) return false;
  const rest = s
    .replace(/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/g, ' ')
    .replace(/令和\s*\d{1,2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/g, ' ')
    .replace(/R\.?\s*\d{1,2}[./-]\d{1,2}[./-]\d{1,2}/g, ' ')
    .replace(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/g, ' ')
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*日/g, ' ')
    .replace(/(?:午前|午後)?\s*\d{1,2}\s*[:：時]\s*\d{2}\s*分?/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/[月火水木金土日]曜?日?/g, ' ')
    .replace(/レジ|店番号?|No\.?|担当/gi, ' ')
    .replace(/[\d\s:：./\-]/g, '');
  return rest === '';
}

function isPhoneLine(s) {
  const compact = s.replace(/\s/g, '');
  if (/^0\d{1,4}-\d{1,4}-\d{3,4}$/.test(compact)) return true;
  const digits = s.replace(/\D/g, '');
  if (/^[\d\s\-‐()]+$/.test(s) && /^0\d{9,10}$/.test(digits)) return true;
  const phone = /0\d{1,4}[-‐\s]?\d{1,4}[-‐\s]?\d{3,4}/;
  if (!phone.test(s)) return false;
  return /TEL|Tel|tel|FAX|Fax|fax|℡|電話/.test(s);
}

function isCardLine(s) {
  const brand = /VISA|MASTER(?:CARD)?|JCB|AMEX|アメリカン|クレジット/i;
  const masked = /[*＊xX]{2,}\s*\d{3,4}/;
  const groups = /(?:\d{4}[\s-]?){3}\d{2,4}/;
  const maskedGroups = /(?:[*＊]{2,}[\s-]?){2,}[*＊]{0,4}\s*\d{3,4}/;
  if (maskedGroups.test(s)) return true;
  if (masked.test(s) && (brand.test(s) || /カード|下\s*4|下四/.test(s) || /^[\s*＊\d-]+$/.test(s))) return true;
  if (brand.test(s) && (masked.test(s) || groups.test(s) || /\d{12,}/.test(s.replace(/\D/g, '')))) return true;
  const compact = s.replace(/\s/g, '');
  if (/^[\d-]{14,19}$/.test(compact) && s.replace(/\D/g, '').length >= 14 && s.replace(/\D/g, '').length <= 16) return true;
  if (/^\d{4}-\d{4}-\d{4}$/.test(compact)) return true;
  return false;
}

/** 会員番号・カード番号・電話番号らしい行か。 */
function isSensitiveLine(line) {
  const s = prep(line).trim();
  if (!s) return false;
  if (STRONG_ID.test(s) && /\d{4,}/.test(s)) return true;
  if (/ポイントカード/i.test(s)) {
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 8 || /\d{4}\s*-\s*\d{4}/.test(s)) return true;
  }
  if (isPhoneLine(s) || isCardLine(s)) return true;
  return false;
}

/** 残す元の文字から、会員番号・カード番号・電話番号らしい行を落とす。 */
export function stripSensitiveLines(input) {
  const original = toText(input);
  const kept = original.split(/\r\n|\n|\r/).filter((line) => !isSensitiveLine(line));
  return kept.join('\n').replace(/^\n+|\n+$/g, '');
}

function isDiscountLabel(namePart) {
  const n = normalize(namePart).replace(/[()]/g, '');
  if (!n) return false;
  return /^(?:まとめ)?(?:値引|値引き|割引|割引き|値下|値下げ|ねびき|わりびき|ねさげ|くーぽん)(?:対象|額|分|等)?$/.test(n);
}

function extractVolume(s) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(ミリリットル|ml|mℓ|リットル|ℓ|l)(?![a-zA-Z])/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  const ml = unit === 'ml' || unit === 'mℓ' || unit === 'ミリリットル' ? Math.round(n) : Math.round(n * 1000);
  if (ml <= 0 || ml > 100000) return null;
  const rest = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return { ml, rest };
}

function extractWeight(s) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(キログラム|kg|グラム|g)(?![a-zA-Z])/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  const grams = unit === 'g' || unit === 'グラム' ? Math.round(n) : Math.round(n * 1000);
  if (grams <= 0 || grams > 100000) return null;
  const rest = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return { grams, rest };
}

/** 税の印・商品番号・末尾の ×数量を外した、容量つきの元の表記。 */
function notationSource(s) {
  let t = s.replace(/[×xX]\s*\d+\s*$/, '').trim();
  t = stripTaxMarks(t);
  t = stripProductCode(t);
  t = stripTaxMarks(t);
  t = stripProductCode(t);
  return t;
}

function packUnitOf(unit) {
  if (unit === '個' || unit === 'ヶ' || unit === 'ケ' || unit === 'コ') return 'コ';
  return unit;
}

function extractPack(s) {
  const re = /(\d+)\s*(コ|個|ヶ|ケ|本|袋|枚|包|箱)\s*入り?/;
  let m = s.match(re);
  if (!m) m = s.match(/(\d+)\s*(コ|個|ヶ|ケ|本|袋|枚|包|箱)\s*$/);
  if (!m) return null;
  const count = Number(m[1]);
  if (count <= 0 || count > 999) return null;
  const rest = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return { count, unit: packUnitOf(m[2]), rest };
}

function stripTaxMarks(s) {
  let t = s;
  t = t.replace(/[(]\s*(?:軽減税率|軽減|軽)\s*[)]/g, ' ');
  t = t.replace(/(?:^|\s)[*＊※#＃]+\s*/g, ' ');
  t = t.replace(/[*＊※#＃]+\s*$/g, ' ');
  t = t.replace(/(?:^|\s)軽(?:減税率|減)?(?=\s|$)/g, ' ');
  t = t.replace(/^[*＊※#＃]+/, '');
  t = t.replace(/^軽(?:減税率|減)?(?=[^\d\s])/u, '');
  t = t.replace(/[*＊※#＃]+$/g, '');
  t = t.replace(/軽$/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

function stripProductCode(s) {
  let t = s.trim();
  t = t.replace(/^(?:no\.?|商品番号|品番)\s*\d{1,14}\s*/i, '');
  t = t.replace(/^(?:\d{8}|\d{12,14})(?=\s|[^\d]|$)/, '');
  t = t.replace(/^\d{3,7}\s+(?=\S)/, '');
  return t.trim();
}

/** 品名から容量・重さ・個数・×数量・税の印・先頭の商品番号を外す。 */
export function cleanProductLabel(label) {
  let t = prep(label).trim();
  const notation = normalize(notationSource(t));
  let quantity = null;
  const times = t.match(/[×xX]\s*(\d+)\s*$/);
  if (times && (times.index > 0 || /^[×xX]/.test(t))) {
    const q = Number(times[1]);
    if (q > 0 && q < 1000) quantity = q;
    t = t.slice(0, times.index).trim();
  }
  let volumeMl = null;
  const vol = extractVolume(t);
  if (vol) {
    volumeMl = vol.ml;
    t = vol.rest;
  }
  let weightG = null;
  const weight = extractWeight(t);
  if (weight) {
    weightG = weight.grams;
    t = weight.rest;
  }
  let packCount = null;
  let packUnit = null;
  const pack = extractPack(t);
  if (pack) {
    packCount = pack.count;
    packUnit = pack.unit;
    t = pack.rest;
  }
  t = stripTaxMarks(t);
  t = stripProductCode(t);
  t = stripTaxMarks(t);
  t = stripProductCode(t);
  return { name: normalize(t), notation, quantity, volumeMl, weightG, packCount, packUnit };
}

function moneyValue(token) {
  if (!/^-?\d+$/.test(token)) return null;
  const n = Number(token);
  if (!Number.isInteger(n) || Math.abs(n) > MAX_PRICE) return null;
  return n;
}

function splitQtyPrice(s) {
  const at = s.match(/^(.*?)@\s*(\d+)\s*円?\s*[×xX*]\s*(\d+)\s*(?:個|コ|点|本|袋|枚|包|箱)?\s*(?:(\d+)\s*円?)?\s*$/);
  if (at) {
    const unitPrice = moneyValue(at[2]);
    const quantity = Number(at[3]);
    const printed = at[4] != null ? moneyValue(at[4]) : null;
    if (unitPrice == null || quantity <= 0 || quantity > 999) return null;
    const amount = printed != null ? printed : unitPrice * quantity;
    if (Math.abs(amount) > MAX_PRICE) return null;
    return { namePart: at[1].trim(), quantity, unitPrice, amount };
  }
  const yenFirst = s.match(/^(.*?)(?:¥\s*)?(\d+)\s*円\s*[×xX*]\s*(\d+)\s*(?:個|コ|点)?\s*(?:(\d+)\s*円?)?\s*$/);
  if (yenFirst) {
    const unitPrice = moneyValue(yenFirst[2]);
    const quantity = Number(yenFirst[3]);
    const printed = yenFirst[4] != null ? moneyValue(yenFirst[4]) : null;
    if (unitPrice != null && quantity > 0 && quantity <= 999) {
      const amount = printed != null ? printed : unitPrice * quantity;
      if (Math.abs(amount) <= MAX_PRICE) return { namePart: yenFirst[1].trim(), quantity, unitPrice, amount };
    }
  }
  const m = s.match(/^(.*?)(?:^|\s|(?<=[^\d]))(\d+)\s*(個|コ|点|ヶ|ケ|本|袋|枚|包|箱)?\s*[×xX*]\s*[¥]?\s*(\d+)\s*円?(?:\s+[¥]?\s*(\d+)\s*円?)?\s*$/);
  if (!m) return null;
  const quantity = Number(m[2]);
  const unitPrice = moneyValue(m[4]);
  const printed = m[5] != null ? moneyValue(m[5]) : null;
  if (unitPrice == null || quantity <= 0 || quantity > 999) return null;
  const amount = printed != null ? printed : unitPrice * quantity;
  if (Math.abs(amount) > MAX_PRICE) return null;
  return { namePart: m[1].trim(), quantity, unitPrice, amount };
}

function splitTrailingAmount(s) {
  const m = s.match(/^(.*?)(?:¥\s*)?(-?\d+)\s*円?\s*(?:[(]?(?:軽減|軽|内|外)[)]?)?\s*$/);
  if (!m) return null;
  const token = m[2];
  const amount = moneyValue(token);
  if (amount == null) return null;
  const digits = token.replace('-', '');
  let head = m[1];
  // 「1-2-3」のようにハイフンで続いている数字は金額ではない
  if (/-\s*$/.test(head)) return null;
  const separated = head === '' || /[\s¥*＊]$/.test(head);
  head = head.replace(/[¥\s*＊]+$/g, '').trim();
  if (/^[*＊※#＃]+$/.test(head)) head = '';
  if (!head) return { namePart: '', amount };
  // 「牛乳198」は金額。「12ab34」のように数字の混じった塊にくっついた数字は金額にしない
  if (!separated && (digits.length < 2 || /\d/.test(head))) return null;
  return { namePart: head, amount };
}

function finishItem({ raw, namePart, quantity, unitPrice, amount }) {
  const built = cleanProductLabel(namePart);
  if (!built.name) return null;
  const qty = quantity || built.quantity || 1;
  let unit = unitPrice;
  let amt = amount;
  if (amt == null && unit != null) amt = unit * qty;
  if (unit == null && amt != null && qty > 0 && amt % qty === 0) unit = amt / qty;
  if (!Number.isInteger(amt) || Math.abs(amt) > MAX_PRICE) return null;
  return {
    raw,
    label: namePart,
    name: built.name,
    notation: built.notation,
    quantity: qty,
    unitPrice: unit,
    amount: amt,
    discount: 0,
    volumeMl: built.volumeMl,
    weightG: built.weightG,
    packCount: built.packCount,
    packUnit: built.packUnit,
  };
}

function classify(rawLine) {
  const raw = String(rawLine);
  const s = prep(raw).trim();
  if (!s) return { kind: 'empty' };
  if (isSeparator(s) || isGreeting(s)) return { kind: 'skip' };
  if (isDateOrTimeLine(s)) return { kind: 'meta' };
  const compact = s.replace(/\s+/g, '');
  const bare = unwrap(compact);
  if (/^(?:税込|税込み|税抜|税抜き|内税|外税|非課税)$/.test(bare)) return { kind: 'skip' };
  if (/対象額|\d{1,2}%対象|軽減税率/.test(bare)) return { kind: 'skip' };
  if (matchesLabel(compact, SUBTOTAL_LABELS)) return { kind: 'subtotal', amount: lastAmount(s) };
  if (matchesLabel(compact, TAX_LABELS) && !bare.includes('合計')) return { kind: 'tax', amount: lastAmount(s) };
  if (matchesLabel(compact, TOTAL_LABELS) || /^計\d/.test(bare)) {
    const parts = splitTotal(s);
    return { kind: 'total', amount: parts.total, taxAmount: parts.taxAmount };
  }
  if (matchesLabel(compact, PAYMENT_LABELS)) return { kind: 'skip' };
  if (/^レジ\d+$/.test(bare)) return { kind: 'skip' };
  if (/^担当/.test(bare) && !/\d{2,}円?$/.test(bare)) return { kind: 'skip' };

  const qty = splitQtyPrice(s);
  if (qty) {
    if (!qty.namePart) return { kind: 'qtyPrice', raw, quantity: qty.quantity, unitPrice: qty.unitPrice, amount: qty.amount };
    if (isDiscountLabel(qty.namePart) || qty.amount < 0) return { kind: 'discount', raw, amount: qty.amount, namePart: qty.namePart };
    const item = finishItem({ raw, ...qty });
    if (!item) return { kind: 'unknown', raw };
    return { kind: 'item', item };
  }
  const money = splitTrailingAmount(s);
  if (money) {
    if (!money.namePart) {
      if (money.amount < 0) return { kind: 'discount', raw, amount: money.amount, namePart: '' };
      return { kind: 'amountOnly', raw, amount: money.amount };
    }
    if (isDiscountLabel(money.namePart) || money.amount < 0) return { kind: 'discount', raw, amount: money.amount, namePart: money.namePart };
    const item = finishItem({ raw, namePart: money.namePart, quantity: null, unitPrice: null, amount: money.amount });
    if (!item) return { kind: 'unknown', raw };
    return { kind: 'item', item };
  }
  if (/[A-Za-z\u3040-\u30FF\u4E00-\u9FFF]/.test(s)) return { kind: 'nameOnly', raw, namePart: s };
  return { kind: 'unknown', raw };
}

function nextIdx(list, i) {
  for (let j = i + 1; j < list.length; j++) {
    if (list[j].kind !== 'empty' && list[j].kind !== 'skip' && list[j].kind !== 'meta') return j;
  }
  return -1;
}

function prevIdx(list, i) {
  for (let j = i - 1; j >= 0; j--) {
    if (list[j].kind !== 'empty' && list[j].kind !== 'skip' && list[j].kind !== 'meta') return j;
  }
  return -1;
}

function isMoneyKind(line) {
  return line && (line.kind === 'amountOnly' || line.kind === 'qtyPrice');
}

function combine(nameLine, moneyLine) {
  if (moneyLine.kind === 'qtyPrice') {
    return finishItem({
      raw: `${nameLine.raw}\n${moneyLine.raw}`,
      namePart: nameLine.namePart,
      quantity: moneyLine.quantity,
      unitPrice: moneyLine.unitPrice,
      amount: moneyLine.amount,
    });
  }
  return finishItem({
    raw: `${nameLine.raw}\n${moneyLine.raw}`,
    namePart: nameLine.namePart,
    quantity: null,
    unitPrice: null,
    amount: moneyLine.amount,
  });
}

function attachDiscount(items, line) {
  const yen = Math.abs(line.amount);
  const prev = items[items.length - 1];
  if (prev && Number.isInteger(prev.amount)) {
    prev.discount += yen;
    prev.amount -= yen;
    return;
  }
  const name = normalize(line.namePart || '') || 'ねびき';
  items.push({
    raw: line.raw,
    name,
    quantity: 1,
    unitPrice: null,
    amount: -yen,
    discount: yen,
    volumeMl: null,
    weightG: null,
    packCount: null,
    packUnit: null,
    notation: '',
    label: line.namePart || '',
  });
}

function takeFollowingAmount(list, i, consumed) {
  const n = nextIdx(list, i);
  if (n < 0 || list[n].kind !== 'amountOnly') return null;
  consumed.add(n);
  return list[n].amount;
}

function emptyResult(text) {
  return {
    date: null,
    time: null,
    total: null,
    subtotal: null,
    tax: '不明',
    taxAmount: null,
    items: [],
    unknown: [],
    sum: 0,
    difference: null,
    matches: null,
    text,
  };
}

/**
 * レシートの文字を明細にする。
 * items[].amount は「単価 × 数量 − 割引」。割引行は直前の品に足す。
 * difference は印字の合計と明細の合計の差（絶対値）。合計が無いときは null。
 * matches は差が 0 のとき true。合計が無いときは null。
 */
export function parseReceipt(input) {
  const text = stripSensitiveLines(input);
  if (!text.trim()) return emptyResult(text.trim());
  const scanned = prep(text);
  const date = findDate(scanned);
  const time = findTime(scanned);
  const tax = detectTax(scanned);
  const list = text.split('\n').map(classify);
  const items = [];
  const unknown = [];
  const consumed = new Set();
  let total = null;
  let subtotal = null;
  let taxFromLines = 0;
  let sawTaxLine = false;
  let taxFromTotal = null;

  for (let i = 0; i < list.length; i++) {
    if (consumed.has(i)) continue;
    const line = list[i];
    if (line.kind === 'empty' || line.kind === 'skip' || line.kind === 'meta') continue;
    if (line.kind === 'subtotal') {
      const amount = line.amount != null ? line.amount : takeFollowingAmount(list, i, consumed);
      if (amount != null) subtotal = amount;
      continue;
    }
    if (line.kind === 'tax') {
      const amount = line.amount != null ? line.amount : takeFollowingAmount(list, i, consumed);
      if (amount != null) {
        taxFromLines += Math.abs(amount);
        sawTaxLine = true;
      }
      continue;
    }
    if (line.kind === 'total') {
      const amount = line.amount != null ? line.amount : takeFollowingAmount(list, i, consumed);
      if (amount != null) total = amount;
      if (line.taxAmount != null) taxFromTotal = line.taxAmount;
      continue;
    }
    if (line.kind === 'item') {
      items.push(line.item);
      continue;
    }
    if (line.kind === 'discount') {
      attachDiscount(items, line);
      continue;
    }
    if (line.kind === 'nameOnly' && isDiscountLabel(line.namePart)) {
      const n = nextIdx(list, i);
      const next = n >= 0 ? list[n] : null;
      const negative = next && (next.kind === 'discount' || (next.kind === 'amountOnly' && next.amount < 0));
      if (negative) {
        consumed.add(n);
        attachDiscount(items, { ...next, namePart: line.namePart, raw: `${line.raw}\n${next.raw}` });
        continue;
      }
    }
    if (line.kind === 'nameOnly') {
      const n = nextIdx(list, i);
      const a = n >= 0 ? nextIdx(list, n) : -1;
      const p = prevIdx(list, i);
      const next = n >= 0 ? list[n] : null;
      const after = a >= 0 ? list[a] : null;
      const prev = p >= 0 ? list[p] : null;
      if (isMoneyKind(next) && !isMoneyKind(after) && !(prev && prev.kind === 'nameOnly')) {
        const item = combine(line, next);
        consumed.add(n);
        if (item) items.push(item);
        else unknown.push({ raw: `${line.raw}\n${next.raw}` });
        continue;
      }
      unknown.push({ raw: line.raw });
      continue;
    }
    if (line.kind === 'amountOnly' || line.kind === 'qtyPrice' || line.kind === 'unknown') {
      unknown.push({ raw: line.raw });
    }
  }

  const sum = items.reduce((acc, it) => acc + it.amount, 0);
  const difference = total == null ? null : Math.abs(total - sum);
  return {
    date,
    time,
    total,
    subtotal,
    tax,
    taxAmount: sawTaxLine ? taxFromLines : taxFromTotal,
    items,
    unknown,
    sum,
    difference,
    matches: total == null ? null : difference === 0,
    text,
  };
}

function detectTax(s) {
  const included = /税込|内税|内消費税/.test(s);
  const excluded = /税抜|外税|本体価格/.test(s);
  if (included && excluded) return '不明';
  if (included) return '税込';
  if (excluded) return '税抜';
  return '不明';
}
