import { UNSET_ID } from '../state/store.js';
import { esc } from './util.js';
import { icon } from '../lib/icons.js';

export function renderMypage(state, ui, version) {
  const stores = state.stores.map((s, idx) => {
    const fixed = s.id === UNSET_ID;
    const movable = !fixed;
    const n = state.items.filter((i) => i.storeId === s.id).length;
    return `<div class="brow" data-store-row="${esc(s.id)}"><div class="nm">${esc(s.name)}<small>${n ? `リスト ${n}品` : fixed ? '消せません' : ''}</small></div>` +
      (movable ? `<button class="btn sm icon" data-action="store-up" data-id="${esc(s.id)}" aria-label="上へ"${idx === 0 ? ' disabled' : ''}>${icon('up', 16)}</button>` +
        `<button class="btn sm icon" data-action="store-down" data-id="${esc(s.id)}" aria-label="下へ"${idx >= state.stores.length - 2 ? ' disabled' : ''}>${icon('down', 16)}</button>` +
        `<button class="btn sm" data-action="store-rename" data-id="${esc(s.id)}">名前</button>` +
        `<button class="btn sm" data-action="store-delete" data-id="${esc(s.id)}">削除</button>` : '') + '</div>';
  }).join('');
  return `<header><h1>マイページ</h1></header>
<main class="plain" data-scroll>
<section class="sec"><h2>お店の管理</h2>
<div class="list-in-sheet" data-testid="store-list">${stores}</div>
<form class="form" data-form="store" style="margin-top:10px"><div class="line"><input class="field" name="name" placeholder="新しいお店の名前" autocomplete="off"><button class="btn red" type="submit">追加</button></div></form>
<p class="note">お店を削除すると、そのお店の品物は「未設定」に移ります。</p>
<div class="btnrow"><button class="btn" data-action="store-restore">初期のお店を戻す</button></div></section>
<section class="sec"><h2>データの書き出し<small>バックアップ用</small></h2>
<div class="btnrow" style="margin-top:0"><button class="btn" data-action="export-file">ファイルに保存</button><button class="btn" data-action="export-show">テキストを表示</button></div>
${ui.exportText ? `<textarea class="field" id="export-text" readonly style="margin-top:8px">${esc(ui.exportText)}</textarea><div class="btnrow"><button class="btn sm" data-action="export-copy">コピー</button></div>` : ''}
<p class="note">iPhone ではファイル保存がうまくいかないことがあります。その場合はテキストをコピーして、メモなどに貼って保管してください。</p></section>
<section class="sec"><h2>データの取り込み<small>今のデータは上書きされます</small></h2>
<input type="file" id="import-file" accept="application/json,.json" class="hidden"><div class="btnrow" style="margin:0 0 8px"><label class="btn" for="import-file">ファイルを選んで取り込む</label></div>
<textarea class="field" id="import-text" placeholder="書き出したテキストをここに貼り付け"></textarea>
<div class="btnrow"><button class="btn" data-action="import-run">取り込む</button></div></section>
<p class="ver">買い物リスト v${esc(version)} ・ データはこの端末の中だけに保存されます</p>
</main>`;
}
