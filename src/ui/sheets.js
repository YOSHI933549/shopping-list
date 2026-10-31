import { icon, itemIcon } from '../lib/icons.js';
import { storeName } from '../state/store.js';
import { formatYen } from '../lib/price.js';
import { esc } from './util.js';

export function storePills(state, selected) {
  return state.stores.map((s) => `<button class="pill${s.id === selected ? ' on' : ''}" data-action="pick-store" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('');
}

export function recentCards(state, ids) {
  const items = ids.map((id) => state.items.find((i) => i.id === id)).filter(Boolean).slice(-3).reverse();
  if (!items.length) return '<div class="hint">入れた品がここに出ます</div>';
  return items.map((i) => `<div class="rc">${itemIcon(i.name, 26, '')}<span class="n">${esc(i.name)}</span><span class="st">${esc(storeName(state, i.storeId))}</span>` +
    `<button class="undo" data-action="undo-add" data-id="${esc(i.id)}">取り消す</button></div>`).join('');
}

export function addSheetHtml(state, sel, speech) {
  return `<div class="dim" data-action="close-sheet"></div>
<div class="sheet" role="dialog" aria-label="入力して追加"><div class="grab"></div>
<div class="sh-head"><h2>入力して追加</h2><button class="btn-ghost" data-action="close-sheet">閉じる</button></div>
<div class="count" data-testid="count"></div>
<div class="recent" data-testid="recent"></div>
<div class="label">どのお店で買う？</div>
<div class="spills" data-testid="store-pills">${storePills(state, sel)}</div>
<div class="input"><input id="add-input" type="text" enterkeyhint="done" autocomplete="off" autocapitalize="off" placeholder="${esc(storeName(state, sel))}に入れる品">${speech ? `<button class="mic" data-action="mic" aria-label="話して追加">${icon('mic', 24)}</button>` : ''}</div>
<div class="input memo hidden" id="memo-wrap"><input id="memo-input" type="text" autocomplete="off" placeholder="メモ（次に入れる品につきます）"></div>
<div class="input price"><span class="yen">値段（円）</span><input id="price-input" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="off" placeholder="任意"></div>
<div class="acts"><button class="memo-b" data-action="toggle-memo">＋メモ</button><button class="add-b" data-action="add">追加</button></div></div>`;
}

export function boughtSheetHtml(state, items) {
  const body = items.length
    ? `<div class="list-in-sheet">${items.map((b) => `<div class="brow">${itemIcon(b.name)}<div class="nm">${esc(b.name)}<small>${esc(storeName(state, b.storeId))}${b.memo ? '・' + esc(b.memo) : ''}${Number.isInteger(b.price) ? '・' + formatYen(b.price) : ''}</small></div><button class="btn sm" data-action="undo-bought" data-id="${esc(b.id)}">戻す</button></div>`).join('')}</div>`
    : '<div class="hint">今日買ったものはまだありません</div>';
  return `<div class="dim" data-action="close-sheet"></div>
<div class="sheet" role="dialog" aria-label="今日買ったもの"><div class="grab"></div>
<div class="sh-head"><h2>今日買ったもの</h2><button class="btn-ghost" data-action="close-sheet">閉じる</button></div>
<div class="count"><b>${items.length}件</b> 買いました</div>${body}</div>`;
}

export function editSheetHtml(state, item) {
  return `<div class="dim" data-action="close-sheet"></div>
<div class="sheet" role="dialog" aria-label="値段を編集"><div class="grab"></div>
<div class="sh-head"><h2>値段を編集</h2><button class="btn-ghost" data-action="close-sheet">閉じる</button></div>
<div class="count edit-name">${esc(item.name)}<small>${esc(storeName(state, item.storeId))}</small></div>
<div class="input price"><span class="yen">値段（円）</span><input id="edit-price" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="off" placeholder="空にすると値段なし" value="${Number.isInteger(item.price) ? item.price : ''}"></div>
<div class="acts"><button class="add-b" data-action="save-edit" data-id="${esc(item.id)}">保存</button></div></div>`;
}
