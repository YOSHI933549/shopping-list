import { describe, it, expect } from 'vitest';
import { ICONS, AISLE_ICONS, iconNameFor, icon } from '../src/lib/icons.js';
import { AISLES } from '../src/data/aisles.js';

describe('icons', () => {
  it('全カテゴリにフォールバックアイコンがある', () => {
    for (const a of AISLES) expect(ICONS[AISLE_ICONS[a]]).toBeTruthy();
  });
  it('品名から個別アイコン', () => {
    expect(iconNameFor('キャベツ')).toBe('cabbage');
    expect(iconNameFor('豚こま切れ')).toBe('meat');
    expect(iconNameFor('えのき')).toBe('enoki');
    expect(iconNameFor('絹ごし豆腐')).toBe('tofu');
    expect(iconNameFor('歯ブラシ')).toBe('brush');
  });
  it('未知の品はカテゴリアイコン／箱', () => {
    expect(iconNameFor('ほげほげ')).toBe('box');
    expect(iconNameFor('ラップ')).toBe(AISLE_ICONS['日用品・洗剤']);
  });
  it('svg を返す', () => expect(icon('apple')).toContain('viewBox="0 0 32 32"'));
});
