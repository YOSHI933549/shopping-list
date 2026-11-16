// 文字認識の1行を、レシートの解析にかけやすい形に直す。純粋関数。画面にも保存にも書かない。
//
// 直すこと
// - 全角を半角にそろえる（NFKC）。
// - 日本語の字と字のあいだに入った空白を詰める（「ポイ ント」→「ポイント」）。
// - 右端の値段を「品名 数字」にそろえる。¥・￥・円・カンマ・小数点のような点（1.078）・全角数字、
//   「¥」が Y / \ / V / 羊 などに読まれたもの、0 と O、1 と l の取り違え、先頭か末尾のマイナス、
//   末尾の税率記号（※ * 軽 軽減 8%）に対応する。
// - 頭に付いた税の印（読み違いの英字1字や ※ *）を外す。
// 品名の中身（読み違いそのもの）は直さない。本人が確認画面で直す。

const CJK = '\\u3040-\\u30FF\\u3400-\\u9FFF々ー';
const SPACE_BETWEEN_CJK = new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`, 'g');
const YEN_LOOKALIKE = '[¥\\\\YyVvWwΨ羊半]';
const MINUS = '[-−‐―▲△▼]';
const MARKS = /\s*(?:[※*＊#＃]+|[(（]?軽減?(?:税率)?[)）]?|[(（]?(?:8|10)%[)）]?|(?<=\d)\s*[内外])\s*$/;
const TAIL = new RegExp(
  `(?:^|(?<=\\s)|(?<=[^A-Za-z0-9]))(${MINUS})?\\s*(${YEN_LOOKALIKE}{1,3})?\\s*(${MINUS})?\\s*([0-9OoIl|][0-9OoIl|,.]*)\\s*(円)?$`,
);

function lookalikeDigits(token) {
  return token.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
}

/**
 * 値段の塊（"1.078" "1,280" "198" "O98"）を整数にする。千の区切りは「,」か「.」を3桁ごとに。
 * それ以外（"12.5" など）は null。
 */
export function amountFromToken(token) {
  const t = lookalikeDigits(String(token ?? '')).replace(/\s/g, '');
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d{1,3}(?:[,.]\d{3})+$/.test(t)) return Number(t.replace(/[,.]/g, ''));
  return null;
}

/** 日本語の字のあいだの空白を詰める。英数字との境の空白は残す。 */
export function joinCjkSpaces(s) {
  return String(s ?? '').replace(SPACE_BETWEEN_CJK, '$1');
}

function normalizeBasics(line) {
  return String(line ?? '')
    .normalize('NFKC')
    .replace(/[\u2212\u2010\u2015]/g, '-')
    .replace(/[▲△▼]/g, '-')
    .replace(/\t/g, '  ')
    .trimEnd();
}

const LABEL_FIXES = [
  [/^[合含宮今仝台公]\s?[計針訂きさ]/, '合計'],
  [/^小\s?[針訂]/, '小計'],
  [/^お\s?[約鈞鉤豹的釣]\s?(?:け?り|りけ)[^\d\s¥\\-]{0,2}/, 'お釣り'],
  [/^お\s?[預贅玖殖頂克策珍燃]\s?(?:け?り|りけ|け)/, 'お預り'],
  [/^[清滑満油消肖浜]\s?[費貴賞]\s?[税彼科稅秩]\s?等?/, '消費税等'],
];

function fixLabel(head) {
  for (const [re, label] of LABEL_FIXES) {
    if (re.test(head)) return head.replace(re, label);
  }
  return head;
}

function tidyHead(head) {
  let h = joinCjkSpaces(head).replace(/\s+/g, ' ').trim();
  h = h.replace(/^[※*＊#＃]+\s*/, '');
  h = h.replace(new RegExp(`^[A-Za-z=・•●○◎]\\s+(?=[${CJK}])`), '');
  h = h.replace(/(\d)個人/g, '$1個入').replace(/(\d)枚人/g, '$1枚入');
  h = h.replace(new RegExp(`${YEN_LOOKALIKE}+$`), (m, offset) => (offset > 0 && /[A-Za-z]$/.test(h.slice(0, offset)) ? m : '')).trim();
  h = h.replace(/^(@\s*\d+)\s*[・·･•]\s*(\d+)/, '$1 ×$2');
  return fixLabel(h);
}

/**
 * 1行の右端にある値段を取り出す。値段が見つからなければ null。
 * { head: 値段より前（税の印は外す）, amount: 整数（マイナスあり）, marked: 値段の記号や円があったか }
 */
export function splitPriceTail(line) {
  const s = normalizeBasics(line);
  if (!s.trim()) return null;
  let body = s;
  let stripped;
  do {
    stripped = body;
    body = body.replace(MARKS, '');
  } while (body !== stripped);
  const m = body.match(TAIL);
  if (!m) return null;
  const [whole, sign1, sym, sign2, token, yen] = m;
  const head = body.slice(0, body.length - whole.length);
  const amount = amountFromToken(token);
  if (amount == null) return null;
  const marked = Boolean(sym || yen);
  const hasRealDigit = /\d/.test(token);
  const gap = /^\s/.test(whole) || /\s$/.test(head) || head === '';
  if (!marked && !gap && !/[,.]/.test(token)) return null;
  if (!hasRealDigit && !marked) return null;
  if (!marked && /^[-]/.test(token)) return null;
  const negative = Boolean(sign1 || sign2);
  return { head: tidyHead(head), amount: negative ? -amount : amount, marked };
}

/**
 * 1行を「品名 数字」「数字だけ」「そのまま」のどれかにそろえる。値段が無い行は空白と頭の印だけ直す。
 */
export function repairOcrLine(line) {
  const base = normalizeBasics(line);
  if (!base.trim()) return '';
  const tail = splitPriceTail(base);
  if (!tail) return tidyHead(base);
  return tail.head ? `${tail.head} ${tail.amount}` : String(tail.amount);
}

/** 複数行の文字を1行ずつ直す。行の数と順番は変えない。 */
export function repairOcrText(text) {
  return String(text ?? '').split(/\r\n|\n|\r/).map(repairOcrLine).join('\n');
}

/** 「品名 値段」と読めた行の数。読み方を切り替えるか決める目安。 */
export function priceLineCount(text) {
  let n = 0;
  for (const line of String(text ?? '').split(/\r\n|\n|\r/)) {
    const tail = splitPriceTail(line);
    if (tail && tail.head) n += 1;
  }
  return n;
}
