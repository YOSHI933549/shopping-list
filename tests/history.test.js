import { describe, it, expect } from 'vitest';
import { priceKey } from '../src/lib/price.js';
import { formatLastBought, lastBoughtDate, migratePurchases } from '../src/lib/history.js';
import { renderList } from '../src/ui/list.js';
import * as S from '../src/state/store.js';

const at = (s) => new Date(s);
const day = new Date(2026, 10, 11, 15, 0, 0);

function memStorage(entries = []) {
  const mem = new Map(entries);
  return {
    mem,
    storage: {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => mem.set(k, v),
    },
  };
}

describe('前回の日付', () => {
  const lines = [
    { id: 'a', name: 'ぎゅうにゅう', storeId: 'aeon', date: '2026-10-28', price: 188, source: 'check' },
    { id: 'b', name: 'ぎゅうにゅう', storeId: 'aeon', date: '2026-10-01', price: 170, source: 'check' },
    { id: 'c', name: 'ぎゅうにゅう', storeId: 'aeon', date: null, price: 199, source: 'migrate' },
    { id: 'd', name: '牛乳', storeId: 'matsukiyo', date: '2026-11-10', price: 210, source: 'check' },
  ];

  it('同じお店・正規化した品名の、いちばん新しい日付だけを出す', () => {
    expect(lastBoughtDate(lines, 'aeon', 'ギュウニュウ')).toBe('2026-10-28');
    expect(formatLastBought('2026-10-28', day)).toBe('前回 10/28（14日前）');
    expect(formatLastBought(lastBoughtDate(lines, 'aeon', 'ぎゅうにゅう'), day)).toBe('前回 10/28（14日前）');
    // 漢字とかなは、今の normalize では別の品のまま
    expect(lastBoughtDate(lines, 'aeon', '牛乳')).toBeNull();
  });

  it('日付不明は前回日にしない。お店が違えば出さない。記録が無ければ null', () => {
    expect(lastBoughtDate([{ id: 'c', name: '牛乳', storeId: 'aeon', date: null, price: 199 }], 'aeon', '牛乳')).toBeNull();
    expect(formatLastBought(null, day)).toBeNull();
    expect(lastBoughtDate(lines, 'amazon', '牛乳')).toBeNull();
    expect(formatLastBought('2026-11-10', day)).toBe('前回 11/10（昨日）');
    expect(formatLastBought('2026-11-11', day)).toBe('前回 11/11（今日）');
    expect(formatLastBought('2025-12-20', day)).toBe('前回 12/20（326日前）');
  });

  it('リストの行に薄く出し、記録の無い品には出さない', () => {
    const state = {
      ...S.initialState(),
      items: [
        { id: 'i1', name: '牛乳', storeId: 'aeon', memo: '', price: 198 },
        { id: 'i2', name: '卵', storeId: 'aeon', memo: 'Mサイズ', price: null },
      ],
      history: { version: 1, lines: [{ id: 'a', name: '牛乳', storeId: 'aeon', date: '2026-10-28', price: 188, source: 'check' }] },
    };
    const html = renderList(state, { filter: 'all' }, { speech: false, boughtCount: 0, now: day }).html;
    expect(html).toContain('前回 10/28（14日前）');
    expect(html.match(/class="last"/g)).toHaveLength(1);
    expect(html).not.toContain('前回 11/10');
  });
});

describe('移行', () => {
  const bought = [
    { id: 'b1', name: '牛乳', storeId: 'aeon', memo: '冷やす', price: 198, boughtAt: '2026-10-28T01:00:00.000Z', boughtDate: '2026-10-28', addedAt: '2026-10-27T00:00:00.000Z' },
    { id: 'b2', name: '卵', storeId: 'aeon', memo: '', price: null, boughtAt: '2026-09-01T01:00:00.000Z', boughtDate: '2026-09-01' },
  ];
  const state = () => ({
    ...S.initialState(),
    items: [{ id: 'i1', name: '牛乳', storeId: 'aeon', memo: '', price: null }],
    regulars: [{ id: 'r1', name: '食パン', storeId: 'aeon', memo: '' }, { id: 'r2', name: 'ヨーグルト', storeId: 'aeon', memo: '' }],
    bought,
    priceBook: {
      [priceKey('aeon', '牛乳')]: 198,
      [priceKey('aeon', '食パン')]: 150,
      [priceKey('aeon', 'よーぐると')]: 120,
      [priceKey('matsukiyo', 'ぎゅうにゅう')]: 210,
    },
  });

  it('30日より前の bought も明細になり、priceBook は日付不明。同じ値段は二重にしない', () => {
    const once = migratePurchases(state());
    const names = once.history.lines.map((l) => [l.name, l.storeId, l.date, l.price, l.source]);
    expect(names).toEqual([
      ['牛乳', 'aeon', '2026-10-28', 198, 'migrate'],
      ['卵', 'aeon', '2026-09-01', null, 'migrate'],
      ['食パン', 'aeon', null, 150, 'migrate'],
      ['ヨーグルト', 'aeon', null, 120, 'migrate'],
      ['ぎゅうにゅう', 'matsukiyo', null, 210, 'migrate'],
    ]);
    expect(once.history.lines[0].memo).toBe('冷やす');
    expect(once.history.lines[0].addedAt).toBe('2026-10-27T00:00:00.000Z');
    expect(once.history.lines[0].itemId).toBe('b1');
    expect(once.history.lines[2].itemId).toBeNull();
    expect(once.bought).toHaveLength(2);
    expect(once.priceBook[priceKey('aeon', '食パン')]).toBe(150);
  });

  it('2回移しても増えない', () => {
    const once = migratePurchases(state());
    const twice = migratePurchases(once);
    expect(twice.history.lines).toEqual(once.history.lines);
    const fromJson = migratePurchases(JSON.parse(JSON.stringify(once)));
    expect(fromJson.history.lines).toEqual(once.history.lines);
  });
});

describe('チェックと戻す', () => {
  it('丸を押すと明細が増え、戻すと消え、31日後も明細は残る', () => {
    const added = S.addItem(S.initialState(), { name: '牛乳', storeId: 'aeon', price: 198, memo: '冷' });
    const bought = S.checkItem(added.state, added.item.id, at('2026-10-01T10:00:00'));
    expect(bought.items).toHaveLength(0);
    expect(bought.bought).toHaveLength(1);
    expect(bought.history.lines).toHaveLength(1);
    expect(bought.history.lines[0]).toMatchObject({ itemId: added.item.id, name: '牛乳', storeId: 'aeon', date: '2026-10-01', price: 198, source: 'check', memo: '冷' });
    expect(S.lastPrice(bought, 'aeon', '牛乳')).toBe(198);

    const back = S.undoBought(bought, added.item.id);
    expect(back.bought).toHaveLength(0);
    expect(back.items[0].name).toBe('牛乳');
    expect(back.history.lines).toHaveLength(0);
    expect(S.lastPrice(back, 'aeon', '牛乳')).toBeNull();

    const again = S.checkItem(back, added.item.id, at('2026-10-01T10:00:00'));
    const later = S.pruneBought(again, at('2026-11-11T10:00:00'), 30);
    expect(later.bought).toHaveLength(0);
    expect(later.history.lines).toHaveLength(1);
    expect(later.history.lines[0].date).toBe('2026-10-01');
    expect(formatLastBought(lastBoughtDate(later.history.lines, 'aeon', '牛乳'), at('2026-11-11T10:00:00'))).toBe('前回 10/1（41日前）');
  });

  it('戻すと一つ前の値段に戻り、日付不明の値段も残る', () => {
    let st = {
      ...S.initialState(),
      priceBook: { [priceKey('aeon', '牛乳')]: 188 },
    };
    const added = S.addItem(st, { name: '牛乳', storeId: 'aeon', price: 210 });
    st = S.checkItem(added.state, added.item.id, at('2026-11-11T10:00:00'));
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBe(210);
    st = S.undoBought(st, added.item.id);
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBe(188);
    expect(st.history.lines.map((l) => l.price)).toEqual([188]);
    expect(st.history.lines[0].date).toBeNull();
  });

  it('お店を消しても明細は残る', () => {
    const added = S.addItem(S.initialState(), { name: '牛乳', storeId: 'aeon', price: 198 });
    let st = S.checkItem(added.state, added.item.id, at('2026-10-28T10:00:00'));
    st = S.deleteStore(st, 'aeon');
    expect(S.lastPrice(st, 'aeon', '牛乳')).toBeNull();
    expect(st.history.lines).toHaveLength(1);
    expect(st.history.lines[0].storeId).toBe('aeon');
    expect(st.history.lines[0].date).toBe('2026-10-28');
  });
});

describe('書き出しと未知の項目', () => {
  it('書き出し→取り込みで明細が残り、知らない項目も落ちない', () => {
    const added = S.addItem(S.initialState(), { name: '牛乳', storeId: 'aeon', price: 198 });
    let st = S.checkItem(added.state, added.item.id, at('2026-10-28T10:00:00'));
    st = {
      ...st,
      futureNote: 'keep-me',
      settings: { ...st.settings, theme: 'paper' },
      history: { ...st.history, lines: st.history.lines.map((l) => ({ ...l, receiptId: 'r_later', qty: 2 })) },
    };
    st.items = [];
    const exported = S.exportJSON(st);
    const back = S.importJSON(exported);
    expect(back.ok).toBe(true);
    expect(back.state.futureNote).toBe('keep-me');
    expect(back.state.settings.theme).toBe('paper');
    expect(back.state.history.lines).toHaveLength(1);
    expect(back.state.history.lines[0].receiptId).toBe('r_later');
    expect(back.state.history.lines[0].qty).toBe(2);
    expect(back.state.history.lines[0].date).toBe('2026-10-28');
    const again = S.importJSON(S.exportJSON(back.state));
    expect(again.state.history.lines).toEqual(back.state.history.lines);
  });

  it('品物・お店に付いた知らない項目も残す', () => {
    const data = {
      ...S.initialState(),
      items: [{ id: 'i', name: '牛乳', storeId: 'aeon', memo: '', hue: 3 }],
      stores: S.initialState().stores.map((s) => (s.id === 'aeon' ? { ...s, code: 'A' } : s)),
    };
    const r = S.validateState(data);
    expect(r.ok).toBe(true);
    expect(r.state.items[0].hue).toBe(3);
    expect(r.state.stores.find((s) => s.id === 'aeon').code).toBe('A');
  });
});

describe('読めない保存データ', () => {
  it('壊れたリストは初期化せず控えに残し、元のキーを消さない', () => {
    const { mem, storage } = memStorage([[S.STORAGE_KEY, '{oops']]);
    const first = S.load(storage);
    expect(first.problem.scope).toBe('list');
    expect(first.problem.preserved).toBe(true);
    expect(first.problem.raw).toBe('{oops');
    expect(first.state.items).toEqual([]);
    expect(mem.get(S.STORAGE_KEY)).toBe('{oops');
    const q = JSON.parse(mem.get(`${S.STORAGE_KEY}-unreadable`));
    expect(q.entries.map((e) => e.raw)).toEqual(['{oops']);

    const second = S.load(storage);
    expect(second.problem.scope).toBe('list');
    expect(mem.get(S.STORAGE_KEY)).toBe('{oops');
    expect(JSON.parse(mem.get(`${S.STORAGE_KEY}-unreadable`)).entries).toHaveLength(1);
  });

  it('リストが壊れていても、別キーの購入履歴は残る', () => {
    const line = { id: 'h', itemId: null, name: '牛乳', storeId: 'aeon', date: '2026-10-28', price: 188, memo: '', source: 'check' };
    const { mem, storage } = memStorage([
      [S.STORAGE_KEY, '{oops'],
      [S.HISTORY_KEY, JSON.stringify({ version: 1, lines: [line] })],
    ]);
    const r = S.load(storage);
    expect(r.problem.scope).toBe('list');
    expect(mem.get(S.STORAGE_KEY)).toBe('{oops');
    expect(r.state.history.lines.map((l) => l.name)).toEqual(['牛乳']);
    expect(JSON.parse(mem.get(S.HISTORY_KEY)).lines.map((l) => l.name)).toEqual(['牛乳']);
    S.save(r.state, storage);
    expect(mem.get(S.STORAGE_KEY)).not.toBe('{oops');
    expect(JSON.parse(mem.get(S.STORAGE_KEY)).items).toEqual([]);
    expect(JSON.parse(mem.get(S.HISTORY_KEY)).lines.map((l) => l.name)).toEqual(['牛乳']);
    expect(JSON.parse(mem.get(`${S.STORAGE_KEY}-unreadable`)).entries[0].raw).toBe('{oops');
  });

  it('別の壊れた文字列が来ても、前の控えは残る', () => {
    const { mem, storage } = memStorage([[S.STORAGE_KEY, '{oops']]);
    S.load(storage);
    mem.set(S.STORAGE_KEY, '[1]');
    S.load(storage);
    const q = JSON.parse(mem.get(`${S.STORAGE_KEY}-unreadable`));
    expect(q.entries.map((e) => e.raw)).toEqual(['{oops', '[1]']);
    expect(mem.get(S.STORAGE_KEY)).toBe('[1]');
  });

  it('読み出しそのものが失敗しても投げず、上書きしない', () => {
    const fake = { getItem() { throw new Error('x'); }, setItem() { throw new Error('no'); } };
    const r = S.load(fake);
    expect(r.problem).toEqual({ scope: 'list', reason: 'unavailable', preserved: false, raw: null });
    expect(r.state.items).toEqual([]);
  });

  it('履歴キーが配列でもリストは開き、元の文字を控える', () => {
    const list = { ...S.initialState(), items: [{ id: 'i1', name: '牛乳', storeId: 'aeon', memo: '', price: null }] };
    const rawList = JSON.stringify(list);
    const { mem, storage } = memStorage([[S.STORAGE_KEY, rawList], [S.HISTORY_KEY, '[1,2]']]);
    const r = S.load(storage);
    expect(r.problem.scope).toBe('history');
    expect(r.state.items.map((i) => i.name)).toEqual(['牛乳']);
    expect(mem.get(S.HISTORY_KEY)).toBe('[1,2]');
    expect(JSON.parse(mem.get(`${S.HISTORY_KEY}-unreadable`)).entries[0].raw).toBe('[1,2]');
    expect(mem.get(S.STORAGE_KEY)).toBe(rawList);
  });

  it('履歴キーだけ壊れていてもリストは開き、元の文字を控える', () => {
    const list = {
      ...S.initialState(),
      items: [{ id: 'i1', name: '牛乳', storeId: 'aeon', memo: '', price: null, addedAt: '2026-11-01T00:00:00.000Z' }],
      bought: [{ id: 'b1', name: '卵', storeId: 'aeon', memo: '', price: 250, boughtAt: '2026-10-28T00:00:00.000Z', boughtDate: '2026-10-28' }],
    };
    const rawList = JSON.stringify(list);
    const { mem, storage } = memStorage([[S.STORAGE_KEY, rawList], [S.HISTORY_KEY, '{bad']]);
    const r = S.load(storage);
    expect(r.problem.scope).toBe('history');
    expect(r.problem.raw).toBe('{bad');
    expect(r.state.items.map((i) => i.name)).toEqual(['牛乳']);
    expect(r.state.history.lines.map((l) => l.name)).toEqual(['卵']);
    expect(mem.get(S.STORAGE_KEY)).toBe(rawList);
    expect(mem.get(S.HISTORY_KEY)).toBe('{bad');
    expect(JSON.parse(mem.get(`${S.HISTORY_KEY}-unreadable`)).entries[0].raw).toBe('{bad');
  });

  it('読めたデータは履歴キーへ移し、リストのキーは読み込みでは書き換えない', () => {
    const old = {
      version: 1,
      stores: S.initialState().stores,
      items: [],
      bought: [{ id: 'b1', name: '卵', storeId: 'aeon', memo: '', boughtAt: '2026-10-28T00:00:00.000Z', boughtDate: '2026-10-28' }],
      regulars: [],
      settings: { aisleOrder: false, lastStoreId: 'aeon' },
    };
    const raw = JSON.stringify(old);
    const { mem, storage } = memStorage([[S.STORAGE_KEY, raw]]);
    const r = S.load(storage);
    expect(r.problem).toBeNull();
    expect(mem.get(S.STORAGE_KEY)).toBe(raw);
    expect(JSON.parse(mem.get(S.HISTORY_KEY)).lines.map((l) => l.name)).toEqual(['卵']);
    const second = S.load(storage);
    expect(second.state.history.lines).toEqual(r.state.history.lines);
  });
});
