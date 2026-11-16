import { describe, expect, it } from 'vitest';
import {
  isNoiseWord, layoutRows, linesFromWords, priceColumnEdge, priceSpan, replaceSpan, rowText, textFromWords, wordsFromBlocks,
} from '../src/lib/receiptRows.js';

const w = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });

describe('単語の位置から行を作る', () => {
  it('値段が別のかたまりでも、同じ高さなら品名と同じ行に戻る', () => {
    const words = [
      w('牛乳', 20, 100, 80, 130),
      w('¥198', 700, 104, 780, 134),
      w('卵', 20, 150, 50, 180),
      w('¥258', 700, 153, 780, 183),
      w('合計', 20, 200, 80, 230),
      w('¥456', 700, 202, 780, 232),
    ];
    expect(linesFromWords(words)).toEqual(['牛乳  ¥198', '卵  ¥258', '合計  ¥456']);
  });

  it('入力の順番に関係なく、上から下、左から右に並べる', () => {
    const words = [w('¥258', 700, 153, 780, 183), w('卵', 20, 150, 50, 180), w('牛乳', 20, 100, 80, 130), w('¥198', 700, 100, 780, 130)];
    expect(textFromWords(words)).toBe('牛乳  ¥198\n卵  ¥258');
  });

  it('ゆるやかな傾きで少しずつずれても、半行以内なら同じ行。次の行とは混ざらない', () => {
    const words = [
      w('牛乳', 20, 100, 80, 130),
      w('¥198', 700, 112, 780, 142),
      w('卵', 20, 150, 50, 180),
      w('¥258', 700, 162, 780, 192),
    ];
    expect(linesFromWords(words)).toEqual(['牛乳  ¥198', '卵  ¥258']);
  });

  it('隙間が小さければ詰め、中くらいなら空白1つ、広ければ空白2つ', () => {
    const words = [w('10', 20, 0, 40, 30), w('個入', 42, 0, 100, 30), w('2点', 120, 0, 170, 30), w('¥258', 600, 0, 680, 30)];
    expect(linesFromWords(words)).toEqual(['10個入 2点  ¥258']);
  });

  it('日本語の字のあいだの空白は詰める', () => {
    const words = [w('イオ', 20, 0, 70, 30), w('ン', 90, 0, 120, 30)];
    expect(textFromWords(words)).toBe('イオン');
  });

  it('空の単語・位置のない単語・線だけの単語（紙のふちのごみ）は捨てる', () => {
    const words = [w(' ', 0, 0, 10, 10), { text: 'x' }, w('ーーー', 0, 0, 100, 30), w('_', 0, 0, 30, 30), w('牛乳', 20, 100, 80, 130)];
    expect(linesFromWords(words)).toEqual(['牛乳']);
    expect(linesFromWords(null)).toEqual([]);
    expect(textFromWords([])).toBe('');
  });

  it('マイナスだけの単語は残す（値引きの印）', () => {
    expect(isNoiseWord('-')).toBe(false);
    expect(isNoiseWord('ー')).toBe(true);
    expect(isNoiseWord('値引')).toBe(false);
    expect(linesFromWords([w('値引', 20, 0, 80, 30), w('-', 600, 0, 620, 30), w('50', 625, 0, 660, 30)])).toEqual(['値引  -50']);
  });

  it('tesseract の blocks から単語を平らに集める', () => {
    const blocks = [
      { paragraphs: [{ lines: [{ words: [w('牛乳', 0, 0, 10, 10), w('198', 20, 0, 40, 10)] }] }, { lines: [{ words: [w('卵', 0, 20, 10, 30)] }] }] },
      { paragraphs: [{ lines: [{ words: [w('合計', 0, 40, 10, 50)] }] }] },
    ];
    expect(wordsFromBlocks(blocks).map((x) => x.text)).toEqual(['牛乳', '198', '卵', '合計']);
    expect(wordsFromBlocks(null)).toEqual([]);
    expect(wordsFromBlocks([{}])).toEqual([]);
  });
});

describe('値段の読み直しの範囲', () => {
  const word = (text, x0, x1) => ({ text, x0, x1, y0: 0, y1: 30 });
  const rows = [
    { words: [word('牛乳', 0, 60), word('\\198', 700, 780)] },
    { words: [word('卵', 0, 30), word('\\', 690, 700), word('2', 702, 720), word('っ', 722, 740), word('8', 742, 760)] },
    { words: [word('洗剤', 0, 60), word('\\う329', 700, 790)] },
    { words: [word('小計', 0, 60)] },
    { words: [word('合計', 0, 60), word('\\1.078', 700, 790)] },
  ];

  it('値段の列の右端は、値段らしい右端の単語の中央値', () => {
    expect(priceColumnEdge(rows)).toBe(780);
    expect(priceColumnEdge([rows[0]])).toBeNull();
    expect(priceColumnEdge(null)).toBeNull();
  });

  it('右端の単語が値段らしければその範囲。割れて読まれた値段は、詰まった短い断片をまとめる', () => {
    const edge = priceColumnEdge(rows);
    expect(priceSpan(rows[0], edge, 30)).toEqual({ start: 1, end: 1 });
    expect(priceSpan(rows[1], edge, 30)).toEqual({ start: 1, end: 4 });
    expect(priceSpan(rows[2], edge, 30)).toEqual({ start: 1, end: 1 });
    expect(priceSpan(rows[3], edge, 30)).toBeNull();
    expect(priceSpan({ words: [] }, edge, 30)).toBeNull();
  });

  it('値段の列から外れた、数字を含まない右端の単語は値段にしない', () => {
    const row = { words: [word('スーパー', 0, 100), word('まるや', 140, 200)] };
    expect(priceSpan(row, 780, 30)).toBeNull();
    const dateRow = { words: [word('2026年11月14日', 0, 300), word('10:32', 340, 420)] };
    expect(priceSpan(dateRow, 780, 30)).toBeNull();
  });

  it('範囲を読み直した1語に置き換えると、行の文字が変わる', () => {
    const row = { cy: 15, words: [word('卵', 0, 30), word('\\', 690, 700), word('2', 702, 720), word('っ', 722, 740), word('8', 742, 760)] };
    replaceSpan(row, { start: 1, end: 4 }, '258');
    expect(row.words.map((w) => w.text)).toEqual(['卵', '258']);
    expect(row.words[1]).toMatchObject({ x0: 690, x1: 760 });
    expect(rowText(row, 30)).toBe('卵  258');
  });

  it('行の並べ直しは、行の文字と単語の高さの中央値を返す', () => {
    const w = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });
    const layout = layoutRows([w('牛乳', 20, 100, 80, 130), w('198', 700, 100, 760, 130)]);
    expect(layout.lineH).toBe(30);
    expect(layout.rows).toHaveLength(1);
    expect(rowText(layout.rows[0], layout.lineH)).toBe('牛乳  198');
    expect(layoutRows([])).toEqual({ rows: [], lineH: 0 });
  });
});
