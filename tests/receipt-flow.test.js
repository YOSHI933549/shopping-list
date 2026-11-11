import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../src/lib/receipt.js';
import {
  EXPORT_NUDGE_COUNT, buildReceiptDraft, describeTotals, editLine, existingName, exportNudge,
  keyboardInset, productChoices, suggestStores, totalsLabel,
} from '../src/lib/receiptDraft.js';
import { unionHistory } from '../src/lib/history.js';
import { confirmSheetHtml } from '../src/ui/receipt.js';
import { renderList } from '../src/ui/list.js';
import * as S from '../src/state/store.js';

const now = new Date(2026, 10, 11, 18, 42, 0);
const today = '2026-11-11';

function withMilk(name = '牛乳', storeId = 'aeon') {
  return S.addItem(S.initialState(), { name, storeId, price: 150 }).state;
}

describe('お店の候補と品名の完全一致', () => {
  const stores = [
    ...S.initialState().stores,
    { id: 'style', name: 'イオンスタイル' },
  ];

  it('店名が本文に含まれるお店だけを、長い名前から出す', () => {
    expect(suggestStores(stores, 'イオンスタイル幕張\n牛乳 198').map((s) => s.name)).toEqual(['イオンスタイル', 'イオン']);
    expect(suggestStores(stores, 'アマゾン 牛乳 198').map((s) => s.id)).toEqual([]);
    expect(suggestStores(stores, 'Amazon.co.jp\n牛乳 198').map((s) => s.id)).toEqual(['amazon']);
    expect(suggestStores(stores, '未設定の品 100').map((s) => s.id)).not.toContain('unset');
  });

  it('normalize 後の完全一致だけ既存の表記にし、漢字とかなはまとめない', () => {
    const state = {
      ...withMilk('ギュウニュウ'),
      items: [
        { id: 'a', name: 'ギュウニュウ', storeId: 'aeon', memo: '', price: null },
        { id: 'b', name: '牛乳', storeId: 'aeon', memo: '', price: null },
        { id: 'c', name: 'おいしい牛乳', storeId: 'aeon', memo: '', price: null },
      ],
    };
    expect(existingName(state, 'aeon', 'ぎゅうにゅう')).toBe('ギュウニュウ');
    expect(existingName(state, 'aeon', '牛乳')).toBe('牛乳');
    expect(existingName(state, 'matsukiyo', 'ぎゅうにゅう')).toBe('ギュウニュウ');
    expect(existingName(state, 'aeon', 'ぎゅうにゅう1')).toBeNull();
    const parsed = parseReceipt('ｷﾞｭｳﾆｭｳ1L 198\nおいしい牛乳 220\n合計 418');
    const draft = buildReceiptDraft(parsed, state, today);
    expect(draft.lines.filter((l) => l.kind === 'item').map((l) => l.name)).toEqual(['ギュウニュウ', 'おいしい牛乳']);
    expect(draft.lines.find((l) => l.parsedName === 'ぎゅうにゅう').name).toBe('ギュウニュウ');
  });

  it('候補は同じお店を先に出し、表記が同じものは一つ', () => {
    const state = {
      ...S.initialState(),
      items: [{ id: 'a', name: '牛乳', storeId: 'aeon', memo: '', price: null }],
      regulars: [{ id: 'b', name: 'ギュウニュウ', storeId: 'matsukiyo', memo: '' }],
      history: { version: 1, lines: [{ id: 'h', name: '牛乳', storeId: 'aeon', date: today }], receipts: [] },
    };
    expect(productChoices(state, 'matsukiyo')).toEqual(['ギュウニュウ', '牛乳']);
  });
});

describe('確認画面の合計', () => {
  it('40円のずれを色のない文言にする。合っていれば一致。合計が無ければ空', () => {
    expect(describeTotals(500, 460)).toMatchObject({ difference: 40, matches: false, note: '合計と40円ずれています' });
    expect(describeTotals(834, 834).note).toBe('一致');
    expect(describeTotals(100, null)).toMatchObject({ matches: null, note: '' });
    const off = totalsLabel({ lines: [{ kind: 'item', amount: 500 }], total: 460 });
    expect(off.line).toBe('明細の合計 500円 ／ レシートの合計 460円');
    expect(off.note).toBe('合計と40円ずれています');
  });

  it('割引は明細の金額に含まれ、割引行を二重に足さない', () => {
    const parsed = parseReceipt('牛乳 198\n値引 -20\n合計 178');
    const draft = buildReceiptDraft(parsed, S.initialState(), today);
    expect(draft.lines[0]).toMatchObject({ name: '牛乳', amount: 178, discount: 20, quantity: 1, unitPrice: 198 });
    expect(totalsLabel(draft).note).toBe('一致');
  });

  it('数量を直すと、金額を手で直すまでは単価×数量−割引になる', () => {
    const line = { kind: 'item', name: '牛乳', quantity: 1, unitPrice: 198, discount: 20, amount: 178, amountTouched: false };
    const qty = editLine(line, 'quantity', '2');
    expect(qty.amount).toBe(376);
    const typed = editLine(qty, 'amount', '300');
    expect(editLine(typed, 'quantity', '3').amount).toBe('300');
  });

  it('確認画面は元の表記とずれの文言を出し、ずれ用の色クラスは付けない', () => {
    const parsed = parseReceipt('牛乳 200\n卵 300\n◆今週のおすすめ◆\n合計 460');
    const draft = buildReceiptDraft(parsed, withMilk(), today);
    const html = confirmSheetHtml(withMilk(), draft);
    expect(html).toContain('牛乳 200');
    expect(html).toContain('合計と40円ずれています');
    expect(html).toContain('不明な行');
    expect(html).toContain('◆今週のおすすめ◆');
    expect(html).not.toContain('mismatch');
    expect(html).not.toContain('color:');
    expect(renderList(S.initialState(), { filter: 'all' }, { speech: false, boughtCount: 0 }).html).toContain('レシートを読む');
  });
});

describe('レシートの保存', () => {
  const text = [
    'イオン',
    '2026年11月11日 18:42',
    '牛乳 198',
    'タマゴ 258',
    '会員番号 1234-5678-9012',
    '合計 456',
  ].join('\n');

  function saved(state = withMilk()) {
    const draft = buildReceiptDraft(parseReceipt(text), state, today);
    draft.lines = draft.lines.map((line) => (line.parsedName === 'たまご' ? { ...line, name: '卵' } : line));
    return S.saveReceipt(state, draft, now);
  }

  it('レシート1件と明細を足し、リストの同じ品は買った扱いにする', () => {
    const state = withMilk();
    state.items.push({ id: 'bread', name: '食パン', storeId: 'aeon', memo: '', price: null });
    state.items.push({ id: 'other', name: '牛乳', storeId: 'amazon', memo: '', price: null });
    const result = saved(state);
    expect(result.saved).toBe(true);
    expect(result.state.items.map((i) => [i.name, i.storeId])).toEqual([['食パン', 'aeon'], ['牛乳', 'amazon']]);
    expect(result.state.bought.map((b) => b.name)).toEqual(['牛乳']);
    expect(result.state.bought[0].boughtDate).toBe(today);
    expect(result.state.history.receipts).toHaveLength(1);
    expect(result.state.history.receipts[0]).toMatchObject({ storeId: 'aeon', date: today, time: '18:42', total: 456, tax: '不明', source: 'receipt' });
    expect(result.state.history.receipts[0].text).not.toContain('1234-5678-9012');
    expect(result.state.history.receipts[0].text).toContain('牛乳 198');
    const lines = result.state.history.lines.filter((l) => l.source === 'receipt');
    expect(lines.map((l) => l.name)).toEqual(['牛乳', '卵']);
    expect(lines[0]).toMatchObject({ raw: '牛乳 198', quantity: 1, unitPrice: 198, amount: 198, price: 198, receiptId: result.receipt.id, itemId: null });
    expect(lines.some((l) => l.kind === 'unknown' || l.name === 'イオン')).toBe(false);
    expect(S.lastPrice(result.state, 'aeon', '牛乳')).toBe(198);
    const again = S.migratePurchases(result.state);
    expect(again.history.lines).toHaveLength(result.state.history.lines.length);
    expect(again.history.receipts).toHaveLength(1);
  });

  it('選ばなければ、元の表記から作った品名のまま新しい品として残す', () => {
    const state = withMilk('牛乳');
    const draft = buildReceiptDraft(parseReceipt('ｷﾞｭｳﾆｭｳ1L 198\n合計 198'), state, today);
    draft.storeId = 'aeon';
    expect(draft.lines[0].name).toBe('ぎゅうにゅう');
    const result = S.saveReceipt(state, draft, now);
    expect(result.state.items.map((i) => i.name)).toEqual(['牛乳']);
    expect(result.state.history.lines.map((l) => l.name)).toEqual(['ぎゅうにゅう']);
  });

  it('手で既存の品名を選べば、そのリストの品を買った扱いにする', () => {
    const state = withMilk('牛乳');
    const draft = buildReceiptDraft(parseReceipt('ｷﾞｭｳﾆｭｳ1L 198\n合計 198'), state, today);
    draft.storeId = 'aeon';
    draft.lines[0].name = '牛乳';
    const result = S.saveReceipt(state, draft, now);
    expect(result.state.items).toHaveLength(0);
    expect(result.state.bought.map((b) => b.name)).toEqual(['牛乳']);
    expect(result.state.history.lines[0].name).toBe('牛乳');
  });

  it('同じ日に丸で押した同じ品は、レシートの行だけ残す', () => {
    const added = S.addItem(S.initialState(), { name: '牛乳', storeId: 'aeon', price: 150 });
    const checked = S.checkItem(added.state, added.item.id, now);
    const kept = S.addItem(checked, { name: '卵', storeId: 'aeon', price: 200 });
    const also = S.checkItem(kept.state, kept.item.id, new Date(2026, 10, 10, 9, 0, 0));
    const draft = buildReceiptDraft(parseReceipt('牛乳 198\n合計 198'), also, today);
    draft.storeId = 'aeon';
    const result = S.saveReceipt(also, draft, now);
    const sources = result.state.history.lines.map((l) => [l.name, l.date, l.source]);
    expect(sources).toEqual([
      ['卵', '2026-11-10', 'check'],
      ['牛乳', today, 'receipt'],
    ]);
    expect(result.state.bought).toHaveLength(2);
    expect(result.state.bought.find((b) => b.name === '牛乳').price).toBe(198);
    expect(result.state.history.lines.filter((l) => l.name === '牛乳')).toHaveLength(1);
    expect(S.migratePurchases(result.state).history.lines.map((l) => [l.name, l.date, l.source])).toEqual(sources);
  });

  it('合計がずれていても保存できる。お店が無いときは保存しない', () => {
    const draft = buildReceiptDraft(parseReceipt('牛乳 200\n卵 300\n合計 460'), withMilk(), today);
    draft.storeId = 'aeon';
    expect(totalsLabel(draft).note).toBe('合計と40円ずれています');
    const result = S.saveReceipt(withMilk(), draft, now);
    expect(result.saved).toBe(true);
    expect(result.state.history.receipts[0].total).toBe(460);
    expect(result.state.history.lines).toHaveLength(2);
    expect(S.saveReceipt(withMilk(), { ...draft, storeId: 'unset' }, now).saved).toBe(false);
    expect(S.saveReceipt(withMilk(), { ...draft, storeId: '' }, now).saved).toBe(false);
    expect(S.saveReceipt(withMilk(), { ...draft, lines: [{ kind: 'unknown', raw: '◆' }] }, now).saved).toBe(false);
  });

  it('書き出し→取り込みでレシートも明細も消えない', () => {
    const result = saved();
    result.state.history.receipts[0].lane = 2;
    result.state.history.lines[0].qtyNote = 'keep';
    result.state.futureNote = 'keep-me';
    const back = S.importJSON(S.exportJSON(result.state));
    expect(back.ok).toBe(true);
    expect(back.state.futureNote).toBe('keep-me');
    expect(back.state.history.receipts).toHaveLength(1);
    expect(back.state.history.receipts[0].lane).toBe(2);
    expect(back.state.history.receipts[0].text).toContain('タマゴ 258');
    expect(back.state.history.receipts[0].text).not.toContain('1234-5678-9012');
    expect(back.state.history.lines.map((l) => l.name)).toEqual(['牛乳', '卵']);
    expect(back.state.history.lines[0].qtyNote).toBe('keep');
    expect(back.state.history.lines[0].quantity).toBe(1);
    expect(back.state.history.lines[0].amount).toBe(198);
    const again = S.importJSON(S.exportJSON(back.state));
    expect(again.state.history.receipts).toEqual(back.state.history.receipts);
    expect(again.state.history.lines).toEqual(back.state.history.lines);
  });

  it('別々に残ったレシートは id で合流する', () => {
    const a = { version: 1, lines: [], receipts: [{ id: 'r1', storeId: 'aeon', date: today, text: '牛乳', source: 'receipt', total: 100 }] };
    const b = { version: 1, lines: [{ id: 'p1', name: '卵', storeId: 'aeon', date: today, price: 50, source: 'receipt' }], receipts: [{ id: 'r2', storeId: 'matsukiyo', date: today, text: '卵', source: 'receipt' }] };
    const merged = unionHistory(a, b);
    expect(merged.receipts.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(merged.lines.map((l) => l.name)).toEqual(['卵']);
  });
});

describe('書き出しの促し', () => {
  function receipts(n, date, savedAt) {
    return Array.from({ length: n }, (_, i) => ({
      id: `r${i}`, storeId: 'aeon', date, savedAt, source: 'receipt', text: 'x', total: 1, tax: '不明', time: null,
    }));
  }

  it('30日と8枚の両方がたまったときだけ1文書く。片方だけでは出さない', () => {
    const old = '2026-10-12';
    const recent = '2026-11-10';
    expect(exportNudge({ history: { receipts: receipts(EXPORT_NUDGE_COUNT, old, `${old}T00:00:00.000Z`) } }, now).message)
      .toBe('最初のレシートから30日、レシート8枚ぶんたまっています');
    expect(exportNudge({ history: { receipts: receipts(7, old, `${old}T00:00:00.000Z`) } }, now)).toBeNull();
    expect(exportNudge({ history: { receipts: receipts(8, recent, `${recent}T00:00:00.000Z`) } }, now)).toBeNull();

    const base = {
      settings: { lastExportAt: '2026-10-12T00:00:00.000Z', lastExportDate: old },
      history: { receipts: receipts(8, today, '2026-10-13T00:00:00.000Z') },
    };
    expect(exportNudge(base, now).message).toBe('前回の書き出しから30日、レシート8枚ぶんたまっています');
    expect(exportNudge({ ...base, history: { receipts: receipts(7, today, '2026-10-13T00:00:00.000Z') } }, now)).toBeNull();
    expect(exportNudge({
      ...base,
      settings: { lastExportAt: '2026-11-01T00:00:00.000Z', lastExportDate: '2026-11-01' },
    }, now)).toBeNull();
    const marked = S.markExported(S.initialState(), now);
    expect(exportNudge({ ...marked, history: { receipts: receipts(8, today, '2026-11-11T10:00:00.000Z') } }, now)).toBeNull();
  });
});

describe('キーボードで隠れる高さ', () => {
  it('画面が縮んでいないときだけ、下から持ち上げる', () => {
    expect(keyboardInset(844, 520, 0)).toBe(324);
    expect(keyboardInset(844, 500, 20)).toBe(324);
    expect(keyboardInset(520, 520, 0)).toBe(0);
    expect(keyboardInset(400, 520, 0)).toBe(0);
  });
});
