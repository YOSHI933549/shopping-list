import { productGroups } from '../lib/goods.js';
import { esc } from './util.js';

function storeLabel(stores, id) {
  return (stores || []).find((s) => s.id === id)?.name || '削除したお店';
}

function aliasText(group, stores) {
  const aliases = (group.aliases || []).map((a) => `${storeLabel(stores, a.storeId)} × ${a.notation}`);
  return aliases.slice(0, 4).map((t) => `<div class="goods-meta">${esc(t)}</div>`).join('');
}

function rawText(group) {
  return (group.raws || []).map((raw) => `<div class="goods-meta">元の表記 ${esc(raw)}</div>`).join('');
}

function groupRow(group, stores) {
  const count = group.lineCount ? `<div class="goods-meta">明細 ${group.lineCount}件</div>` : '';
  const merged = group.mergedInto
    ? `<div class="goods-meta">${esc(group.mergedName || '別の品')} にまとまっています</div>` +
      `<div class="goods-acts"><button type="button" class="btn sm" data-action="goods-split" data-id="${esc(group.id)}">分ける</button></div>`
    : `<div class="goods-acts"><button type="button" class="btn sm" data-action="goods-merge" data-id="${esc(group.id)}">まとめる</button></div>`;
  return `<div class="goods-row" data-goods="${esc(group.id)}"><div class="goods-name">${esc(group.name || '（名前なし）')}</div>` +
    `${aliasText(group, stores)}${rawText(group)}${count}${merged}</div>`;
}

export function goodsSheetHtml(state, { picking = null } = {}) {
  const groups = productGroups(state?.history);
  const stores = state?.stores || [];
  const head = `<div class="dim" data-action="close-sheet"></div>
<div class="sheet" role="dialog" aria-label="品物をまとめる" data-testid="goods-sheet"><div class="grab"></div>
<div class="sh-head"><h2>品物をまとめる</h2><button type="button" class="btn-ghost" data-action="close-sheet">閉じる</button></div>`;
  if (!groups.length) {
    return `${head}<p class="hint">まだ品物がありません。レシートを保存すると、ここにたまります。</p></div>`;
  }
  if (picking) {
    const source = groups.find((g) => g.id === picking);
    const targets = groups.filter((g) => g.id !== picking && !g.mergedInto);
    const title = source ? `「${esc(source.name)}」のまとめ先` : 'まとめ先';
    const body = targets.length
      ? targets.map((g) => `<button type="button" class="cand" data-action="goods-into" data-id="${esc(g.id)}">${esc(g.name || '（名前なし）')}</button>`).join('')
      : '<p class="hint">まとめ先の品がありません。</p>';
    return `${head}<p class="note">${title}を選んでください。元の表記は明細に残ります。</p>` +
      `<div class="rcands">${body}</div>` +
      `<div class="goods-acts"><button type="button" class="btn sm" data-action="goods-back">戻る</button></div></div>`;
  }
  const rows = groups.map((g) => groupRow(g, stores)).join('');
  return `${head}<p class="note">同じ品はひとつにまとめます。分けたときは、その品の名前に戻ります。レシートの元の表記は残ります。</p>` +
    `<div class="goods-list">${rows}</div></div>`;
}
