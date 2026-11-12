import { describe, expect, it } from 'vitest';
import { cleanProductLabel, parseReceipt, stripSensitiveLines } from '../src/lib/receipt.js';

function yen(item) {
  return {
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.amount,
    discount: item.discount,
    volumeMl: item.volumeMl,
    packCount: item.packCount,
    packUnit: item.packUnit,
  };
}

describe('半角カナのレシート', () => {
  const text = [
    'スーパーえほん',
    '2026年11月11日(火) 18:42',
    'レジ0003',
    'ｷﾞｭｳﾆｭｳ1L                 198',
    'ﾀﾏｺﾞ10ｺ                   258',
    '*ﾊﾟﾝ                       158',
    '--------------------------------',
    '小計                       614',
    '(内消費税等                 56)',
    '合計                       614',
    'お預り                    1000',
    'お釣り                     386',
    'ありがとうございました',
  ].join('\n');

  it('品名・容量・税込・日付時刻を取り、印字の合計と一致する', () => {
    const got = parseReceipt(text);
    expect(got.date).toBe('2026-11-11');
    expect(got.time).toBe('18:42');
    expect(got.tax).toBe('税込');
    expect(got.taxAmount).toBe(56);
    expect(got.subtotal).toBe(614);
    expect(got.total).toBe(614);
    expect(got.sum).toBe(614);
    expect(got.difference).toBe(0);
    expect(got.matches).toBe(true);
    expect(got.unknown.map((u) => u.raw)).toEqual(['スーパーえほん']);
    expect(got.items.map(yen)).toEqual([
      { name: 'ぎゅうにゅう', quantity: 1, unitPrice: 198, amount: 198, discount: 0, volumeMl: 1000, packCount: null, packUnit: null },
      { name: 'たまご', quantity: 1, unitPrice: 258, amount: 258, discount: 0, volumeMl: null, packCount: 10, packUnit: 'コ' },
      { name: 'ぱん', quantity: 1, unitPrice: 158, amount: 158, discount: 0, volumeMl: null, packCount: null, packUnit: null },
    ]);
    expect(got.items[0].raw).toBe('ｷﾞｭｳﾆｭｳ1L                 198');
    expect(got.items[2].raw.startsWith('*ﾊﾟﾝ')).toBe(true);
  });

  it('カタカナ・ひらがな・空白は normalize で同じ品名になる', () => {
    const got = parseReceipt('ギュウニュウ 1L 198\nぎゅう にゅう 210\nｷﾞｭｳﾆｭｳ 220\n合計 628');
    expect(got.items.map((it) => it.name)).toEqual(['ぎゅうにゅう', 'ぎゅうにゅう', 'ぎゅうにゅう']);
    expect(got.matches).toBe(true);
  });
});

describe('2コ × 98', () => {
  const text = [
    'りんご',
    '2コ × 98',
    'バナナ 3 × 50 150',
    'ぶどう @120 × 2',
    'いちご 98円 × 2',
    '合計 782',
  ].join('\n');

  it('数量と単価を分け、金額は単価×数量', () => {
    const got = parseReceipt(text);
    expect(got.items.map(yen)).toEqual([
      { name: 'りんご', quantity: 2, unitPrice: 98, amount: 196, discount: 0, volumeMl: null, packCount: null, packUnit: null },
      { name: 'ばなな', quantity: 3, unitPrice: 50, amount: 150, discount: 0, volumeMl: null, packCount: null, packUnit: null },
      { name: 'ぶどう', quantity: 2, unitPrice: 120, amount: 240, discount: 0, volumeMl: null, packCount: null, packUnit: null },
      { name: 'いちご', quantity: 2, unitPrice: 98, amount: 196, discount: 0, volumeMl: null, packCount: null, packUnit: null },
    ]);
    expect(got.items[0].raw).toBe('りんご\n2コ × 98');
    for (const item of got.items) {
      expect(item.unitPrice * item.quantity - item.discount).toBe(item.amount);
    }
    expect(got.sum).toBe(782);
    expect(got.matches).toBe(true);
    expect(got.unknown).toEqual([]);
  });

  it('半角の x と全角数字も同じ', () => {
    const got = parseReceipt('みかん\n２ｺ x ９８\n合計 196');
    expect(yen(got.items[0])).toMatchObject({ name: 'みかん', quantity: 2, unitPrice: 98, amount: 196 });
    expect(got.matches).toBe(true);
  });
});

describe('割引・値引', () => {
  const text = [
    '牛乳 198',
    '値引 -20',
    'ﾊﾟﾝ 200',
    '割引 30',
    '卵10ｺ入 300',
    'ﾈﾋﾞｷ ▲15',
    '合計 633',
  ].join('\n');

  it('直前の品に付け、明細の合計から引く', () => {
    const got = parseReceipt(text);
    expect(got.items.map(yen)).toEqual([
      { name: '牛乳', quantity: 1, unitPrice: 198, amount: 178, discount: 20, volumeMl: null, packCount: null, packUnit: null },
      { name: 'ぱん', quantity: 1, unitPrice: 200, amount: 170, discount: 30, volumeMl: null, packCount: null, packUnit: null },
      { name: '卵', quantity: 1, unitPrice: 300, amount: 285, discount: 15, volumeMl: null, packCount: 10, packUnit: 'コ' },
    ]);
    expect(got.items[0].raw).toBe('牛乳 198');
    expect(got.sum).toBe(633);
    expect(got.matches).toBe(true);
    expect(got.unknown).toEqual([]);
    expect(got.items.every((it) => it.unitPrice * it.quantity - it.discount === it.amount)).toBe(true);
  });

  it('値引の行と金額の行が分かれていても直前の品に付ける', () => {
    const got = parseReceipt('牛乳 198\n値引\n-20\n合計 178');
    expect(yen(got.items[0])).toMatchObject({ name: '牛乳', unitPrice: 198, amount: 178, discount: 20 });
    expect(got.unknown).toEqual([]);
    expect(got.matches).toBe(true);
  });
});

describe('税抜の店', () => {
  const text = [
    '令和8年11月11日 10:15',
    'ノート 300',
    'ペン 200',
    '小計 500',
    '外税 50',
    '合計 550',
    '（税抜）',
  ].join('\n');

  it('明細は税抜のまま、印字の合計との差が消費税', () => {
    const got = parseReceipt(text);
    expect(got.date).toBe('2026-11-11');
    expect(got.time).toBe('10:15');
    expect(got.tax).toBe('税抜');
    expect(got.subtotal).toBe(500);
    expect(got.taxAmount).toBe(50);
    expect(got.total).toBe(550);
    expect(got.sum).toBe(500);
    expect(got.difference).toBe(50);
    expect(got.matches).toBe(false);
    expect(got.items.map((it) => [it.name, it.amount])).toEqual([['のーと', 300], ['ぺん', 200]]);
    expect(got.unknown).toEqual([]);
  });
});

describe('品名と金額が別の行', () => {
  const text = [
    'ｷﾞｭｳﾆｭｳ1L',
    '198',
    'ﾀﾏｺﾞ 10ｺ',
    '¥258',
    'ｼﾞｭｰｽ 500ml',
    '2コ × 128',
    '合計 712',
    '税込',
  ].join('\r\n');

  it('となりの金額行だけを結ぶ', () => {
    const got = parseReceipt(text);
    expect(got.items.map(yen)).toEqual([
      { name: 'ぎゅうにゅう', quantity: 1, unitPrice: 198, amount: 198, discount: 0, volumeMl: 1000, packCount: null, packUnit: null },
      { name: 'たまご', quantity: 1, unitPrice: 258, amount: 258, discount: 0, volumeMl: null, packCount: 10, packUnit: 'コ' },
      { name: 'じゅーす', quantity: 2, unitPrice: 128, amount: 256, discount: 0, volumeMl: 500, packCount: null, packUnit: null },
    ]);
    expect(got.sum).toBe(712);
    expect(got.matches).toBe(true);
    expect(got.tax).toBe('税込');
    expect(got.unknown).toEqual([]);
  });

  it('品名が続いたあと金額が続く列は、順番でまとめない', () => {
    const got = parseReceipt('牛乳\n卵\n198\n258\n合計 456');
    expect(got.items).toEqual([]);
    expect(got.unknown.map((u) => u.raw)).toEqual(['牛乳', '卵', '198', '258']);
    expect(got.total).toBe(456);
    expect(got.sum).toBe(0);
    expect(got.difference).toBe(456);
    expect(got.matches).toBe(false);
  });
});

describe('合計が合わない', () => {
  it('ずれた金額を返す', () => {
    const got = parseReceipt('牛乳 200\n卵 300\n合計 450');
    expect(got.tax).toBe('不明');
    expect(got.sum).toBe(500);
    expect(got.total).toBe(450);
    expect(got.difference).toBe(50);
    expect(got.matches).toBe(false);
    expect(got.date).toBeNull();
    expect(got.time).toBeNull();
  });

  it('合計が次の行でも印字の合計として読む', () => {
    const got = parseReceipt('牛乳 200\n合計\n200');
    expect(got.total).toBe(200);
    expect(got.matches).toBe(true);
    expect(got.unknown).toEqual([]);
  });

  it('割り切れない数量は単価を作らない', () => {
    const got = parseReceipt('りんご ×3 100');
    expect(yen(got.items[0])).toMatchObject({ name: 'りんご', quantity: 3, unitPrice: null, amount: 100, discount: 0 });
  });
});

describe('会員番号・カード・電話', () => {
  const text = [
    '2026/11/11 12:00',
    '牛乳 200',
    '会員番号 1234-5678-9012',
    'カード番号 ****4242',
    '下4桁 4242',
    'VISA **** **** **** 4242',
    'TEL 03-1234-5678',
    '電話 03-9999-0000',
    '090-1111-2222',
    '卵 100',
    '合計 300',
  ].join('\n');

  it('明細に入れず、残す文字からも落とす', () => {
    const got = parseReceipt(text);
    expect(got.items.map((it) => [it.name, it.amount])).toEqual([['牛乳', 200], ['卵', 100]]);
    expect(got.matches).toBe(true);
    expect(got.unknown).toEqual([]);
    const dumped = JSON.stringify(got);
    for (const secret of ['1234-5678-9012', '****4242', '03-1234-5678', '03-9999-0000', '090-1111-2222', '4242']) {
      expect(dumped).not.toContain(secret);
      expect(got.text).not.toContain(secret);
    }
    expect(got.text).toContain('牛乳 200');
    expect(got.text).toContain('卵 100');
    expect(stripSensitiveLines(text)).toBe(got.text);
    expect(stripSensitiveLines(got.text)).toBe(got.text);
  });

  it('品名の「携帯電話」は電話番号の行にしない', () => {
    const got = parseReceipt('携帯電話 98000\n合計 98000');
    expect(got.items.map((it) => [it.name, it.amount])).toEqual([['携帯電話', 98000]]);
    expect(got.text).toContain('携帯電話 98000');
    expect(got.matches).toBe(true);
  });
});

describe('空と崩れた文字', () => {
  it('空文字・空白・null は空の結果', () => {
    for (const input of ['', '   \n  ', null, undefined]) {
      const got = parseReceipt(input);
      expect(got.items).toEqual([]);
      expect(got.unknown).toEqual([]);
      expect(got.total).toBeNull();
      expect(got.sum).toBe(0);
      expect(got.difference).toBeNull();
      expect(got.matches).toBeNull();
      expect(got.tax).toBe('不明');
      expect(got.text).toBe('');
    }
  });

  it('読めない行は捨てずに不明として残す', () => {
    const got = parseReceipt('◆◇◆\n???\n12ab34\n千葉市1-2-3\n5%オフ');
    expect(got.items).toEqual([]);
    expect(got.unknown.map((u) => u.raw)).toEqual(['◆◇◆', '???', '12ab34', '千葉市1-2-3', '5%オフ']);
    expect(got.matches).toBeNull();
  });

  it('税込と税抜が両方あるときは不明', () => {
    expect(parseReceipt('税込\n税抜\n牛乳 100\n合計 100').tax).toBe('不明');
  });

  it('年のない日付は日付にしない', () => {
    const got = parseReceipt('11月11日\n牛乳 198\n合計 198');
    expect(got.date).toBeNull();
    expect(got.items.map((it) => it.name)).toEqual(['牛乳']);
    expect(got.matches).toBe(true);
    expect(got.unknown).toEqual([]);
  });
});

describe('商品番号と税の印と容量', () => {
  it('品名から外し、元の表記は残す', () => {
    const line = '4901234567890 *軽ｷﾞｭｳﾆｭｳ1L ×2 396';
    const got = parseReceipt(`${line}\n012345 ﾊﾟﾝ 158\n合計 554`);
    expect(got.items.map(yen)).toEqual([
      { name: 'ぎゅうにゅう', quantity: 2, unitPrice: 198, amount: 396, discount: 0, volumeMl: 1000, packCount: null, packUnit: null },
      { name: 'ぱん', quantity: 1, unitPrice: 158, amount: 158, discount: 0, volumeMl: null, packCount: null, packUnit: null },
    ]);
    expect(got.items[0].raw).toBe(line);
    expect(got.items[0].name).not.toContain('4901234567890');
    expect(got.matches).toBe(true);
    expect(cleanProductLabel('No.12 牛乳500ml')).toEqual({
      name: '牛乳', notation: '牛乳500ml', quantity: null, volumeMl: 500, weightG: null, packCount: null, packUnit: null,
    });
    expect(cleanProductLabel('牛乳1L')).toMatchObject({ name: '牛乳', notation: '牛乳1l', volumeMl: 1000, weightG: null });
    expect(cleanProductLabel('ヨーグルト350g')).toMatchObject({ name: 'よーぐると', weightG: 350, volumeMl: null });
    expect(cleanProductLabel('ｷﾞｭｳﾆｭｳ1L').notation).toBe('ぎゅうにゅう1l');
    expect(cleanProductLabel('軽 卵10個入り ×2')).toMatchObject({
      name: '卵', quantity: 2, packCount: 10, packUnit: 'コ', volumeMl: null,
    });
  });

  it('1.5L は 1500ml。350g は品名から外して重さにする', () => {
    const got = parseReceipt('ｼﾞｭｰｽ1.5L 180\nﾖｰｸﾞﾙﾄ350g 120\n合計 300');
    expect(got.items[0]).toMatchObject({ name: 'じゅーす', volumeMl: 1500, weightG: null, amount: 180 });
    expect(got.items[1]).toMatchObject({ name: 'よーぐると', volumeMl: null, weightG: 350, amount: 120 });
    expect(got.items[1].raw).toBe('ﾖｰｸﾞﾙﾄ350g 120');
    expect(parseReceipt('牛乳1L 198\n合計 198').items[0]).toMatchObject({ name: '牛乳', volumeMl: 1000, amount: 198 });
  });
});
