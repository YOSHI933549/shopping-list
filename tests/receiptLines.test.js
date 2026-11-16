import { describe, expect, it } from 'vitest';
import {
  amountFromToken, joinCjkSpaces, priceLineCount, repairOcrLine, repairOcrText, splitPriceTail,
} from '../src/lib/receiptLines.js';

describe('値段の塊', () => {
  it('整数・千の区切り（, と .）・0 と O・1 と l の取り違えを読む', () => {
    expect(amountFromToken('198')).toBe(198);
    expect(amountFromToken('1,280')).toBe(1280);
    expect(amountFromToken('1.078')).toBe(1078);
    expect(amountFromToken('12,345,678')).toBe(12345678);
    expect(amountFromToken('O98')).toBe(98);
    expect(amountFromToken('l28')).toBe(128);
  });

  it('小数や桁の合わない区切りは値段にしない', () => {
    expect(amountFromToken('12.5')).toBeNull();
    expect(amountFromToken('1,23')).toBeNull();
    expect(amountFromToken('')).toBeNull();
    expect(amountFromToken('abc')).toBeNull();
  });
});

describe('右端の値段', () => {
  it.each([
    ['牛乳 198', '牛乳', 198],
    ['牛乳 ¥198', '牛乳', 198],
    ['牛乳 ￥198', '牛乳', 198],
    ['牛乳 １９８円', '牛乳', 198],
    ['牛乳 198円', '牛乳', 198],
    ['キャベツ ¥1,280', 'キャベツ', 1280],
    ['キャベツ ¥１，２８０', 'キャベツ', 1280],
    ['キャベツ \\1.280', 'キャベツ', 1280],
    ['牛乳 Y198', '牛乳', 198],
    ['牛乳 V258', '牛乳', 258],
    ['牛乳 Y\\Y198', '牛乳', 198],
    ['牛乳  WV1.078', '牛乳', 1078],
    ['牛乳 羊198', '牛乳', 198],
    ['牛乳 ¥O98', '牛乳', 98],
  ])('%s', (line, head, amount) => {
    expect(splitPriceTail(line)).toMatchObject({ head, amount });
  });

  it('末尾の税率記号（※ * 軽 軽減 (軽) 8%）は値段の一部にしない', () => {
    for (const line of ['豆腐 98※', '豆腐 98*', '豆腐 98 ＊', '豆腐 98軽', '豆腐 98 軽減', '豆腐 98(軽)', '豆腐 ¥98 8%', '豆腐 ¥98 ※', '豆腐 ¥98 内']) {
      expect(splitPriceTail(line), line).toMatchObject({ head: '豆腐', amount: 98 });
    }
  });

  it('マイナス（- − ▲ △）は、記号の前でも後ろでも値引きの値段にする', () => {
    expect(splitPriceTail('クーポン値引 -¥50')).toMatchObject({ head: 'クーポン値引', amount: -50 });
    expect(splitPriceTail('値引 ¥-50')).toMatchObject({ amount: -50 });
    expect(splitPriceTail('値引 ▲50')).toMatchObject({ amount: -50 });
    expect(splitPriceTail('値引 △50')).toMatchObject({ amount: -50 });
    expect(splitPriceTail('値引 -\\50')).toMatchObject({ amount: -50 });
  });

  it('値段だけの行は品名が空', () => {
    expect(splitPriceTail('¥198')).toEqual({ head: '', amount: 198, marked: true });
    expect(splitPriceTail('   ￥１２８  ')).toMatchObject({ head: '', amount: 128 });
  });

  it('日付・時刻・電話・コードのような数字は値段にしない', () => {
    for (const line of ['2026年11月14日(土) 10:32', 'TEL 03-1234-5678', '2026/11/14', '10:32', '牛乳198', 'キャベツ 12.5', 'ABC123']) {
      expect(splitPriceTail(line), line).toBeNull();
    }
  });

  it('値段が無い行や空の行は null', () => {
    expect(splitPriceTail('')).toBeNull();
    expect(splitPriceTail('ありがとうございました')).toBeNull();
    expect(splitPriceTail(null)).toBeNull();
  });
});

describe('1行を直す', () => {
  it('品名と値段を「品名 数字」にそろえる', () => {
    expect(repairOcrLine('牛乳 1L          ¥198')).toBe('牛乳 1L 198');
    expect(repairOcrLine('※ 牛乳  ¥198※')).toBe('牛乳 198');
    expect(repairOcrLine('@98 ×2   ¥196')).toBe('@98 ×2 196');
    expect(repairOcrLine('クーポン値引  -\\50')).toBe('クーポン値引 -50');
    expect(repairOcrLine('¥198')).toBe('198');
    expect(repairOcrLine('-¥50')).toBe('-50');
  });

  it('日本語の字のあいだの空白を詰める。英数字との境は残す', () => {
    expect(joinCjkSpaces('ポイ ント 付与')).toBe('ポイント付与');
    expect(joinCjkSpaces('牛乳 1L')).toBe('牛乳 1L');
    expect(repairOcrLine('た ま ご 10個 入  ¥258')).toBe('たまご 10個入 258');
  });

  it('頭に付いた1字の読み違い（e s = など）と、個入の「個人」を直す', () => {
    expect(repairOcrLine('s たまご 10個人  V258')).toBe('たまご 10個入 258');
    expect(repairOcrLine('e 牛乳 198')).toBe('牛乳 198');
  });

  it('「@単価 ・数量」の「×」が点に読まれたものを戻す', () => {
    expect(repairOcrLine('@98 ・2  Y196')).toBe('@98 ×2 196');
  });

  it('合計・小計・お釣り・お預り・消費税の読み違いを直す', () => {
    expect(repairOcrLine('台計  \\1.078')).toBe('合計 1078');
    expect(repairOcrLine('公 計 ¥1,078')).toBe('合計 1078');
    expect(repairOcrLine('お約けり  \\922')).toBe('お釣り 922');
    expect(repairOcrLine('お克り  V2.000')).toBe('お預り 2000');
    expect(repairOcrLine('消費科等(8%)  Y80')).toBe('消費税等(8%) 80');
    expect(repairOcrLine('合き  1.078')).toBe('合計 1078');
    expect(repairOcrLine('お預け  2.000')).toBe('お預り 2000');
    expect(repairOcrLine('お釣りで 922')).toBe('お釣り 922');
  });

  it('値段が無い行は、空白と頭の印だけ直して中身は変えない', () => {
    expect(repairOcrLine('スー パー まるや')).toBe('スーパーまるや');
    expect(repairOcrLine('TEL 03-1234-5678')).toBe('TEL 03-1234-5678');
    expect(repairOcrLine('')).toBe('');
  });

  it('複数行は行の数と順番を変えない', () => {
    expect(repairOcrText('牛乳 ¥198\n\n合計 ¥198\r\n')).toBe('牛乳 198\n\n合計 198\n');
  });
});

describe('品名と値段が読めた行の数', () => {
  it('品名つきで値段が取れた行だけを数える', () => {
    expect(priceLineCount('スーパー\n牛乳 ¥198\n卵  Y258\n¥300\n合計 456')).toBe(3);
    expect(priceLineCount('')).toBe(0);
    expect(priceLineCount(null)).toBe(0);
  });
});
