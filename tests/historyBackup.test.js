import { describe, expect, it } from 'vitest';
import { emptyHistory } from '../src/lib/history.js';
import {
  BACKUP_KIND, BACKUP_NUDGE_DAYS, BACKUP_NUDGE_MIN_RECORDS, BACKUP_VERSION,
  backupFilename, canShareBackupFile, describeHistoryMerge, historyBackupJSON,
  historyBackupNudge, historyImportSummary, parseHistoryBackup, stateWithHistory,
} from '../src/lib/historyBackup.js';
import { initialState } from '../src/state/store.js';

const now = new Date('2026-11-12T12:00:00');
const old = '2026-10-13';
const newer = '2026-10-14';

function line(id, extra = {}) {
  return {
    id, name: '牛乳', storeId: 'aeon', date: '2026-11-01', price: 198, source: 'check', memo: '', ...extra,
  };
}

function lines(n, date) {
  return Array.from({ length: n }, (_, i) => line(`l${i}`, { name: `品${i}`, date }));
}

const sample = {
  version: 1,
  lines: [line('p1', { goodsId: 'g2', notation: 'ぎゅうにゅう1l', raw: 'ｷﾞｭｳﾆｭｳ1L 198', hue: 3 })],
  receipts: [{ id: 'r1', storeId: 'aeon', date: '2026-11-01', total: 198, tax: '税込', source: 'receipt', text: '牛乳', savedAt: '2026-11-01T00:00:00.000Z', lane: 2 }],
  goods: [
    { id: 'g1', name: 'ぎゅうにゅう', aliases: [{ storeId: 'aeon', notation: 'ぎゅうにゅう1l' }], mergedInto: 'g2', note: 'keep' },
    { id: 'g2', name: '牛乳', aliases: [{ storeId: 'matsukiyo', notation: 'ぎゅうにゅう' }], mergedInto: null },
  ],
};

describe('履歴の書き出しと読み込み', () => {
  it('ファイル名に日付を入れる', () => {
    expect(backupFilename('2026-11-12')).toBe('kaimono-history-2026-11-12.json');
  });

  it('書き出して読み込むと、明細・レシート・別名・まとめが変わらない', () => {
    const text = historyBackupJSON(sample, '2026-11-12T01:02:03.000Z');
    const file = JSON.parse(text);
    expect(file.kind).toBe(BACKUP_KIND);
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.exportedAt).toBe('2026-11-12T01:02:03.000Z');
    const parsed = parseHistoryBackup(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.history.lines).toEqual(file.lines);
    expect(parsed.history.receipts).toEqual(file.receipts);
    expect(parsed.history.goods).toEqual(file.goods);
    expect(parsed.history.lines[0].hue).toBe(3);
    expect(parsed.history.lines[0].notation).toBe('ぎゅうにゅう1l');
    expect(parsed.history.goods[0].mergedInto).toBe('g2');
    expect(parsed.history.goods[0].aliases).toEqual([{ storeId: 'aeon', notation: 'ぎゅうにゅう1l' }]);
    expect(parsed.history.goods[0].note).toBe('keep');
    expect(parsed.history.receipts[0].lane).toBe(2);

    const again = parseHistoryBackup(historyBackupJSON(parsed.history, '2026-11-12T01:02:03.000Z'));
    expect(again.history.lines).toEqual(parsed.history.lines);
    expect(again.history.receipts).toEqual(parsed.history.receipts);
    expect(again.history.goods).toEqual(parsed.history.goods);

    const restored = stateWithHistory({ ...initialState(), history: emptyHistory() }, parsed.history);
    expect(restored.history.lines).toEqual(parsed.history.lines);
    expect(restored.history.goods).toEqual(parsed.history.goods);
    expect(restored.items).toEqual([]);
  });

  it('同じ id は二重に入らず、ファイルに無い記録は残る', () => {
    const text = historyBackupJSON({
      lines: [line('p1', { name: '牛乳' }), line('p1', { name: '卵' }), line('p2', { name: '卵' })],
      receipts: [{ id: 'r1', storeId: 'aeon', date: '2026-11-01', total: 100 }, { id: 'r1', storeId: 'aeon', date: '2026-11-02', total: 200 }],
      goods: [],
    });
    const parsed = parseHistoryBackup(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.history.lines.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(parsed.history.lines[0].name).toBe('牛乳');
    expect(parsed.history.receipts).toHaveLength(1);
    expect(parsed.history.receipts[0].total).toBe(100);

    const current = {
      ...initialState(),
      items: [{ id: 'i1', name: '食パン', storeId: 'aeon', memo: '' }],
      history: {
        version: 2,
        lines: [line('p1'), line('p3', { name: '豆腐' })],
        receipts: [],
        goods: [{ id: 'g2', name: '牛乳', aliases: [{ storeId: 'aeon', notation: 'ぎゅうにゅう' }], mergedInto: null }],
      },
    };
    const next = stateWithHistory(current, parsed.history);
    expect(next.items).toEqual(current.items);
    expect(next.history.lines.map((item) => item.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(next.history.lines.filter((item) => item.id === 'p1')).toHaveLength(1);
    expect(next.history.goods.map((item) => item.id)).toEqual(['g2']);

    const twice = stateWithHistory(next, parsed.history);
    expect(twice.history.lines).toHaveLength(next.history.lines.length);
    expect(twice.history.receipts).toHaveLength(next.history.receipts.length);
  });

  it('読み込む前の件数に、新しい記録と同じ記録を分ける', () => {
    const stats = describeHistoryMerge(
      { lines: [line('p1')], receipts: [], goods: [{ id: 'g2', name: '牛乳', aliases: [], mergedInto: null }] },
      { lines: [line('p1'), line('p2', { name: '卵' })], receipts: [{ id: 'r1', storeId: 'aeon', date: '2026-11-01', total: 100 }], goods: [{ id: 'g2', name: '牛乳', aliases: [], mergedInto: null }] },
    );
    expect(stats.lines).toEqual({ file: 2, added: 1, same: 1, current: 1 });
    expect(stats.receipts).toEqual({ file: 1, added: 1, same: 0, current: 0 });
    expect(stats.goods.same).toBe(1);
    expect(historyImportSummary(stats)).toBe([
      '購入の記録 2件（新しく足す 1件、同じ記録 1件）',
      'レシート 1件（新しく足す 1件、同じ記録 0件）',
      '品物のまとめ 1件（新しく足す 0件、同じ記録 1件）',
    ].join('\n'));
  });

  it('版1の履歴は台帳を空で足して版2にする', () => {
    const text = JSON.stringify({
      kind: BACKUP_KIND,
      version: 1,
      lines: [line('a', { date: '2026-10-01', price: 180 })],
      receipts: [{ id: 'r', storeId: 'aeon', date: '2026-10-01', total: 180 }],
    });
    const parsed = parseHistoryBackup(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.history.version).toBe(2);
    expect(parsed.history.goods).toEqual([]);
    expect(parsed.history.lines[0].name).toBe('牛乳');
    expect(parsed.history.receipts[0].id).toBe('r');
  });

  it.each([
    ['壊れた JSON', '{', /JSON として読めませんでした/],
    ['配列', '[]', /形式が正しくありません/],
    ['null', 'null', /形式が正しくありません/],
    ['種類が違う', JSON.stringify({ kind: 'other', version: 2, lines: [] }), /履歴ファイルではありません/],
    ['未来の版', JSON.stringify({ kind: BACKUP_KIND, version: 3, lines: [] }), /対応していないバージョンです \(3\)/],
    ['版が無い', JSON.stringify({ kind: BACKUP_KIND, lines: [] }), /対応していないバージョンです \(なし\)/],
    ['lines が文字列', JSON.stringify({ kind: BACKUP_KIND, version: 2, lines: 'x' }), /lines/],
    ['まとめがオブジェクト', JSON.stringify({ kind: BACKUP_KIND, version: 2, lines: [], goods: {} }), /品物のまとめ/],
    ['リスト全体', JSON.stringify({ version: 1, items: [], stores: [] }), /リスト全体のファイルです/],
  ])('壊れたファイルを断る: %s', (_, text, pattern) => {
    const parsed = parseHistoryBackup(text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(pattern);
    expect(parsed.history).toBeUndefined();
  });
});

describe('30日の知らせ', () => {
  it('前回の書き出しから30日、記録がちょうど一定数なら知らせる', () => {
    const nudge = historyBackupNudge({
      history: { lines: lines(BACKUP_NUDGE_MIN_RECORDS, '2026-11-12') },
      settings: { lastExportDate: old },
    }, now);
    expect(nudge.days).toBe(BACKUP_NUDGE_DAYS);
    expect(nudge.count).toBe(BACKUP_NUDGE_MIN_RECORDS);
    expect(nudge.message).toBe(`前回の書き出しから${BACKUP_NUDGE_DAYS}\u2060日たっています。購入の記録が${BACKUP_NUDGE_MIN_RECORDS}\u2060件あります`);
  });

  it('29日、または記録が1件足りないときは出さない', () => {
    expect(historyBackupNudge({
      history: { lines: lines(BACKUP_NUDGE_MIN_RECORDS, old) },
      settings: { lastExportDate: newer },
    }, now)).toBeNull();
    expect(historyBackupNudge({
      history: { lines: lines(BACKUP_NUDGE_MIN_RECORDS - 1, old) },
      settings: { lastExportDate: old },
    }, now)).toBeNull();
  });

  it('まだ書き出したことがなく、一番古い記録から30日たっているときだけ知らせる', () => {
    const nudge = historyBackupNudge({ history: { lines: lines(BACKUP_NUDGE_MIN_RECORDS, old) } }, now);
    expect(nudge.message).toBe(`最初の記録から${BACKUP_NUDGE_DAYS}\u2060日たっています。購入の記録が${BACKUP_NUDGE_MIN_RECORDS}\u2060件あります`);
    expect(historyBackupNudge({ history: { lines: lines(BACKUP_NUDGE_MIN_RECORDS, newer) } }, now)).toBeNull();
    expect(historyBackupNudge({
      history: { lines: lines(BACKUP_NUDGE_MIN_RECORDS, null).map((item) => ({ ...item, date: null })) },
    }, now)).toBeNull();
  });
});

describe('共有シート', () => {
  const file = { name: 'kaimono-history-2026-11-12.json' };

  it('files を渡せるときだけ共有を使う', () => {
    expect(canShareBackupFile(undefined, file)).toBe(false);
    expect(canShareBackupFile({}, file)).toBe(false);
    expect(canShareBackupFile({ canShare: () => true }, file)).toBe(true);
    expect(canShareBackupFile({ canShare: () => false }, file)).toBe(false);
    expect(canShareBackupFile({ canShare: () => { throw new Error('未対応'); } }, file)).toBe(false);
  });
});
