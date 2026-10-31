import './styles.css';
import { version } from '../package.json';
import * as S from './state/store.js';
import { renderList } from './ui/list.js';
import { renderRegular } from './ui/regular.js';
import { renderMypage } from './ui/mypage.js';
import { addSheetHtml, boughtSheetHtml, editSheetHtml, storePills, recentCards } from './ui/sheets.js';
import { icon } from './lib/icons.js';
import { parsePrice } from './lib/price.js';
import { parseSpoken, speechSupported, listen } from './lib/speech.js';

let state = S.pruneBought(S.load());
const ui = { tab: 'list', filter: 'all', sheet: null, sheetStore: null, sheetAdded: [], memoOpen: false, exportText: '' };
const pending = new Set();
const speech = speechSupported();
let stopListen = null;

const app = document.getElementById('app');
app.innerHTML = '<div id="view"></div><nav class="tabs"></nav>';
const view = app.querySelector('#view');
const tabs = app.querySelector('.tabs');
const overlay = document.createElement('div');
overlay.id = 'overlay';
document.body.appendChild(overlay);

const TABS = [['regular', 'repeat', '定期購入品'], ['list', 'list', '買い物リスト'], ['mypage', 'person', 'マイページ']];

function commit(next) {
  state = next;
  S.save(state);
  render();
}

function render() {
  const sc = view.querySelector('[data-scroll]')?.scrollTop ?? 0;
  const boughtCount = S.boughtToday(state).length;
  if (ui.tab === 'list') view.innerHTML = renderList(state, ui, { speech, boughtCount }).html;
  else if (ui.tab === 'regular') view.innerHTML = renderRegular(state, ui);
  else view.innerHTML = renderMypage(state, ui, version);
  const m = view.querySelector('[data-scroll]');
  if (m) m.scrollTop = sc;
  tabs.innerHTML = TABS.map(([k, ic, label]) => `<button class="tab${ui.tab === k ? ' on' : ''}" data-action="tab" data-id="${k}">${icon(ic, 26)}${label}</button>`).join('');
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (ui.sheet ? ' over' : '');
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

// ---- シート ----
function selectedStore() {
  const id = ui.sheetStore ?? state.settings.lastStoreId;
  return state.stores.some((s) => s.id === id) ? id : S.UNSET_ID;
}
function refreshAddSheet() {
  const sel = selectedStore();
  const q = (t) => overlay.querySelector(`[data-testid="${t}"]`);
  const n = ui.sheetAdded.filter((id) => state.items.some((i) => i.id === id)).length;
  q('count').innerHTML = `<b>${n}品</b> 入れました`;
  q('recent').innerHTML = recentCards(state, ui.sheetAdded);
  q('store-pills').innerHTML = storePills(state, sel);
  overlay.querySelector('#add-input').placeholder = `${S.storeName(state, sel)}に入れる品`;
  overlay.querySelector('#memo-wrap').classList.toggle('hidden', !ui.memoOpen);
}
function openAddSheet() {
  ui.sheet = 'add';
  ui.sheetStore = null;
  ui.sheetAdded = [];
  ui.memoOpen = false;
  overlay.innerHTML = addSheetHtml(state, selectedStore(), speech);
  refreshAddSheet();
  overlay.querySelector('#add-input').focus();
}
function openBoughtSheet() {
  ui.sheet = 'bought';
  overlay.innerHTML = boughtSheetHtml(state, S.boughtToday(state));
}
function openEditSheet(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  ui.sheet = 'edit';
  overlay.innerHTML = editSheetHtml(state, item);
  overlay.querySelector('#edit-price').focus();
}
function saveEdit(id) {
  const p = parsePrice(overlay.querySelector('#edit-price').value);
  if (!p.ok) { toast('値段は0以上の数字で入れてください'); return; }
  commit(S.setItemPrice(state, id, p.value));
  closeSheet();
}
function closeSheet() {
  stopListen?.();
  ui.sheet = null;
  overlay.innerHTML = '';
}

function addFromSheet() {
  const input = overlay.querySelector('#add-input');
  const memoInput = overlay.querySelector('#memo-input');
  const priceInput = overlay.querySelector('#price-input');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  const price = parsePrice(priceInput.value);
  if (!price.ok) { toast('値段は0以上の数字で入れてください'); priceInput.focus(); return; }
  const r = S.addItem(state, { name, storeId: selectedStore(), memo: ui.memoOpen ? memoInput.value : '', price: price.value });
  state = S.setSetting(r.state, 'lastStoreId', selectedStore());
  S.save(state);
  ui.sheetAdded.push(r.item.id);
  input.value = '';
  memoInput.value = '';
  priceInput.value = '';
  ui.memoOpen = false;
  render();
  refreshAddSheet();
  input.focus();
}

// ---- 音声 ----
function startMic(btn) {
  if (!speech) { toast('この端末では音声入力が使えません'); return; }
  if (stopListen) { stopListen(); return; }
  btn.classList.add('rec');
  let got = false;
  stopListen = listen({
    onResult(text) {
      got = true;
      const names = parseSpoken(text);
      const storeId = selectedStore();
      let st = state;
      const ids = [];
      for (const name of names) {
        const r = S.addItem(st, { name, storeId });
        st = r.state;
        if (r.item) ids.push(r.item.id);
      }
      if (!ids.length) { toast('聞き取れませんでした'); return; }
      ui.sheetAdded.push(...ids);
      commit(S.setSetting(st, 'lastStoreId', storeId));
      if (ui.sheet === 'add') refreshAddSheet();
      toast(`${ids.length}品 追加しました：${names.join('、')}`);
    },
    onEnd(err) {
      stopListen = null;
      document.querySelectorAll('.rec').forEach((e) => e.classList.remove('rec'));
      if (!got) toast(err === 'not-allowed' || err === 'service-not-allowed' ? 'マイクの使用が許可されていません' : '聞き取れませんでした');
    },
  });
}

// ---- 操作 ----
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doImport(text) {
  const r = S.importJSON(text);
  if (!r.ok) { toast(`取り込めません：${r.error}`); return; }
  const msg = `今のデータを上書きして取り込みます。\nリスト ${r.state.items.length}品 / 定期購入品 ${r.state.regulars.length}件 / お店 ${r.state.stores.length}件\nよろしいですか？`;
  if (!window.confirm(msg)) return;
  ui.filter = 'all';
  commit(r.state);
  toast('取り込みました');
}

function checkRow(id) {
  if (pending.has(id)) return;
  const row = view.querySelector(`[data-row="${CSS.escape(id)}"]`);
  if (!row) return;
  pending.add(id);
  row.classList.add('done');
  row.querySelector('.ck').classList.add('on');
  row.querySelector('.ck').innerHTML = icon('check', 18);
  setTimeout(() => row.classList.add('leaving'), 350);
  setTimeout(() => { pending.delete(id); commit(S.checkItem(state, id)); }, 650);
}

const actions = {
  tab: (id) => { ui.tab = id; ui.exportText = ''; render(); },
  filter: (id) => { ui.filter = id; render(); },
  aisle: () => commit(S.setSetting(state, 'aisleOrder', !state.settings.aisleOrder)),
  check: checkRow,
  'open-add': openAddSheet,
  'open-bought': openBoughtSheet,
  'close-sheet': closeSheet,
  'edit-item': openEditSheet,
  'save-edit': saveEdit,
  'pick-store': (id) => { ui.sheetStore = id; refreshAddSheet(); overlay.querySelector('#add-input').focus(); },
  add: addFromSheet,
  'toggle-memo': () => { ui.memoOpen = !ui.memoOpen; refreshAddSheet(); overlay.querySelector(ui.memoOpen ? '#memo-input' : '#add-input').focus(); },
  'undo-add': (id) => { ui.sheetAdded = ui.sheetAdded.filter((x) => x !== id); commit(S.removeItem(state, id)); refreshAddSheet(); overlay.querySelector('#add-input').focus(); },
  'undo-bought': (id) => { commit(S.undoBought(state, id)); const left = S.boughtToday(state); if (left.length) openBoughtSheet(); else closeSheet(); },
  mic: (_, btn) => startMic(btn),
  'reg-to-list': (id) => {
    const r = S.regularToList(state, id);
    const reg = state.regulars.find((x) => x.id === id);
    if (r.status === 'added') { commit(r.state); toast(`「${reg.name}」をリストに入れました`); }
    else if (r.status === 'exists') toast(`「${reg.name}」はもうリストにあります`);
  },
  'reg-delete': (id) => commit(S.removeRegular(state, id)),
  'store-up': (id) => commit(S.moveStore(state, id, -1)),
  'store-down': (id) => commit(S.moveStore(state, id, 1)),
  'store-rename': (id) => {
    const cur = S.storeName(state, id);
    const n = window.prompt('新しい名前', cur);
    if (n == null) return;
    const next = S.renameStore(state, id, n);
    if (next === state) toast('その名前は使えません'); else commit(next);
  },
  'store-delete': (id) => {
    const n = state.items.filter((i) => i.storeId === id).length;
    if (!window.confirm(`「${S.storeName(state, id)}」を削除しますか？${n ? `\nリストの ${n}品は「未設定」に移ります。` : ''}`)) return;
    commit(S.deleteStore(state, id));
  },
  'store-restore': () => { commit(S.restoreDefaultStores(state)); toast('初期のお店を戻しました'); },
  'export-file': () => { download(`kaimono-list-${S.localDate()}.json`, S.exportJSON(state)); },
  'export-show': () => { ui.exportText = S.exportJSON(state); render(); },
  'export-copy': async () => {
    const ta = document.getElementById('export-text');
    try { await navigator.clipboard.writeText(ta.value); toast('コピーしました'); } catch { ta.select(); toast('選択しました。コピーしてください'); }
  },
  'import-run': () => {
    const t = document.getElementById('import-text').value.trim();
    if (!t) { toast('テキストを貼るか、ファイルを選んでください'); return; }
    doImport(t);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el.dataset.id, el);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing && e.target.matches('#add-input, #memo-input, #price-input')) { e.preventDefault(); addFromSheet(); }
  if (e.key === 'Enter' && !e.isComposing && e.target.id === 'edit-price') { e.preventDefault(); saveEdit(overlay.querySelector('[data-action="save-edit"]').dataset.id); }
  if (e.key === 'Escape' && ui.sheet) closeSheet();
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const d = new FormData(f);
  if (f.dataset.form === 'regular') {
    const r = S.addRegular(state, { name: d.get('name'), storeId: d.get('store'), memo: d.get('memo') });
    if (!r.regular) return;
    commit(S.setSetting(r.state, 'lastStoreId', d.get('store')));
    view.querySelector('[name="name"]')?.focus();
  } else if (f.dataset.form === 'store') {
    const r = S.addStore(state, d.get('name'));
    if (!r.store) { toast('名前が空か、同じ名前のお店があります'); return; }
    commit(r.state);
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id === 'import-file' && e.target.files[0]) {
    const text = await e.target.files[0].text();
    e.target.value = '';
    doImport(text);
  }
});

render();
