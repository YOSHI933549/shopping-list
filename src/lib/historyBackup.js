import { HISTORY_VERSION, daysBefore, isDate, sanitizeHistory, unionHistory } from './history.js';

// 購入履歴だけのバックアップ。リスト全体の書き出しとは別のファイル。
// version 1 は台帳（別名・まとめ）が無い履歴。読み込み時に version 2 へ移す。
export const BACKUP_KIND = 'kaimono-history';
export const BACKUP_VERSION = HISTORY_VERSION;

// アプリを開いたとき、前回の書き出しからこの日数たち、記録がこの件数以上なら一行で知らせる。
export const BACKUP_NUDGE_DAYS = 30;
export const BACKUP_NUDGE_MIN_RECORDS = 8;

export function backupFilename(date) {
  return `kaimono-history-${date}.json`;
}

/** 履歴・レシート・品物の台帳を1つの JSON にする。日付は呼び出し側が渡す。同じ id は先の1件だけ残す。 */
export function historyBackupJSON(history, exportedAt = null) {
  const source = history && typeof history === 'object' && !Array.isArray(history) ? history : {};
  const h = sanitizeHistory({
    ...source,
    lines: dedupeById(Array.isArray(source.lines) ? source.lines : []),
    receipts: dedupeById(Array.isArray(source.receipts) ? source.receipts : []),
    goods: dedupeById(Array.isArray(source.goods) ? source.goods : []),
  });
  return JSON.stringify({
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: typeof exportedAt === 'string' ? exportedAt : null,
    lines: h.lines,
    receipts: h.receipts,
    goods: h.goods,
  }, null, 2);
}

function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string' ? item.id : '';
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(item);
  }
  return out;
}

/**
 * 書き出した履歴ファイルを読む。壊れているときは理由を返し、状態は変えない。
 * version 1（台帳なし）は空の台帳を足して version 2 にする。同じ id は先の1件だけ残す。
 */
export function parseHistoryBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON として読めませんでした' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'データの形式が正しくありません' };
  }
  if (data.kind != null && data.kind !== BACKUP_KIND) {
    return { ok: false, error: 'このアプリの履歴ファイルではありません' };
  }
  if (Array.isArray(data.items) && Array.isArray(data.stores) && !Array.isArray(data.lines)) {
    return { ok: false, error: 'これはリスト全体のファイルです。購入履歴のファイルを選んでください' };
  }
  if (data.version !== 1 && data.version !== BACKUP_VERSION) {
    const shown = data.version == null ? 'なし' : String(data.version);
    return { ok: false, error: `対応していないバージョンです (${shown})` };
  }
  if (!Array.isArray(data.lines)) return { ok: false, error: '購入の記録（lines）がありません' };
  if (data.receipts != null && !Array.isArray(data.receipts)) return { ok: false, error: 'レシートの形式が正しくありません' };
  if (data.goods != null && !Array.isArray(data.goods)) return { ok: false, error: '品物のまとめの形式が正しくありません' };
  const history = sanitizeHistory({
    version: data.version,
    lines: dedupeById(data.lines),
    receipts: dedupeById(Array.isArray(data.receipts) ? data.receipts : []),
    goods: dedupeById(Array.isArray(data.goods) ? data.goods : []),
  });
  return { ok: true, history };
}

function countMerge(current, incoming) {
  const ids = new Set(current.map((item) => item.id));
  let same = 0;
  for (const item of incoming) if (ids.has(item.id)) same += 1;
  return { file: incoming.length, added: incoming.length - same, same, current: current.length };
}

/** 読み込む前に見せる件数。同じ id は「同じ記録」に数える。 */
export function describeHistoryMerge(current, incoming) {
  const cur = sanitizeHistory(current);
  const inc = sanitizeHistory(incoming);
  return {
    lines: countMerge(cur.lines, inc.lines),
    receipts: countMerge(cur.receipts, inc.receipts),
    goods: countMerge(cur.goods, inc.goods),
  };
}

function piece(label, stat) {
  return `${label} ${stat.file}件（新しく足す ${stat.added}件、同じ記録 ${stat.same}件）`;
}

export function historyImportSummary(stats) {
  return [piece('購入の記録', stats.lines), piece('レシート', stats.receipts), piece('品物のまとめ', stats.goods)].join('\n');
}

/** 今の履歴にファイルの内容を足す。同じ id は1件にまとまり、ファイルに無い記録は残る。 */
export function stateWithHistory(state, incoming) {
  return { ...state, history: unionHistory(state?.history, incoming) };
}

export function canShareBackupFile(nav, file) {
  try {
    return typeof nav?.canShare === 'function' && nav.canShare({ files: [file] }) === true;
  } catch {
    return false;
  }
}

/**
 * 開いたときに出す一行。前回の書き出し（無ければ一番古い記録）から
 * BACKUP_NUDGE_DAYS 日たち、明細が BACKUP_NUDGE_MIN_RECORDS 件以上のときだけ。
 */
export function historyBackupNudge(state, now = new Date()) {
  const lines = sanitizeHistory(state?.history).lines;
  const count = lines.length;
  if (count < BACKUP_NUDGE_MIN_RECORDS) return null;
  const last = state?.settings?.lastExportDate;
  let days;
  let fromExport = false;
  if (isDate(last)) {
    days = daysBefore(last, now);
    fromExport = true;
  } else {
    const dates = lines.map((line) => line.date).filter(isDate).sort();
    if (!dates.length) return null;
    days = daysBefore(dates[0], now);
  }
  if (days < BACKUP_NUDGE_DAYS) return null;
  const daysLabel = `${days}\u2060日`;
  const countLabel = `${count}\u2060件`;
  const message = fromExport
    ? `前回の書き出しから${daysLabel}たっています。購入の記録が${countLabel}あります`
    : `最初の記録から${daysLabel}たっています。購入の記録が${countLabel}あります`;
  return { days, count, message };
}
