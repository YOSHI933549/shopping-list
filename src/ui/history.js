import { isDate } from '../lib/history.js';
import { formatYen } from '../lib/price.js';
import { esc } from './util.js';

function storeLabel(state, id) {
  return (state?.stores || []).find((s) => s.id === id)?.name || '削除したお店';
}

function shortDate(date) {
  if (!isDate(date)) return '日付不明';
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function byRecent(a, b) {
  const ad = isDate(a.date) ? a.date : '';
  const bd = isDate(b.date) ? b.date : '';
  if (ad !== bd) {
    if (!ad) return 1;
    if (!bd) return -1;
    return ad < bd ? 1 : -1;
  }
  return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
}

function historyRow(state, line) {
  const name = line.name || '（名前なし）';
  const bits = [shortDate(line.date), storeLabel(state, line.storeId)];
  if (Number.isInteger(line.price) && line.price >= 0) bits.push(formatYen(line.price));
  return `<div class="brow" data-history="${esc(line.id)}"><div class="nm">${esc(name)}<small>${esc(bits.join(' ・ '))}</small></div>` +
    `<button type="button" class="btn sm" data-action="delete-history" data-id="${esc(line.id)}" aria-label="${esc(name)}の購入履歴を消す">消す</button></div>`;
}

/** マイページの購入履歴。消すボタンは明細だけで、品名のまとめは触らない。 */
export function historySection(state) {
  const lines = (state?.history?.lines || []).filter((l) => l && typeof l.id === 'string');
  const n = lines.length;
  const wipe = `<button type="button" class="btn danger" data-action="ask-clear-history" data-testid="clear-history"${n ? '' : ' disabled'}>購入履歴をすべて削除${n ? `（${n}件）` : ''}</button>`;
  const body = n
    ? `<div class="list-in-sheet" data-testid="history-list">${lines.slice().sort(byRecent).map((l) => historyRow(state, l)).join('')}</div>`
    : '<p class="hint">購入履歴はまだありません。</p>';
  return `<section class="sec" id="history-sec" data-testid="history-sec"><h2>購入履歴${n ? `<small>${n}件</small>` : ''}</h2>
<p class="note">1件ずつ消せます。すべて消しても、品名のまとめ（別名・名前の学習）は残ります。</p>
<div class="btnrow">${wipe}</div>
${body}</section>`;
}
