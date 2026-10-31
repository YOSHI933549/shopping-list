import { describe, it, expect } from 'vitest';
import { parsePrice, formatYen, priceKey } from '../src/lib/price.js';
import * as S from '../src/state/store.js';

describe('parsePrice', () => {
  it.each([
    ['198', 198], ['１９８', 198], ['¥1,280', 1280], ['￥１，２８０', 1280], ['198円', 198], [' 1 280 円 ', 1280], ['0', 0], ['007', 7], [350, 350],
  ])('%j → %j', (input, value) => {
    expect(parsePrice(input)).toEqual({ ok: true, value });
  });
  it.each([[''], ['   '], [null], [undefined]])('空 %j は値段なし', (input) => {
    expect(parsePrice(input)).toEqual({ ok: true, value: null });
  });
  it.each([['-5'], ['12.5'], ['abc'], ['1,2a'], ['99999999'], [-1], [1.5], [NaN]])('不正 %j', (input) => {
    expect(parsePrice(input).ok).toBe(false);
  });
  it('3桁区切りで表示', () => {
    expect(formatYen(198)).toBe('198円');
    expect(formatYen(1280)).toBe('1,280円');
    expect(formatYen(0)).toBe('0円');
  });
});

describe('priceBook', () => {
  const buy = (st, name, storeId, price) => {
    const r = S.addItem(st, { name, storeId, price });
    return S.checkItem(r.state, r.item.id);
  };
  it('値段付きで購入すると記録され、同じお店・商品名で参照できる', () => {
    const st = buy(S.initialState(), '牛乳', 'aeon', '¥198');
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBe(198);
    expect(S.lastPrice(st, 'aeon', '卵')).toBeNull();
  });
  it('商品名は正規化して照合（全角・カタカナ/ひらがな・空白）', () => {
    const st = buy(S.initialState(), 'ヨーグルト', 'aeon', 120);
    expect(S.lastPrice(st, 'aeon', 'よーぐると')).toBe(120);
    expect(S.lastPrice(st, 'aeon', ' ヨーグルト ')).toBe(120);
    expect(priceKey('aeon', 'ＡＢＣ')).toBe(priceKey('aeon', 'abc'));
  });
  it('お店が違えば別扱い', () => {
    let st = buy(S.initialState(), '牛乳', 'aeon', 198);
    st = buy(st, '牛乳', 'matsukiyo', 230);
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBe(198);
    expect(S.lastPrice(st, 'matsukiyo', '牛乳')).toBe(230);
    expect(S.lastPrice(st, 'amazon', '牛乳')).toBeNull();
  });
  it('新しい購入で上書き。値段なしの購入は記録を消さない', () => {
    let st = buy(S.initialState(), '牛乳', 'aeon', 198);
    st = buy(st, '牛乳', 'aeon', 210);
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBe(210);
    st = buy(st, '牛乳', 'aeon', '');
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBe(210);
  });
  it('追加しただけでは記録しない（購入時に記録）', () => {
    const st = S.addItem(S.initialState(), { name: '牛乳', storeId: 'aeon', price: 198 }).state;
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBeNull();
  });
  it('不正な値段で追加しても値段なし。setItemPrice は不正値を無視', () => {
    const { state, item } = S.addItem(S.initialState(), { name: 'a', storeId: 'aeon', price: 'abc' });
    expect(item.price).toBeNull();
    expect(S.setItemPrice(state, item.id, '-3')).toBe(state);
    expect(S.setItemPrice(state, item.id, '１,０００').items[0].price).toBe(1000);
    expect(S.setItemPrice(S.setItemPrice(state, item.id, 50), item.id, '').items[0].price).toBeNull();
  });
  it('お店を消すとそのお店の記録も消える', () => {
    let st = buy(S.initialState(), '牛乳', 'aeon', 198);
    st = buy(st, '卵', 'matsukiyo', 250);
    st = S.deleteStore(st, 'aeon');
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBeNull();
    expect(S.lastPrice(st, 'matsukiyo', '卵')).toBe(250);
  });
  it('書き出し・取り込みで保持される', () => {
    const st = buy(S.initialState(), '牛乳', 'aeon', 198);
    const r = S.importJSON(S.exportJSON(st));
    expect(r.ok).toBe(true);
    expect(S.lastPrice(r.state, 'aeon', '牛乳')).toBe(198);
    expect(r.state.bought[0].price).toBe(198);
  });
});

describe('旧データ（priceBook なしの v1）の互換', () => {
  const old = {
    version: 1,
    stores: [{ id: 'aeon', name: 'イオン' }, { id: 'unset', name: '未設定' }],
    items: [{ id: 'i1', name: '牛乳', storeId: 'aeon', memo: 'x', addedAt: '2026-10-31T00:00:00.000Z' }],
    bought: [{ id: 'b1', name: '卵', storeId: 'aeon', memo: '', boughtAt: '2026-10-31T00:00:00.000Z', boughtDate: '2026-10-31' }],
    regulars: [{ id: 'r1', name: 'パン', storeId: 'aeon', memo: '' }],
    settings: { aisleOrder: true, lastStoreId: 'aeon' },
  };
  it('エラーにならず、既存の記録が消えない', () => {
    const mem = new Map([[S.STORAGE_KEY, JSON.stringify(old)]]);
    const st = S.load({ getItem: (k) => mem.get(k) ?? null });
    expect(st.items.map((i) => i.name)).toEqual(['牛乳']);
    expect(st.items[0].memo).toBe('x');
    expect(st.bought.map((i) => i.name)).toEqual(['卵']);
    expect(st.regulars.map((i) => i.name)).toEqual(['パン']);
    expect(st.settings).toEqual({ aisleOrder: true, lastStoreId: 'aeon' });
    expect(st.items[0].price).toBeNull();
    expect(st.priceBook).toEqual({});
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBeNull();
  });
  it('移行後に保存→再読み込みしても同じ。以後は値段を記録できる', () => {
    const mem = new Map([[S.STORAGE_KEY, JSON.stringify(old)]]);
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    let st = S.load(storage);
    st = S.setItemPrice(st, 'i1', 198);
    st = S.checkItem(st, 'i1');
    S.save(st, storage);
    const again = S.load(storage);
    expect(again.bought.map((b) => b.name)).toEqual(['卵', '牛乳']);
    expect(S.lastPrice(again, 'aeon', '牛乳')).toBe(198);
    expect(S.STORAGE_KEY).toBe('kaimono-list-v1');
  });
  it('不正な priceBook の値は捨てるが、他は残す', () => {
    const r = S.validateState({ ...old, priceBook: { 'aeon\u0000牛乳': 198, bad: 'x', neg: -1 } });
    expect(r.ok).toBe(true);
    expect(r.state.priceBook).toEqual({ 'aeon\u0000牛乳': 198 });
    expect(S.validateState({ ...old, priceBook: [1] }).state.priceBook).toEqual({});
  });
});
