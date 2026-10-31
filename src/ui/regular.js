import { itemIcon } from '../lib/icons.js';
import { storeName } from '../state/store.js';
import { esc } from './util.js';

export function storeOptions(state, selected) {
  return state.stores.map((s) => `<option value="${esc(s.id)}"${s.id === selected ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
}

export function renderRegular(state, ui) {
  const rows = state.regulars.map((r) => `<div class="brow">${itemIcon(r.name)}<div class="nm">${esc(r.name)}<small>${esc(storeName(state, r.storeId))}${r.memo ? '・メモ：' + esc(r.memo) : ''}</small></div>` +
    `<button class="btn sm red" data-action="reg-to-list" data-id="${esc(r.id)}">リストへ</button>` +
    `<button class="btn sm icon" data-action="reg-delete" data-id="${esc(r.id)}" aria-label="${esc(r.name)}を削除">✕</button></div>`).join('');
  return `<header><h1>定期購入品</h1></header>
<main class="plain" data-scroll>
<form class="form" data-form="regular"><div class="line"><input class="field" name="name" placeholder="よく買う品" autocomplete="off"><select class="field" name="store" aria-label="お店">${storeOptions(state, state.settings.lastStoreId)}</select></div>
<div class="line"><input class="field" name="memo" placeholder="メモ（任意）" autocomplete="off"><button class="btn red" type="submit">追加</button></div></form>
${rows ? `<div class="list-in-sheet" data-testid="regular-list">${rows}</div>` : '<div class="empty"><b>まだ何もありません</b><p>毎回買うものを登録しておくと、<br>ボタンひとつでリストに入れられます。</p></div>'}
</main>`;
}
