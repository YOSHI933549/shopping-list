import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../src/lib/receipt.js';

const brief = (r) => r.items.map((i) => [i.name, i.amount]);

describe('撮って読むの解析: 品名と値段', () => {
  it('行の右端の値段を取り、残りを品名にする（円・¥・カンマ・全角）', () => {
    const r = parseReceipt('牛乳 198\nたまご ¥258\nパン 120円\nキャベツ ￥１，２８０\nりんご ３００円\n合計 2156');
    expect(brief(r)).toEqual([['牛乳', 198], ['たまご', 258], ['ぱん', 120], ['きゃべつ', 1280], ['りんご', 300]]);
    expect(r.total).toBe(2156);
    expect(r.matches).toBe(true);
  });

  it('末尾の「※」「*」「軽」「軽減」と税率は値段にも品名にも入らない', () => {
    const r = parseReceipt('牛乳 198※\n豆腐 98*\nバナナ 158 ＊\n納豆 88軽\n卵 258(軽)\nお茶 140 8%\n合計 940');
    expect(brief(r)).toEqual([['牛乳', 198], ['豆腐', 98], ['ばなな', 158], ['納豆', 88], ['卵', 258], ['お茶', 140]]);
    expect(r.unknown).toEqual([]);
    expect(r.matches).toBe(true);
  });

  it('頭の「※」と、「¥」が Y や \\ に読まれた値段も読む', () => {
    const r = parseReceipt('※牛乳 Y198\n※たまご  \\258\n※ほうれん草  V148\n合計 604');
    expect(brief(r)).toEqual([['牛乳', 198], ['たまご', 258], ['ほうれん草', 148]]);
    expect(r.matches).toBe(true);
  });

  it('千の区切りが「.」に読まれても、小数ではなく千として読む', () => {
    const r = parseReceipt('米 5kg  ¥2.480\n合計 2480');
    expect(brief(r)).toEqual([['米', 2480]]);
    expect(r.items[0].weightG).toBe(5000);
    expect(r.matches).toBe(true);
  });

  it('日本語の字のあいだに空白が入って読まれても、品名はつながる', () => {
    const r = parseReceipt('た ま ご 10個 入  ¥258\n洗 剤 つめかえ  ¥328\n合計 586');
    expect(r.items.map((i) => i.name)).toEqual(['たまご', '洗剤つめかえ']);
    expect(r.items[0].packCount).toBe(10);
    expect(r.matches).toBe(true);
  });
});

describe('撮って読むの解析: 値段が次の行にずれたとき', () => {
  it('値段だけの行が品名の次の行にあれば、直前の品名とまとめる', () => {
    const r = parseReceipt('牛乳\n¥198\nたまご\n258\n合計 456');
    expect(brief(r)).toEqual([['牛乳', 198], ['たまご', 258]]);
    expect(r.unknown).toEqual([]);
    expect(r.matches).toBe(true);
  });

  it('品名の次の行が「@単価 ×数量 金額」なら、数量つきの1品にまとめる', () => {
    const r = parseReceipt('食パン 6枚切 2点\n@98 ×2  ¥196\n合計 196');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ amount: 196, quantity: 2, unitPrice: 98 });
    expect(r.items[0].name).toContain('ぱん');
  });

  it('品名の行が続いたあとの値段は、順番だけで結び付けず不明の行に残す', () => {
    const r = parseReceipt('牛乳\nたまご\n198\n258');
    expect(r.items).toEqual([]);
    expect(r.unknown.map((u) => u.raw)).toEqual(['牛乳', 'たまご', '198', '258']);
  });

  it('値段のない行は品物に入れない', () => {
    const r = parseReceipt('スーパーまるや 駅前店\nありがとうございました\n牛乳 198\nまたのお越しをお待ちしております');
    expect(brief(r)).toEqual([['牛乳', 198]]);
  });
});

describe('撮って読むの解析: 品物にしない行', () => {
  it('小計・合計・消費税・お預り・お釣りは品物にせず、合計だけ照合に使う', () => {
    const r = parseReceipt('牛乳 198\n卵 258\n小計 ¥456\n外税 ¥36\n消費税等(8%) ¥36\n合計 ¥492\nお預り ¥1,000\nお釣り ¥508');
    expect(brief(r)).toEqual([['牛乳', 198], ['卵', 258]]);
    expect(r.subtotal).toBe(456);
    expect(r.total).toBe(492);
    expect(r.taxAmount).toBe(72);
  });

  it('合計・お釣り・お預りが読み違えられても品物にならない', () => {
    const r = parseReceipt('牛乳 Y198\n台計  \\1.078\nお約けり  \\922\nお克り  V2.000');
    expect(brief(r)).toEqual([['牛乳', 198]]);
    expect(r.total).toBe(1078);
  });

  it('ポイント・点数の行は品物にしない', () => {
    const r = parseReceipt('牛乳 198\nポイント 10\n今回ポイント 5P\nお買上点数 5点\nポイント付与 10P\n合計 198');
    expect(brief(r)).toEqual([['牛乳', 198]]);
    expect(r.matches).toBe(true);
  });

  it('割引・値引・クーポンは品物にせず、直前の品の割引として引く（これまでと同じ）', () => {
    const r = parseReceipt('牛乳 198\n割引 20\nたまご 258\nクーポン値引 -¥50\n洗剤 328\n10%割引 -¥30\n合計 684');
    expect(brief(r)).toEqual([['牛乳', 178], ['たまご', 208], ['洗剤', 298]]);
    expect(r.items.map((i) => i.discount)).toEqual([20, 50, 30]);
    expect(r.total).toBe(684);
    expect(r.matches).toBe(true);
  });

  it('日付・時刻・電話・レジ番号の行は品物にしない', () => {
    const r = parseReceipt('2026年11月14日(土) 10:32 レジ03\nTEL 03-1234-5678\n牛乳 198');
    expect(brief(r)).toEqual([['牛乳', 198]]);
    expect(r.date).toBe('2026-11-14');
    expect(r.time).toBe('10:32');
  });
});

describe('撮って読むの解析: 実際に読み取った行の例', () => {
  it('少し読み違いのある読み取り結果でも、値段は正しい行に付き、合計と一致する', () => {
    const text = [
      'スーバーまるや駅前店',
      '2026年11月14日(土)10.32 レジ03',
      'TEL 03-1234-5678',
      '* は科大科字8%対象',
      '* 年乳 1L  Y198',
      '* たまご 10個人  V258',
      '* ほうつれん末  Y148',
      '* 條バン 6枚切2 点',
      '@98 ・2  Y\\196',
      '浜刑つめか和え  Y328',
      'クーポン値引  -W50',
      '小計  \\1.078',
      '消費科等(8%)  Y80',
      '台計  \\1.078',
      'お克り  V2.000',
      'お約けり  \\922',
      'ポイント付呈 10P',
    ].join('\n');
    const r = parseReceipt(text);
    expect(r.items.map((i) => i.amount)).toEqual([198, 258, 148, 196, 278]);
    expect(r.items[4].discount).toBe(50);
    expect(r.total).toBe(1078);
    expect(r.subtotal).toBe(1078);
    expect(r.sum).toBe(1078);
    expect(r.matches).toBe(true);
    expect(r.unknown.map((u) => u.raw)).toEqual(['スーバーまるや駅前店']);
  });
});
