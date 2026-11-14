import { describe, it, expect } from 'vitest';
import { DELETED_STORE, formatPurchaseDate, itemHistory, purchaseView } from '../src/lib/purchaseView.js';
import { renderPurchases } from '../src/ui/purchase.js';
import { historySection } from '../src/ui/history.js';
import * as S from '../src/state/store.js';

const now = new Date(2026, 10, 13, 12, 0, 0);
const stores = [
  { id: 'amazon', name: 'Amazon' },
  { id: 'aeon', name: 'イオン' },
  { id: 'matsukiyo', name: 'マツキヨ' },
  { id: 'unset', name: '未設定' },
];

function line(id, name, storeId, date, price, extra = {}) {
  return {
    id, name, storeId, date, price, boughtAt: extra.boughtAt || (date ? `${date}T03:00:00.000Z` : null),
    source: 'check', memo: '', itemId: null, ...extra,
  };
}

const goods = [
  { id: 'g1', name: 'ぎゅうにゅう', aliases: [{ storeId: 'aeon', notation: 'ぎゅうにゅう1l' }], mergedInto: 'g2' },
  { id: 'g2', name: '牛乳', aliases: [{ storeId: 'matsukiyo', notation: 'ぎゅうにゅう' }], mergedInto: null },
];

function history(lines, extraGoods = goods) {
  return { version: 2, lines, receipts: [], goods: extraGoods };
}

const sample = () => history([
  line('a', 'ぎゅうにゅう', 'aeon', '2026-11-12', 198, { goodsId: 'g1', boughtAt: '2026-11-12T01:00:00.000Z', notation: 'ぎゅうにゅう1l' }),
  line('b', '牛乳', 'matsukiyo', '2026-11-12', 188, { goodsId: 'g2', boughtAt: '2026-11-12T05:00:00.000Z' }),
  line('c', '牛乳', 'aeon', '2026-10-20', 158, { goodsId: 'g2' }),
  line('d', '卵', 'aeon', '2026-11-12', null),
  line('e', '卵', 'aeon', '2026-11-01', 258),
  line('f', '食パン', 'amazon', '2026-09-02', 138),
  line('g', '玉ねぎ', 'closed', '2026-10-02', 100),
  line('h', '人参', 'aeon', null, 80),
  line('i', '牛肉', 'aeon', '2026-11-03', 580),
]);

describe('購入履歴のまとめ', () => {
  it('日付の新しい順に、店と合計を出し、値段の無い品は合計に入れない', () => {
    const view = purchaseView(sample(), stores, { now });
    expect(view.days.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-03', '2026-11-01', '2026-10-20', '2026-10-02', '2026-09-02', null]);
    const day = view.days[0];
    expect(day.heading).toBe('2026年11月12日（木）');
    expect(day.storesLabel).toBe('イオン・マツキヨ');
    expect(day.total).toBe(198 + 188);
    expect(day.missing).toBe(1);
    expect(day.items.map((item) => [item.name, item.price, item.storeName])).toEqual([
      ['牛乳', 188, 'マツキヨ'],
      ['卵', null, 'イオン'],
      ['牛乳', 198, 'イオン'],
    ]);
    expect(view.total).toBe(198 + 188 + 158 + 258 + 138 + 100 + 80 + 580);
    expect(view.missing).toBe(1);
    expect(view.empty).toBeNull();
  });

  it('まとめ後の名前を出し、前回の値段はそれより古い購入のいちばん新しい値段', () => {
    const view = purchaseView(sample(), stores, { now });
    const milk = view.days[0].items.filter((item) => item.name === '牛乳');
    expect(milk.map((item) => item.previous)).toEqual([198, 158]);
    const older = view.days.find((d) => d.date === '2026-10-20').items[0];
    expect(older.name).toBe('牛乳');
    expect(older.previous).toBeNull();
    const egg = view.days[0].items.find((item) => item.name === '卵');
    expect(egg.previous).toBe(258);
    expect(view.days.find((d) => d.date === '2026-11-01').items[0].previous).toBeNull();
  });

  it('日付不明には前回を出さず、すべてにだけ残る', () => {
    const all = purchaseView(sample(), stores, { now, period: 'all' });
    const unknown = all.days.at(-1);
    expect(unknown.heading).toBe('日付不明');
    expect(unknown.items[0].previous).toBeNull();
    expect(purchaseView(sample(), stores, { now, period: 'month' }).days.some((d) => d.date == null)).toBe(false);
    expect(purchaseView(sample(), stores, { now, period: 'last' }).days.some((d) => d.date == null)).toBe(false);
  });

  it('今月・先月・お店で絞り、条件の文言と合計を返す', () => {
    const month = purchaseView(sample(), stores, { now, period: 'month', storeId: 'aeon' });
    expect(month.condition).toBe('今月・イオン');
    expect(month.days.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-03', '2026-11-01']);
    expect(month.total).toBe(198 + 580 + 258);
    expect(month.missing).toBe(1);
    expect(month.days[0].items.map((item) => item.name)).toEqual(['卵', '牛乳']);
    const last = purchaseView(sample(), stores, { now, period: 'last' });
    expect(last.condition).toBe('先月・すべてのお店');
    expect(last.days.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-02']);
    expect(last.total).toBe(258);
    expect(last.choices.map((c) => c.name)).toEqual(['すべて', 'Amazon', 'イオン', 'マツキヨ', '削除したお店']);
    const gone = purchaseView(sample(), stores, { now, storeId: DELETED_STORE });
    expect(gone.days.flatMap((d) => d.items).map((item) => item.name)).toEqual(['玉ねぎ']);
    expect(gone.condition).toBe('すべて・削除したお店');
  });

  it('年をまたぐ先月と、値段0は合計に入れる', () => {
    const jan = new Date(2026, 0, 15);
    const h = history([
      line('a', '牛乳', 'aeon', '2026-01-02', 0),
      line('b', '牛乳', 'aeon', '2025-12-31', 120),
      line('c', '牛乳', 'aeon', '2025-11-30', 90),
    ], []);
    expect(purchaseView(h, stores, { now: jan, period: 'month' }).days.map((d) => d.date)).toEqual(['2026-01-02']);
    expect(purchaseView(h, stores, { now: jan, period: 'month' }).total).toBe(0);
    expect(purchaseView(h, stores, { now: jan, period: 'last' }).days.map((d) => d.date)).toEqual(['2025-12-31']);
    expect(formatPurchaseDate('2026-11-13')).toBe('2026年11月13日（金）');
  });

  it('品名検索は端末内の文字だけで、カナの正規化と別名に当たる', () => {
    const by = (query) => purchaseView(sample(), stores, { now, query }).days.flatMap((d) => d.items).map((item) => item.name);
    expect(by('牛')).toEqual(['牛乳', '牛乳', '牛肉', '牛乳']);
    expect(by('ギュウニュウ')).toEqual(['牛乳', '牛乳', '牛乳']);
    expect(by('ｷﾞｭｳﾆｭｳ')).toEqual(['牛乳', '牛乳', '牛乳']);
    expect(by('たまご')).toEqual([]);
    expect(by('卵')).toEqual(['卵', '卵']);
    expect(purchaseView(sample(), stores, { now, query: 'ない品' }).empty).toBe('filtered');
    expect(purchaseView(sample(), stores, { now, query: ' 牛 ' }).condition).toBe('すべて・すべてのお店・「牛」');
    expect(purchaseView({ version: 2, lines: [], goods: [] }, stores, { now }).empty).toBe('none');
  });

  it('直前が値段なしでも、その前の値段を前回にする。履歴自体は変えない', () => {
    const h = history([
      line('a', '牛乳', 'aeon', '2026-10-01', 150),
      line('b', '牛乳', 'aeon', '2026-10-20', null),
      line('c', '牛乳', 'aeon', '2026-11-01', 180),
    ], []);
    const before = JSON.stringify(h);
    const view = purchaseView(h, stores, { now, period: 'month' });
    expect(view.days[0].items[0].previous).toBe(150);
    expect(JSON.stringify(h)).toBe(before);
  });
});

describe('品の過去', () => {
  it('最安の店と平均を、値段がある分だけで出す。同額なら新しい店', () => {
    const detail = itemHistory(sample(), stores, 'name:牛乳');
    expect(detail.name).toBe('牛乳');
    expect(detail.stats).toEqual({ min: 158, storeName: 'イオン', avg: Math.round((198 + 188 + 158) / 3) });
    expect(detail.rows.map((row) => row.date)).toEqual(['2026-11-12', '2026-11-12', '2026-10-20']);
    const tied = history([
      line('a', '卵', 'aeon', '2026-10-01', 200),
      line('b', '卵', 'matsukiyo', '2026-11-01', 200),
      line('c', '卵', 'amazon', '2026-11-02', null),
    ], []);
    expect(itemHistory(tied, stores, 'name:卵').stats).toEqual({ min: 200, storeName: 'マツキヨ', avg: 200 });
    expect(itemHistory(tied, stores, 'name:卵').rows[0].price).toBeNull();
    expect(itemHistory(history([line('a', '塩', 'aeon', '2026-11-01', null)], []), stores, 'name:塩').stats).toBeNull();
  });
});

describe('購入履歴の画面', () => {
  const state = { ...S.initialState(), stores, history: sample() };

  it('一覧に前回と—と値段なし件数を出し、削除ボタンは出さない', () => {
    const html = renderPurchases(state, { purchasePeriod: 'all', purchaseStore: 'all', purchaseQuery: '' }, now);
    expect(html).toContain('>今月</button>');
    expect(html).toContain('>先月</button>');
    expect(html).toContain('>すべて</button>');
    expect(html).toContain('data-testid="history-filters"');
    expect(html).toContain('前回¥198');
    expect(html).toContain('data-testid="purchase-noprice">—</span>');
    expect(html).toContain('※値段なし1件');
    expect(html).toContain('すべて・すべてのお店');
    expect(html).not.toContain('delete-history');
    expect(html).not.toContain('条件を外す');
    expect(html).not.toContain('purchase-stats');
  });

  it('絞り込み0件は条件を外す。履歴0件は使い方だけ', () => {
    const none = renderPurchases(state, { purchaseQuery: 'ない品' }, now);
    expect(none).toContain('data-testid="history-reset"');
    expect(none).toContain('条件を外す');
    expect(none).toContain('合計 ¥0');
    expect(none).not.toContain('購入履歴はまだありません');
    const empty = renderPurchases({ ...S.initialState(), history: { version: 2, lines: [], goods: [], receipts: [] } }, {}, now);
    expect(none).toContain('条件に合う<br>購入がありません。');
    expect(empty).toContain('購入履歴はまだありません');
    expect(empty).toContain('丸を押すと、<br>買った品がここに残ります。');
    expect(empty).not.toContain('history-reset');
  });

  it('品の過去一覧に最安と平均を1行出す', () => {
    const html = renderPurchases(state, { purchaseItem: 'name:牛乳' }, now);
    expect(html).toContain('data-testid="purchase-stats"');
    expect(html).toContain(`最安 ¥158（イオン）・平均 ¥${Math.round((198 + 188 + 158) / 3)}`);
    expect(html).toContain('マツキヨ');
    expect(html).not.toContain('delete-history');
    expect(html).not.toContain('history-query');
  });

  it('マイページの短い一覧と削除はそのまま残る', () => {
    const html = historySection(state);
    expect(html).toContain('data-testid="open-history"');
    expect(html).toContain('購入履歴を見る');
    expect(html).toContain('data-action="delete-history"');
    expect(html).toContain('data-testid="clear-history"');
  });
});
