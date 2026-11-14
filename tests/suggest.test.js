import { describe, expect, it } from 'vitest';
import { SUGGESTION_LIMIT, itemSuggestions } from '../src/lib/suggest.js';

function line(id, name, date, extra = {}) {
  return { id, name, storeId: 'aeon', date, price: 100, source: 'check', memo: '', ...extra };
}

describe('入力候補', () => {
  it('履歴が0件、またはまだ打っていないときは出さない', () => {
    const history = { version: 2, lines: [line('a', '牛乳', '2026-11-01')], receipts: [], goods: [] };
    expect(itemSuggestions({ lines: [] }, '牛')).toEqual([]);
    expect(itemSuggestions(history, '')).toEqual([]);
    expect(itemSuggestions(history, '   ')).toEqual([]);
    expect(itemSuggestions(history, 'パン')).toEqual([]);
  });

  it('よく買う品を上に、同じ回数なら最近買った品を上にする', () => {
    const history = {
      version: 2,
      lines: [
        line('1', 'うどん', '2026-11-01'),
        line('2', 'ぎゅうにゅう', '2026-10-01'),
        line('3', 'ぎゅうにゅう', '2026-11-02'),
        line('4', 'ぎゅうにゅう', '2026-09-01'),
        line('6', 'うどん', '2026-11-10'),
        line('7', 'とうふ', null),
        line('8', 'とうふ', null),
      ],
      receipts: [],
      goods: [],
    };
    const all = itemSuggestions(history, 'う');
    expect(all.map((item) => item.name)).toEqual(['ぎゅうにゅう', 'うどん', 'とうふ']);
    expect(all.map((item) => item.count)).toEqual([3, 2, 2]);
    expect(all[1].lastDate).toBe('2026-11-10');
    expect(all[2].lastDate).toBe('');
  });

  it('ひらがな・カタカナ・半角と全角の違いでも当たる', () => {
    const history = {
      version: 2,
      lines: [line('a', 'ぎゅうにゅう', '2026-11-01'), line('b', 'ヨーグルト', '2026-11-02')],
      receipts: [],
      goods: [],
    };
    expect(itemSuggestions(history, 'ぎゅうにゅう').map((item) => item.name)).toEqual(['ぎゅうにゅう']);
    expect(itemSuggestions(history, 'ギュウニュウ').map((item) => item.name)).toEqual(['ぎゅうにゅう']);
    expect(itemSuggestions(history, 'ｷﾞｭｳﾆｭｳ').map((item) => item.name)).toEqual(['ぎゅうにゅう']);
    expect(itemSuggestions(history, 'ｷﾞｭｳ').map((item) => item.name)).toEqual(['ぎゅうにゅう']);
    expect(itemSuggestions(history, 'ﾖｰｸﾞﾙﾄ').map((item) => item.name)).toEqual(['ヨーグルト']);
    expect(itemSuggestions(history, 'よーぐると').map((item) => item.name)).toEqual(['ヨーグルト']);
    expect(itemSuggestions(history, '牛乳')).toEqual([]);
  });

  it('まとめ後の名前を出し、別名や元の表記でもその名前に当たる', () => {
    const history = {
      version: 2,
      lines: [
        line('a', 'ぎゅうにゅう', '2026-10-01', { goodsId: 'g1', notation: 'ぎゅうにゅう1l' }),
        line('b', 'ぎゅうにゅう', '2026-11-01', { goodsId: 'g1' }),
        line('c', '牛乳', '2026-11-11', { goodsId: 'g2' }),
      ],
      receipts: [],
      goods: [
        { id: 'g1', name: 'ぎゅうにゅう', aliases: [{ storeId: 'aeon', notation: 'ぎゅうにゅう1l' }], mergedInto: 'g2' },
        { id: 'g2', name: '牛乳', aliases: [{ storeId: 'matsukiyo', notation: 'ミルク' }], mergedInto: null },
      ],
    };
    const hit = itemSuggestions(history, 'ぎゅう');
    expect(hit).toHaveLength(1);
    expect(hit[0].name).toBe('牛乳');
    expect(hit[0].count).toBe(3);
    expect(itemSuggestions(history, 'ｷﾞｭｳﾆｭｳ1L')[0].name).toBe('牛乳');
    expect(itemSuggestions(history, 'ミルク')[0].name).toBe('牛乳');
    expect(itemSuggestions(history, '牛')[0].name).toBe('牛乳');
  });

  it('最大件数で切り、よく買う順の先頭だけを残す', () => {
    const names = ['牛乳', '牛肉', '牛すじ', '牛タン', '牛丼', '牛もつ', '牛脂'];
    const lines = [];
    names.forEach((name, index) => {
      const times = names.length - index;
      for (let n = 0; n < times; n += 1) {
        lines.push(line(`${index}-${n}`, name, `2026-11-${String(10 - n).padStart(2, '0')}`));
      }
    });
    const hit = itemSuggestions({ version: 2, lines, receipts: [], goods: [] }, '牛');
    expect(SUGGESTION_LIMIT).toBe(6);
    expect(hit).toHaveLength(SUGGESTION_LIMIT);
    expect(hit.map((item) => item.name)).toEqual(names.slice(0, SUGGESTION_LIMIT));
    expect(hit.map((item) => item.count)).toEqual([7, 6, 5, 4, 3, 2]);
    expect(hit.some((item) => item.name === '牛脂')).toBe(false);
  });
});