import { describe, it, expect } from 'vitest';
import { priceKey } from '../src/lib/price.js';
import { goodsForAlias } from '../src/lib/goods.js';
import { renderList } from '../src/ui/list.js';
import { historySection } from '../src/ui/history.js';
import { confirmHtml } from '../src/ui/sheets.js';
import * as S from '../src/state/store.js';

const at = new Date(2026, 10, 13, 12, 0, 0);

function memStorage() {
  const mem = new Map();
  return {
    storage: {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => mem.set(k, v),
    },
  };
}

function rich() {
  return {
    ...S.initialState(),
    items: [{ id: 'i1', name: '食パン', storeId: 'aeon', memo: '', price: null }],
    regulars: [{ id: 'r1', name: '牛乳', storeId: 'aeon', memo: '' }],
    bought: [
      { id: 'b1', name: '牛乳', storeId: 'aeon', memo: '', price: 198, boughtAt: '2026-11-13T01:00:00.000Z', boughtDate: '2026-11-13' },
      { id: 'b2', name: '卵', storeId: 'aeon', memo: '', price: 258, boughtAt: '2026-11-12T01:00:00.000Z', boughtDate: '2026-11-12' },
    ],
    priceBook: { [priceKey('aeon', '牛乳')]: 198, [priceKey('aeon', '卵')]: 258 },
    history: {
      version: 2,
      keptNote: 'stay',
      lines: [
        { id: 'l1', itemId: 'b1', name: '牛乳', storeId: 'aeon', date: '2026-11-13', price: 198, source: 'check', goodsId: 'g1', receiptId: 'r1' },
        { id: 'l2', itemId: null, name: '牛乳', storeId: 'aeon', date: '2026-11-13', price: 198, source: 'receipt', goodsId: 'g1', receiptId: 'r1', raw: 'ｷﾞｭｳﾆｭｳ1L 198' },
        { id: 'l3', itemId: 'b2', name: '卵', storeId: 'aeon', date: '2026-11-12', price: 258, source: 'check' },
      ],
      receipts: [{ id: 'r1', storeId: 'aeon', date: '2026-11-13', source: 'receipt', text: '牛乳 198', savedAt: '2026-11-13T00:00:00.000Z' }],
      goods: [
        { id: 'g1', name: '牛乳', aliases: [{ storeId: 'aeon', notation: 'ぎゅうにゅう1l' }], mergedInto: null },
        { id: 'g2', name: 'ぎゅうにゅう', aliases: [{ storeId: 'matsukiyo', notation: 'ぎゅうにゅう' }], mergedInto: 'g1' },
      ],
    },
  };
}

describe('リストの削除', () => {
  it('消した品を元の位置に戻す。同じ品は二重にしない', () => {
    const first = S.addItem(S.initialState(), { name: '牛乳', storeId: 'aeon' });
    const second = S.addItem(first.state, { name: '卵', storeId: 'aeon' });
    const removed = S.removeItem(second.state, first.item.id);
    expect(removed.items.map((i) => i.name)).toEqual(['卵']);
    const back = S.insertItem(removed, first.item, 0);
    expect(back.items.map((i) => i.name)).toEqual(['牛乳', '卵']);
    expect(S.insertItem(back, first.item, 0)).toBe(back);
  });

  it('リストを空にしても、チェック済み・履歴・定期購入品は残る', () => {
    const st = rich();
    const next = S.clearItems(st);
    expect(next.items).toEqual([]);
    expect(next.bought).toBe(st.bought);
    expect(next.history).toBe(st.history);
    expect(next.regulars).toBe(st.regulars);
    expect(next.priceBook).toBe(st.priceBook);
    expect(S.clearItems(next)).toBe(next);
  });

  it('今日のチェック済みだけを外し、購入履歴は残す', () => {
    const st = rich();
    const next = S.clearBoughtToday(st, at);
    expect(next.bought.map((b) => b.id)).toEqual(['b2']);
    expect(next.history).toBe(st.history);
    expect(next.items).toEqual(st.items);
    expect(S.clearBoughtToday(next, new Date(2026, 10, 12, 12, 0, 0)).bought).toEqual([]);
  });
});

describe('購入履歴の削除', () => {
  it('1件消しても品名のまとめは残り、同じレシートの行があればレシートも残る', () => {
    const st = rich();
    const next = S.removePurchase(st, 'l2');
    expect(next.history.lines.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(next.history.receipts.map((r) => r.id)).toEqual(['r1']);
    expect(next.history.goods).toEqual(st.history.goods);
    expect(next.priceBook).toEqual(st.priceBook);
    expect(next.bought.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(S.migratePurchases(next).history.lines.map((l) => l.id)).toEqual(['l1', 'l3']);
    const missing = S.removePurchase(next, 'missing');
    expect(missing.history.lines.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(missing.history.goods).toEqual(next.history.goods);
  });

  it('最後の行を消すとレシートも消え、bought や値段メモからは作り直さない', () => {
    const once = S.removePurchase(rich(), 'l1');
    const next = S.removePurchase(once, 'l2');
    expect(next.history.lines.map((l) => l.id)).toEqual(['l3']);
    expect(next.history.receipts).toEqual([]);
    expect(next.history.goods).toEqual(rich().history.goods);
    expect(S.migratePurchases(next).history.lines.map((l) => l.name)).toEqual(['卵']);
    expect(S.lastPrice(next, 'aeon', '牛乳')).toBe(198);
  });

  it('全部消しても別名は残り、読み直しても明細は戻らない', () => {
    const st = rich();
    const cleared = S.clearPurchases(st);
    expect(cleared.history.lines).toEqual([]);
    expect(cleared.history.receipts).toEqual([]);
    expect(cleared.history.keptNote).toBe('stay');
    expect(cleared.history.goods).toEqual(st.history.goods);
    expect(goodsForAlias(cleared.history.goods, 'aeon', 'ぎゅうにゅう1l')[0].name).toBe('牛乳');
    expect(cleared.history.goods.find((g) => g.id === 'g2').mergedInto).toBe('g1');
    expect(cleared.priceBook).toEqual(st.priceBook);
    expect(cleared.bought).toHaveLength(2);
    expect(cleared.items).toEqual(st.items);
    expect(cleared.regulars).toEqual(st.regulars);
    expect(S.migratePurchases(cleared).history.lines).toEqual([]);

    const { storage } = memStorage();
    expect(S.save(cleared, storage)).toBe(true);
    const loaded = S.load(storage);
    expect(loaded.problem).toBeNull();
    expect(loaded.state.history.lines).toEqual([]);
    expect(loaded.state.history.receipts).toEqual([]);
    expect(loaded.state.history.goods.find((g) => g.id === 'g1').aliases).toContainEqual({ storeId: 'aeon', notation: 'ぎゅうにゅう1l' });
    expect(loaded.state.history.goods.find((g) => g.id === 'g2').aliases).toContainEqual({ storeId: 'matsukiyo', notation: 'ぎゅうにゅう' });
    expect(loaded.state.priceBook).toEqual(st.priceBook);

    const added = S.addItem(cleared, { name: 'パン', storeId: 'aeon', price: 150 });
    const bought = S.checkItem(added.state, added.item.id, at);
    expect(bought.history.lines.map((l) => l.name)).toEqual(['パン']);
    expect(bought.history.goods.find((g) => g.id === 'g1').name).toBe('牛乳');
    expect(S.migratePurchases(bought).history.lines.map((l) => l.name)).toEqual(['パン']);
  });
});

describe('削除の表示', () => {
  it('品があるときは1件削除と全消去、チェック済みがあるときは件数つき', () => {
    const st = rich();
    const html = renderList(st, { filter: 'all' }, { speech: false, boughtCount: 2, now: at }).html;
    expect(html).toContain('data-action="delete-item"');
    expect(html).toContain('>消す<');
    expect(html).not.toContain('消す？');
    expect(html).toContain('チェック済み 2件を削除');
    expect(html).toContain('リストを空にする');
    expect(html).not.toMatch(/data-testid="clear-list"[^>]*disabled/);
    const armed = renderList(st, { filter: 'all', armDelete: 'i1' }, { speech: false, boughtCount: 0, now: at }).html;
    expect(armed).toContain('消す？');
    expect(armed).not.toContain('チェック済み');
  });

  it('品が0件のときは全消去を押せない', () => {
    const html = renderList(S.initialState(), { filter: 'all' }, { speech: false, boughtCount: 0, now: at }).html;
    expect(html).toMatch(/data-testid="clear-list"[^>]*disabled/);
    expect(html).not.toContain('チェック済み');
    expect(html).not.toContain('data-action="delete-item"');
  });

  it('購入履歴は件数と危険色、0件のときは押せない', () => {
    const html = historySection(rich());
    expect(html).toContain('購入履歴をすべて削除（3件）');
    expect(html).toContain('class="btn danger"');
    expect(html).toContain('data-action="delete-history"');
    expect(html).toContain('品名のまとめ（別名・名前の学習）は残ります');
    expect(html.indexOf('11/13')).toBeLessThan(html.indexOf('11/12'));
    const empty = historySection(S.initialState());
    expect(empty).toContain('購入履歴はまだありません');
    expect(empty).toMatch(/data-testid="clear-history"[^>]*disabled/);
  });

  it('全部削除の確認だけ危険色ボタンにする', () => {
    const danger = confirmHtml({ title: '購入履歴をすべて消しますか', body: '購入履歴 3件を消します。', okLabel: '3件を削除', danger: true, testid: 'confirm-history-all' });
    expect(danger).toContain('btn danger');
    expect(danger).toContain('3件を削除');
    expect(danger).toContain('data-testid="confirm-history-all"');
    const normal = confirmHtml({ title: 'リストを空にしますか', body: 'リストの 2件をすべて消します。', okLabel: '2件を消す', testid: 'confirm-clear-list' });
    expect(normal).toContain('btn red');
    expect(normal).not.toContain('btn danger');
    expect(normal).toContain('キャンセル');
  });
});
