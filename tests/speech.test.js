import { describe, it, expect } from 'vitest';
import { parseSpoken, speechSupported } from '../src/lib/speech.js';

describe('parseSpoken', () => {
  it.each([
    ['牛乳、卵、パン', ['牛乳', '卵', 'パン']],
    ['牛乳,卵', ['牛乳', '卵']],
    ['牛乳 卵 パン', ['牛乳', '卵', 'パン']],
    ['牛乳と卵', ['牛乳', '卵']],
    ['豆腐と納豆とキャベツ', ['豆腐', '納豆', 'キャベツ']],
    ['とうふ', ['とうふ']],
    ['トマト', ['トマト']],
    ['ポテトサラダ', ['ポテトサラダ']],
    ['砂糖', ['砂糖']],
    ['', []],
    ['  、 ', []],
  ])('%s', (input, expected) => expect(parseSpoken(input)).toEqual(expected));
  it('未対応環境', () => expect(speechSupported({})).toBe(false));
  it('対応環境', () => expect(speechSupported({ webkitSpeechRecognition: function () {} })).toBe(true));
});
