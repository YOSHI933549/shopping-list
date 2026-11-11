import { UNSET_ID } from '../state/store.js';
import { productChoices, readYen, totalsLabel } from '../lib/receiptDraft.js';
import { esc } from './util.js';

function storeButtons(state, draft) {
  return state.stores.filter((s) => s.id !== UNSET_ID).map((s) => {
    const on = s.id === draft.storeId ? ' on' : '';
    return `<button type="button" class="pill${on}" data-action="pick-receipt-store" data-id="${esc(s.id)}">${esc(s.name)}</button>`;
  }).join('');
}

function moneyInput(cls, label, value, suffix) {
  const shown = value == null || value === '' ? '' : esc(value);
  const tail = suffix ? `<span>${suffix}</span>` : '';
  return `<label>${label}<input class="${cls}" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="${label}" value="${shown}">${tail}</label>`;
}

function choiceSelect(state, storeId, name) {
  const choices = productChoices(state, storeId);
  if (!choices.length) return '';
  const cur = String(name ?? '');
  const opts = ['<option value="">（このまま）</option>'].concat(
    choices.map((c) => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`),
  );
  return `<select class="rpick" aria-label="既存の品から選ぶ">${opts.join('')}</select>`;
}

function discountRow(discount) {
  const n = readYen(discount);
  if (n == null || n === 0) return '';
  return `<div class="rdiscount">割引 −<input class="rdisc" inputmode="numeric" enterkeyhint="done" autocomplete="off" aria-label="割引" value="${esc(n)}">円</div>`;
}

function itemRow(state, draft, line) {
  const raw = line.raw ? `<div class="rraw">${esc(line.raw)}</div>` : '';
  return `<div class="rrow" data-line="${esc(line.key)}">${raw}<div class="redit"><span class="rarrow" aria-hidden="true">→</span>` +
    `<textarea class="rname" rows="1" enterkeyhint="done" autocomplete="off" aria-label="品名">${esc(line.name ?? '')}</textarea>` +
    `<button type="button" class="rdrop" data-action="receipt-drop" data-id="${esc(line.key)}">消す</button></div>` +
    `<div class="rnums">${moneyInput('rqty', '数量', line.quantity)}<span class="rtimes">×</span>${moneyInput('runit', '単価', line.unitPrice, '円')}` +
    `${moneyInput('ramount', '金額', line.amount, '円')}</div>` +
    `${choiceSelect(state, draft.storeId, line.name)}${discountRow(line.discount)}</div>`;
}

function unknownRow(line) {
  return `<div class="rrow runknown" data-line="${esc(line.key)}"><div class="rraw">${esc(line.raw)}</div>` +
    `<div class="redit"><span class="runk">不明な行</span>` +
    `<button type="button" class="rdrop" data-action="receipt-drop" data-id="${esc(line.key)}">消す</button></div></div>`;
}

export function totalsHtml(draft) {
  const t = totalsLabel(draft);
  const note = t.note ? `<span class="rnote" data-testid="receipt-note">${esc(t.note)}</span>` : '';
  return `<span class="rsum" data-testid="receipt-sum">${esc(t.line)}</span>${note}`;
}

export function pasteSheetHtml() {
  return `<div class="dim" data-action="close-sheet"></div>
<div class="sheet" role="dialog" aria-label="レシートを読む"><div class="grab"></div>
<div class="sh-head"><h2>レシートを読む</h2><button type="button" class="btn-ghost" data-action="close-sheet">閉じる</button></div>
<p class="note">iPhoneの「テキストをスキャン」や、写真アプリでコピーした文字を貼ってください。画像は保存しません。</p>
<textarea id="receipt-text" class="rtext" placeholder="ここにレシートの文字を貼る"></textarea>
<div class="acts"><button type="button" class="add-b" data-action="receipt-read">読む</button></div></div>`;
}

export function confirmSheetHtml(state, draft) {
  const hinted = (draft.suggestedIds || []).includes(draft.storeId);
  const hint = hinted ? '<p class="suggest-note">レシートの文字にあったお店を選んでいます</p>' : '';
  const time = draft.time ? `<span class="rtime">${esc(draft.time)}</span>` : '';
  const rows = (draft.lines || []).map((line) => (line.kind === 'unknown' ? unknownRow(line) : itemRow(state, draft, line))).join('');
  const empty = rows ? '' : '<p class="hint">品の行が見つかりませんでした。文字を貼り直すか、このまま閉じてください。</p>';
  return `<div class="dim" data-action="close-sheet"></div>
<div class="sheet receipt" role="dialog" aria-label="レシートの確認">
<div class="rhead"><div class="grab"></div><div class="sh-head"><h2>レシートの確認</h2><button type="button" class="btn-ghost" data-action="close-sheet">閉じる</button></div>
<div class="label">お店</div>
<div class="spills" data-testid="receipt-stores">${storeButtons(state, draft)}</div>${hint}
<div class="rdate"><span class="label">日付</span><input id="receipt-date" type="date" value="${esc(draft.date || '')}" aria-label="日付">${time}</div></div>
<div class="rbody" data-testid="receipt-rows">${rows}${empty}</div>
<div class="rfoot"><div class="rtotals" data-testid="receipt-totals">${totalsHtml(draft)}</div>
<div class="acts"><button type="button" class="add-b" data-action="receipt-save">保存</button></div></div></div>`;
}
