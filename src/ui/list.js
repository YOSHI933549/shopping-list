import { icon, itemIcon } from '../lib/icons.js';
import { categorize, aisleIndex } from '../lib/categorize.js';
import { esc } from './util.js';

/** 表示用に「お店ごと」へまとめる（空のお店は出さない）。 */
export function groupByStore(state, filter = 'all') {
  const out = [];
  for (const s of state.stores) {
    if (filter !== 'all' && filter !== s.id) continue;
    const items = state.items.filter((i) => i.storeId === s.id);
    if (items.length) out.push({ store: s, items });
  }
  return out;
}

/** 売り場順に並べて [{aisle, items}] へ。 */
export function groupByAisle(items) {
  const map = new Map();
  for (const it of items) {
    const a = categorize(it.name);
    if (!map.has(a)) map.set(a, []);
    map.get(a).push(it);
  }
  return [...map.entries()].sort((a, b) => aisleIndex(a[0]) - aisleIndex(b[0])).map(([aisle, items]) => ({ aisle, items }));
}

export function storesWithItems(state) {
  return state.stores.filter((s) => state.items.some((i) => i.storeId === s.id));
}

function row(it) {
  const memo = it.memo ? `<span class="memo">メモ：${esc(it.memo)}</span>` : '';
  return `<div class="row" data-row="${esc(it.id)}">${itemIcon(it.name)}<div class="nm">${esc(it.name)}${memo}</div>` +
    `<button class="ck" data-action="check" data-id="${esc(it.id)}" aria-label="${esc(it.name)}を買った"></button></div>`;
}

export function renderList(state, ui, { speech, boughtCount }) {
  const stores = storesWithItems(state);
  const filter = stores.some((s) => s.id === ui.filter) ? ui.filter : 'all';
  const aisle = !!state.settings.aisleOrder;
  const pills = [{ id: 'all', name: 'すべて' }, ...stores]
    .map((s) => `<button class="pill${s.id === filter ? ' on' : ''}" data-action="filter" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('');
  const groups = groupByStore(state, filter);
  const cards = groups.map(({ store, items }) => {
    const body = aisle
      ? groupByAisle(items).map((g) => `<div class="aisle">${esc(g.aisle)}</div>${g.items.map(row).join('')}`).join('')
      : items.map(row).join('');
    return `<section class="card" data-store="${esc(store.id)}"><div class="store">${esc(store.name)}<small>${items.length}品</small></div>${body}</section>`;
  }).join('');
  const empty = `<div class="empty">${icon('list', 56)}<b>リストは空っぽです</b><p>右下の赤いペンのボタンを押して、<br>買いたいものを書き足してみよう。</p></div>`;
  return { filter, html: `
<header><h1>買い物リスト</h1>
<div class="toolbar"><div class="pills" data-testid="pills">${pills}</div>
<button class="toggle" data-action="aisle" role="switch" aria-checked="${aisle}">売り場順<span class="sw${aisle ? ' on' : ''}"></span></button></div></header>
<main data-scroll>${cards || empty}</main>${dock(state, speech, boughtCount)}` };
}

export function dock(state, speech, boughtCount = null) {
  const n = boughtCount ?? 0;
  const bar = n > 0 ? `<button class="done-bar" data-action="open-bought"><span>今日買ったもの</span><span>${n}件 ›</span></button>` : '';
  const mic = speech ? `<button class="fab" data-action="mic" aria-label="話して追加">${icon('mic', 26)}</button>` : '';
  return `<div class="dock">${bar}<div class="fabs">${mic}<button class="fab red" data-action="open-add" aria-label="入力して追加">${icon('pencil', 26)}</button></div></div>`;
}
