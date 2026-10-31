import { describe, it, expect } from 'vitest';
import * as S from '../src/state/store.js';

const at = (s) => new Date(s);
const base = () => S.initialState();

describe('items', () => {
  it('追加・空は無視', () => {
    let { state, item } = S.addItem(base(), { name: ' 牛乳 ', storeId: 'aeon' });
    expect(item.name).toBe('牛乳');
    expect(state.items).toHaveLength(1);
    const r = S.addItem(state, { name: '   ', storeId: 'aeon' });
    expect(r.item).toBeNull();
    expect(r.state.items).toHaveLength(1);
  });
  it('不明なお店は未設定', () => {
    expect(S.addItem(base(), { name: 'a', storeId: 'zzz' }).item.storeId).toBe(S.UNSET_ID);
  });
  it('取り消し', () => {
    const { state, item } = S.addItem(base(), { name: 'a', storeId: 'aeon' });
    expect(S.removeItem(state, item.id).items).toHaveLength(0);
  });
  it('チェック→今日買ったもの→戻す', () => {
    const { state, item } = S.addItem(base(), { name: 'a', storeId: 'aeon', memo: 'm' });
    const s2 = S.checkItem(state, item.id, at('2026-10-31T10:00:00'));
    expect(s2.items).toHaveLength(0);
    expect(s2.bought[0].boughtDate).toBe('2026-10-31');
    const s3 = S.undoBought(s2, item.id);
    expect(s3.bought).toHaveLength(0);
    expect(s3.items[0]).toEqual(item);
  });
  it('今日の絞り込みは日付で行う', () => {
    let st = base();
    const a = S.addItem(st, { name: 'a', storeId: 'aeon' }); st = a.state;
    const b = S.addItem(st, { name: 'b', storeId: 'aeon' }); st = b.state;
    st = S.checkItem(st, a.item.id, at('2026-10-30T23:59:00'));
    st = S.checkItem(st, b.item.id, at('2026-10-31T00:01:00'));
    expect(S.boughtToday(st, at('2026-10-31T12:00:00')).map((x) => x.name)).toEqual(['b']);
    expect(S.boughtToday(st, at('2026-10-30T12:00:00')).map((x) => x.name)).toEqual(['a']);
  });
  it('古い履歴を捨てる', () => {
    let st = base();
    const a = S.addItem(st, { name: 'a', storeId: 'aeon' }); st = a.state;
    st = S.checkItem(st, a.item.id, at('2026-01-01T10:00:00'));
    expect(S.pruneBought(st, at('2026-10-31T10:00:00')).bought).toHaveLength(0);
  });
});

describe('stores', () => {
  it('追加（重複不可・未設定は末尾）', () => {
    const { state, store } = S.addStore(base(), 'ドラッグX');
    expect(state.stores.at(-1).id).toBe(S.UNSET_ID);
    expect(state.stores.at(-2).id).toBe(store.id);
    expect(S.addStore(state, 'ドラッグX').store).toBeNull();
  });
  it('名前変更。未設定は変更不可', () => {
    expect(S.storeName(S.renameStore(base(), 'aeon', 'AEON'), 'aeon')).toBe('AEON');
    expect(S.storeName(S.renameStore(base(), S.UNSET_ID, 'x'), S.UNSET_ID)).toBe('未設定');
  });
  it('削除するとアイテムは未設定へ。未設定は消せない', () => {
    let st = S.addItem(base(), { name: 'a', storeId: 'aeon' }).state;
    st = S.setSetting(st, 'lastStoreId', 'aeon');
    const r = S.deleteStore(st, 'aeon');
    expect(r.stores.some((s) => s.id === 'aeon')).toBe(false);
    expect(r.items[0].storeId).toBe(S.UNSET_ID);
    expect(r.settings.lastStoreId).toBe(S.UNSET_ID);
    expect(S.deleteStore(st, S.UNSET_ID)).toBe(st);
  });
  it('並べ替え', () => {
    const r = S.moveStore(base(), 'aeon', -1);
    expect(r.stores.map((s) => s.id)).toEqual(['aeon', 'amazon', 'matsukiyo', S.UNSET_ID]);
    expect(S.moveStore(base(), 'amazon', -1).stores[0].id).toBe('amazon');
  });
  it('初期のお店を戻す', () => {
    const st = S.restoreDefaultStores(S.deleteStore(base(), 'aeon'));
    expect(st.stores.some((s) => s.name === 'イオン')).toBe(true);
  });
});

describe('regulars', () => {
  it('リストへ追加・重複は exists', () => {
    let st = S.addRegular(base(), { name: '牛乳', storeId: 'aeon' }).state;
    const id = st.regulars[0].id;
    const r1 = S.regularToList(st, id);
    expect(r1.status).toBe('added');
    expect(S.regularToList(r1.state, id).status).toBe('exists');
  });
});

describe('export / import / 保存', () => {
  const sample = () => {
    let st = S.addItem(base(), { name: 'a', storeId: 'aeon' }).state;
    st = S.addRegular(st, { name: 'r', storeId: 'aeon' }).state;
    return st;
  };
  it('往復できる', () => {
    const st = sample();
    const r = S.importJSON(S.exportJSON(st));
    expect(r.ok).toBe(true);
    expect(r.state.items[0].name).toBe('a');
  });
  it.each([
    ['壊れた JSON', '{oops'],
    ['配列', '[]'],
    ['バージョン違い', JSON.stringify({ ...base(), version: 2 })],
    ['items 欠落', JSON.stringify({ ...base(), items: undefined })],
    ['item の name が無い', JSON.stringify({ ...base(), items: [{ id: 'x', storeId: 'aeon' }] })],
    ['store id 重複', JSON.stringify({ ...base(), stores: [{ id: 'a', name: 'a' }, { id: 'a', name: 'b' }] })],
  ])('不正: %s', (_, text) => {
    expect(S.importJSON(text).ok).toBe(false);
  });
  it('未知のお店は未設定に直る・未設定が無ければ補う', () => {
    const data = { ...base(), stores: [{ id: 'a', name: 'A' }], items: [{ id: 'i', name: 'n', storeId: 'zzz' }] };
    const r = S.validateState(data);
    expect(r.ok).toBe(true);
    expect(r.state.items[0].storeId).toBe(S.UNSET_ID);
    expect(r.state.stores.some((s) => s.id === S.UNSET_ID)).toBe(true);
  });
  it('壊れた保存データは初期状態にフォールバック', () => {
    expect(S.parseStored('{{{')).toEqual(S.initialState());
    expect(S.parseStored(null)).toEqual(S.initialState());
    const fake = { getItem() { throw new Error('x'); } };
    expect(S.load(fake)).toEqual(S.initialState());
  });
  it('save/load', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const st = sample();
    expect(S.save(st, storage)).toBe(true);
    expect(S.load(storage).items[0].name).toBe('a');
  });
});
