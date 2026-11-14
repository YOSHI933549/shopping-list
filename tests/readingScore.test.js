import { describe, expect, it } from 'vitest';
import { isConfidentReading, pickBestReading, scoreReading } from '../src/lib/readingScore.js';

const GOOD = '牛乳 ¥198\nたまご ¥258\n合計 ¥456';
const SHIFTED = '牛乳 ¥198\nたまご ¥258\n合計 ¥999';
const WEAK = 'スーパー\n牛乳\n';

describe('読み取りの出来', () => {
  it('合計が明細と合えば高く、明細が無ければ 0', () => {
    expect(scoreReading(GOOD)).toBeGreaterThan(scoreReading(SHIFTED));
    expect(scoreReading(SHIFTED)).toBeGreaterThan(scoreReading(WEAK));
    expect(scoreReading(WEAK)).toBe(0);
    expect(scoreReading('')).toBe(0);
  });

  it('不明な行が多いほど少し下がる', () => {
    expect(scoreReading('牛乳 198\nたまご 258')).toBeGreaterThan(scoreReading('牛乳 198\nたまご 258\nあああ\nいいい'));
  });

  it('いちばん高い読み取りを選び、同点なら先のもの。空なら空文字', () => {
    expect(pickBestReading([WEAK, SHIFTED, GOOD])).toBe(GOOD);
    expect(pickBestReading(['牛乳 198', '卵 258'])).toBe('牛乳 198');
    expect(pickBestReading([])).toBe('');
    expect(pickBestReading(null)).toBe('');
  });

  it('合計が合い、明細が2行以上のときだけ「十分」とする', () => {
    expect(isConfidentReading(GOOD)).toBe(true);
    expect(isConfidentReading(SHIFTED)).toBe(false);
    expect(isConfidentReading('牛乳 ¥198\n合計 ¥198')).toBe(false);
    expect(isConfidentReading('')).toBe(false);
  });
});
