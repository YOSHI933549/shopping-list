import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../src/lib/receipt.js';
import { buildReceiptDraft, matchLine } from '../src/lib/receiptDraft.js';
import { goodsForAlias, mergeGoods, productGroups, resolveGoods, splitGoods } from '../src/lib/goods.js';
import { HISTORY_VERSION, sanitizeHistory } from '../src/lib/history.js';
import * as S from '../src/state/store.js';

const now = new Date(2026, 10, 11, 18, 42, 0);
const today = '2026-11-11';

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

function milkState() {
  return S.addItem(S.initialState(), { name: '牛乳', storeId: 'aeon' }).state;
}

describe('容量と重さを品名から外す', () => {
  it('牛乳1L は牛乳と 1000ml。350g は重さになる', () => {
    const got = parseReceipt('牛乳1L 198\nヨーグルト350g 120\n合計 318');
    expect(got.items[0]).toMatchObject({ name: '牛乳', volumeMl: 1000, weightG: null, notation: '牛乳1l' });
    expect(got.items[1]).toMatchObject({ name: 'よーぐると', weightG: 350, volumeMl: null });
    expect(got.matches).toBe(true);
  });
});

describe('別名は同じ店の同じ表記だけ', () => {
  it('選んで保存すると次は自動で当たり、別の店では当たらない', () => {
    const state = milkState();
    const first = buildReceiptDraft(parseReceipt('イオン\nｷﾞｭｳﾆｭｳ1L 198\n合計 198'), state, today);
    expect(first.storeId).toBe('aeon');
    expect(first.lines[0].chosen).toBe(false);
    expect(first.lines[0].name).toBe('');
    expect(first.lines[0].candidates.map((c) => c.name)).toContain('牛乳');
    first.lines[0].name = '牛乳';
    first.lines[0].chosen = true;
    first.lines[0].goodsId = first.lines[0].candidates.find((c) => c.name === '牛乳')?.goodsId || null;

    const saved = S.saveReceipt(state, first, now);
    expect(saved.saved).toBe(true);
    expect(saved.state.history.lines[0]).toMatchObject({ name: '牛乳', raw: 'ｷﾞｭｳﾆｭｳ1L 198', notation: 'ぎゅうにゅう1l', volumeMl: 1000 });
    const goods = saved.state.history.goods.find((g) => g.name === '牛乳');
    expect(goods.aliases).toContainEqual({ storeId: 'aeon', notation: 'ぎゅうにゅう1l' });
    const back = S.importJSON(S.exportJSON(saved.state));
    expect(back.ok).toBe(true);
    expect(back.state.history.goods.find((g) => g.name === '牛乳').aliases).toContainEqual({ storeId: 'aeon', notation: 'ぎゅうにゅう1l' });
    expect(back.state.history.lines[0].raw).toBe('ｷﾞｭｳﾆｭｳ1L 198');

    const second = buildReceiptDraft(parseReceipt('イオン\nｷﾞｭｳﾆｭｳ1L 180\n合計 180'), saved.state, '2026-11-12');
    expect(second.lines[0]).toMatchObject({ name: '牛乳', chosen: true, reason: 'alias' });

    const other = buildReceiptDraft(parseReceipt('マツキヨ\nｷﾞｭｳﾆｭｳ1L 180\n合計 180'), saved.state, '2026-11-12');
    expect(other.storeId).toBe('matsukiyo');
    expect(other.lines[0].name).not.toBe('牛乳');
    expect(other.lines[0].reason).not.toBe('alias');
    expect(goodsForAlias(saved.state.history.goods, 'matsukiyo', 'ぎゅうにゅう1l')).toEqual([]);
  });

  it('候補は別名、今日の品、部分一致の順。部分一致では自動でまとめない', () => {
    const state = {
      ...S.initialState(),
      items: [
        { id: 'egg', name: '卵', storeId: 'aeon', memo: '', price: null },
        { id: 'milk', name: '牛乳', storeId: 'aeon', memo: '', price: null },
      ],
      regulars: [{ id: 'r', name: 'りんごジュース', storeId: 'aeon', memo: '' }],
      bought: [{ id: 'b', name: '食パン', storeId: 'aeon', boughtDate: today, memo: '', price: null }],
      history: {
        version: 2,
        lines: [],
        receipts: [],
        goods: [{ id: 'g', name: '牛乳', aliases: [{ storeId: 'aeon', notation: 'ぎゅうにゅう1l' }], mergedInto: null }],
      },
    };
    const alias = matchLine(state, 'aeon', 'ぎゅうにゅう', 'ぎゅうにゅう1l', today);
    expect(alias.chosen).toBe(true);
    expect(alias.name).toBe('牛乳');
    expect(alias.candidates.map((c) => [c.name, c.reason])).toEqual([
      ['牛乳', 'alias'],
      ['卵', 'today'],
      ['食パン', 'today'],
    ]);

    const fuzzy = matchLine(state, 'aeon', 'じゅーす', 'じゅーす', today);
    expect(fuzzy.chosen).toBe(false);
    expect(fuzzy.name).toBe('');
    expect(fuzzy.candidates.map((c) => [c.name, c.reason])).toEqual([
      ['卵', 'today'],
      ['牛乳', 'today'],
      ['食パン', 'today'],
      ['りんごジュース', 'overlap'],
    ]);

    const partial = matchLine({
      ...S.initialState(),
      items: [
        { id: 'a', name: '牛乳', storeId: 'aeon', memo: '', price: null },
        { id: 'b', name: 'おいしい牛乳', storeId: 'aeon', memo: '', price: null },
      ],
    }, 'aeon', '濃い牛乳', '濃い牛乳', today);
    expect(partial.chosen).toBe(false);
    expect(partial.name).toBe('');
    expect(partial.candidates.map((c) => c.name)).toEqual(['牛乳', 'おいしい牛乳']);
  });
});

describe('まとめると分ける', () => {
  const history = () => sanitizeHistory({
    version: 1,
    lines: [{
      id: 'l1', name: 'ぎゅうにゅう', raw: 'ｷﾞｭｳﾆｭｳ1L 198', notation: 'ぎゅうにゅう1l',
      storeId: 'aeon', date: today, price: 198, source: 'receipt',
    }],
    goods: [
      { id: 'g1', name: 'ぎゅうにゅう', aliases: [{ storeId: 'aeon', notation: 'ぎゅうにゅう1l' }], mergedInto: null },
      { id: 'g2', name: '牛乳', aliases: [], mergedInto: null },
    ],
  });

  it('まとめると牛乳になり、分けると元の品に戻る。元の表記は残る', () => {
    const before = history();
    const merged = mergeGoods(before, 'g1', 'g2', () => 'x');
    expect(resolveGoods(merged.goods, 'g1').name).toBe('牛乳');
    expect(goodsForAlias(merged.goods, 'aeon', 'ぎゅうにゅう1l')[0].name).toBe('牛乳');
    expect(goodsForAlias(merged.goods, 'matsukiyo', 'ぎゅうにゅう1l')).toEqual([]);
    expect(merged.lines).toEqual(before.lines);
    expect(merged.lines[0].raw).toBe('ｷﾞｭｳﾆｭｳ1L 198');
    expect(merged.lines[0].notation).toBe('ぎゅうにゅう1l');

    const back = splitGoods(merged, 'g1');
    expect(back.goods.find((g) => g.id === 'g1').mergedInto).toBeNull();
    expect(resolveGoods(back.goods, 'g1').name).toBe('ぎゅうにゅう');
    expect(goodsForAlias(back.goods, 'aeon', 'ぎゅうにゅう1l')[0].name).toBe('ぎゅうにゅう');
    expect(back.lines).toEqual(before.lines);
    expect(back.lines[0].raw).toBe(before.lines[0].raw);
  });

  it('台帳にない明細もまとめて、分けると元の品名に戻る', () => {
    const h = sanitizeHistory({
      version: 1,
      lines: [{ id: 'l', name: 'ぎゅうにゅう', raw: 'ｷﾞｭｳﾆｭｳ1L', notation: 'ぎゅうにゅう1l', storeId: 'aeon', date: today, price: 198, source: 'receipt' }],
      goods: [{ id: 'g2', name: '牛乳', aliases: [], mergedInto: null }],
    });
    expect(productGroups(h).some((g) => g.id === 'virt:ぎゅうにゅう')).toBe(true);
    const merged = mergeGoods(h, 'virt:ぎゅうにゅう', 'g2', () => 'abc');
    expect(merged.lines[0].raw).toBe('ｷﾞｭｳﾆｭｳ1L');
    expect(merged.lines[0].name).toBe('ぎゅうにゅう');
    expect(resolveGoods(merged.goods, merged.lines[0].goodsId).name).toBe('牛乳');
    const back = splitGoods(merged, merged.lines[0].goodsId);
    expect(resolveGoods(back.goods, back.lines[0].goodsId).name).toBe('ぎゅうにゅう');
    expect(back.lines[0].notation).toBe('ぎゅうにゅう1l');
    expect(goodsForAlias(back.goods, 'aeon', 'ぎゅうにゅう1l')[0].name).toBe('ぎゅうにゅう');
  });
});

describe('台帳の移行', () => {
  it('版1の履歴に空の台帳を足しても明細は消えず、2回やっても増えない', () => {
    const line = { id: 'a', name: '牛乳', storeId: 'aeon', date: '2026-10-28', price: 188, source: 'check', note: 'keep' };
    const receipt = { id: 'r1', storeId: 'aeon', date: '2026-10-28', total: 188, text: '牛乳', source: 'receipt', lane: 3 };
    const old = { version: 1, lines: [line], receipts: [receipt], extra: 'keep' };
    const once = sanitizeHistory(old);
    expect(once.version).toBe(HISTORY_VERSION);
    expect(once.goods).toEqual([]);
    expect(once.lines.map((l) => l.name)).toEqual(['牛乳']);
    expect(once.lines[0].note).toBe('keep');
    expect(once.receipts[0].lane).toBe(3);
    expect(once.extra).toBe('keep');
    const twice = sanitizeHistory(once);
    expect(twice.lines).toEqual(once.lines);
    expect(twice.goods).toEqual([]);
    expect(twice.receipts).toEqual(once.receipts);

    const { mem, storage } = memStorage([
      [S.STORAGE_KEY, '{oops'],
      [S.HISTORY_KEY, JSON.stringify(old)],
    ]);
    const loaded = S.load(storage);
    expect(loaded.state.history.version).toBe(HISTORY_VERSION);
    expect(loaded.state.history.goods).toEqual([]);
    expect(loaded.state.history.lines[0].note).toBe('keep');
    expect(mem.get(S.STORAGE_KEY)).toBe('{oops');
    const again = S.load(storage);
    expect(again.state.history.lines).toEqual(loaded.state.history.lines);
    expect(again.state.history.goods).toEqual([]);
  });
});
