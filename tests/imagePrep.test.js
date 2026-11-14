import { describe, expect, it } from 'vitest';
import {
  binarize, cropRectFor, darkRatio, deskewRotation, estimateSkewDegrees, flattenBackground, inkBounds,
  lumaPlane, otsuThreshold, planeToRgba, prepSize, removeLargeBlobs, shrinkPlane, softBinarize,
  stretchContrast, whiteOutsideInk, whitenMask,
} from '../src/lib/imagePrep.js';

function blank(w, h, v = 255) {
  return new Uint8Array(w * h).fill(v);
}

function rect(plane, w, x0, y0, x1, y1, v = 0) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) plane[y * w + x] = v;
}

/** 文字の行に見える黒い短冊を並べ、(cx, cy) を中心に deg 度だけ時計回りに回した二値画像。 */
function slantedText(w, h, deg) {
  const src = blank(w, h);
  for (let row = 0; row < 8; row++) {
    const y = 30 + row * 28;
    for (let col = 0; col < 14; col++) rect(src, w, 30 + col * 32, y, 30 + col * 32 + 22, y + 9);
  }
  if (!deg) return src;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out = blank(w, h);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.round((x - cx) * cos + (y - cy) * sin + cx);
      const sy = Math.round(-(x - cx) * sin + (y - cy) * cos + cy);
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) out[y * w + x] = src[sy * w + sx];
    }
  }
  return out;
}

describe('読み取り用の大きさ', () => {
  it('幅が 1500 未満なら 1800 まで拡大、2000 超なら 2000 に縮小、間はそのまま', () => {
    expect(prepSize(900, 1200)).toEqual({ width: 1800, height: 2400, scale: 2 });
    expect(prepSize(1500, 2000).scale).toBe(1);
    expect(prepSize(2000, 1000).width).toBe(2000);
    expect(prepSize(4032, 3024)).toMatchObject({ width: 2000, height: 1500 });
  });

  it('拡大は3倍まで。縦が 3600 を超えるときは縦で縮める', () => {
    expect(prepSize(300, 300)).toMatchObject({ width: 900, height: 900, scale: 3 });
    const tall = prepSize(1800, 5000);
    expect(tall.height).toBe(3600);
    expect(tall.width).toBe(1296);
  });

  it('0 や不正な大きさは 0 を返す', () => {
    expect(prepSize(0, 100)).toEqual({ width: 0, height: 0, scale: 1 });
    expect(prepSize(NaN, 100).width).toBe(0);
  });
});

describe('白黒・コントラスト・しきい値', () => {
  it('RGBA から明るさだけを取り、RGBA に戻すと不透明な白黒になる', () => {
    const luma = lumaPlane(Uint8ClampedArray.of(255, 0, 0, 255, 255, 255, 255, 10));
    expect(Array.from(luma)).toEqual([76, 255]);
    expect(Array.from(planeToRgba(luma))).toEqual([76, 76, 76, 255, 255, 255, 255, 255]);
  });

  it('コントラスト強調は、せまい明るさの幅を 0〜255 に広げる', () => {
    const plane = Uint8Array.from([100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 200]);
    const out = stretchContrast(plane, 0, 0);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
    expect(out[0]).toBeLessThan(out[5]);
  });

  it('ほぼ一色の画像は引き伸ばさずそのまま返す', () => {
    const plane = blank(10, 10, 200);
    expect(Array.from(stretchContrast(plane))).toEqual(Array.from(plane));
  });

  it('大津の方法は、暗い群と明るい群のあいだにしきい値を置く', () => {
    const plane = new Uint8Array(200);
    for (let i = 0; i < 200; i++) plane[i] = i < 60 ? 50 + (i % 10) : 200 + (i % 10);
    const t = otsuThreshold(plane);
    expect(t).toBeGreaterThanOrEqual(59);
    expect(t).toBeLessThan(200);
    const bin = binarize(plane, t);
    expect(Array.from(bin).filter((v) => v === 0)).toHaveLength(60);
    expect(darkRatio(bin)).toBeCloseTo(0.3, 5);
  });

  it('二値化はしきい値ちょうどを黒とする。空の配列でも落ちない', () => {
    expect(Array.from(binarize(Uint8Array.of(99, 100, 101), 100))).toEqual([0, 0, 255]);
    expect(otsuThreshold(new Uint8Array(0))).toBe(128);
    expect(darkRatio(new Uint8Array(0))).toBe(0);
  });

  it('やわらかい二値化は、十分暗い・明るい画素を振り切り、ふちの中間を残す', () => {
    const out = softBinarize(Uint8Array.of(0, 100, 130, 160, 255), 130, 40);
    expect(out[0]).toBe(0);
    expect(out[4]).toBe(255);
    expect(out[2]).toBeGreaterThan(100);
    expect(out[2]).toBeLessThan(160);
    expect(out[1]).toBeLessThan(out[2]);
  });
});

describe('影の除去', () => {
  it('左が暗く右が明るい紙でも、字は暗いまま、紙は同じ明るさにそろう', () => {
    const w = 120;
    const h = 40;
    const plane = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plane[y * w + x] = 90 + Math.round((x / w) * 120);
    rect(plane, w, 20, 15, 28, 25, 30);
    rect(plane, w, 90, 15, 98, 25, 120);
    const flat = flattenBackground(plane, w, h, 15);
    const paperLeft = flat[5 * w + 8];
    const paperRight = flat[5 * w + 110];
    expect(Math.abs(paperLeft - paperRight)).toBeLessThan(25);
    expect(flat[20 * w + 24]).toBeLessThan(paperLeft - 60);
    expect(flat[20 * w + 94]).toBeLessThan(paperRight - 60);
    const bin = binarize(flat, otsuThreshold(stretchContrast(flat)));
    expect(bin[20 * w + 24]).toBe(0);
    expect(bin[5 * w + 110]).toBe(255);
  });

  it('大きさが合わないときは空の結果を返す', () => {
    expect(flattenBackground(new Uint8Array(5), 4, 4)).toHaveLength(5);
  });
});

describe('傾き', () => {
  it('まっすぐな行は 0 度', () => {
    expect(estimateSkewDegrees(slantedText(480, 260, 0), 480, 260)).toBe(0);
  });

  it.each([-6, -2.5, 3.2, 7])('時計回りに %s 度傾いた行を、±0.5 度で当てる', (deg) => {
    const got = estimateSkewDegrees(slantedText(480, 260, deg), 480, 260);
    expect(Math.abs(got - deg)).toBeLessThanOrEqual(0.5);
  });

  it('字が少ない・大きさが合わないときは 0 度', () => {
    expect(estimateSkewDegrees(blank(100, 100), 100, 100)).toBe(0);
    expect(estimateSkewDegrees(blank(10, 10), 100, 100)).toBe(0);
  });

  it('直す回転は傾きの逆向き。小さい傾きと極端な傾きは直さない', () => {
    expect(deskewRotation(3.2)).toBe(-3.2);
    expect(deskewRotation(-5)).toBe(5);
    expect(deskewRotation(0.2)).toBe(0);
    expect(deskewRotation(40)).toBe(0);
    expect(deskewRotation(NaN)).toBe(0);
  });

  it('縮小は黒を残す（細い線が消えない）', () => {
    const plane = blank(100, 100);
    rect(plane, 100, 10, 10, 11, 90);
    const small = shrinkPlane(plane, 100, 100, 25);
    expect(small.width).toBeLessThan(100);
    expect(Array.from(small.plane).filter((v) => v === 0).length).toBeGreaterThan(5);
  });
});

describe('紙のふち・範囲', () => {
  it('大きい黒のかたまり（紙のふちの帯）だけを消し、字の大きさのかたまりは残す', () => {
    const w = 120;
    const h = 60;
    const plane = blank(w, h);
    rect(plane, w, 0, 2, 120, 8);
    rect(plane, w, 20, 30, 28, 40);
    rect(plane, w, 60, 30, 68, 40);
    const mask = new Uint8Array(plane.length);
    const removed = removeLargeBlobs(plane, w, h, 30, mask);
    expect(removed).toBe(120 * 6);
    expect(plane[5 * w + 50]).toBe(255);
    expect(mask[5 * w + 50]).toBe(1);
    expect(plane[35 * w + 24]).toBe(0);
    expect(mask[35 * w + 24]).toBe(0);
  });

  it('字そのものが大きい画像では、字の大きさの倍率を上限にして字を消さない', () => {
    const w = 400;
    const h = 120;
    const plane = blank(w, h);
    for (let i = 0; i < 5; i++) rect(plane, w, 10 + i * 70, 20, 10 + i * 70 + 50, 90);
    const copy = plane.slice();
    expect(removeLargeBlobs(copy, w, h, 30)).toBe(5 * 50 * 70);
    const kept = plane.slice();
    expect(removeLargeBlobs(kept, w, h, 30, null, 4)).toBe(0);
    expect(Array.from(kept)).toEqual(Array.from(plane));
    rect(kept, w, 0, 100, 400, 112);
    expect(removeLargeBlobs(kept, w, h, 30, null, 4)).toBe(400 * 12);
  });

  it('つながった形（L字・斜め）も1つのかたまりとして数える', () => {
    const w = 40;
    const h = 40;
    const plane = blank(w, h);
    rect(plane, w, 2, 2, 4, 38);
    rect(plane, w, 2, 36, 38, 38);
    expect(removeLargeBlobs(plane, w, h, 30)).toBe(2 * 36 + 34 * 2);
    expect(darkRatio(plane)).toBe(0);
  });

  it('字のある範囲を、余白つきで返す。ごみの点は無視できる', () => {
    const w = 100;
    const h = 80;
    const plane = blank(w, h);
    rect(plane, w, 30, 20, 60, 50);
    plane[2 * w + 95] = 0;
    expect(inkBounds(plane, w, h, 0, 1)).toEqual({ x: 30, y: 2, width: 66, height: 48 });
    expect(inkBounds(plane, w, h, 5, 3)).toEqual({ x: 25, y: 15, width: 40, height: 40 });
    expect(inkBounds(blank(10, 10), 10, 10)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('小さい画像での範囲を元の画像の座標に直す。広すぎる・ごみだけなら切り取らない', () => {
    expect(cropRectFor({ x: 100, y: 200, width: 300, height: 400 }, 1000, 1000, 4000, 4000, 0)).toEqual({ x: 400, y: 800, width: 1200, height: 1600 });
    const withMargin = cropRectFor({ x: 100, y: 200, width: 300, height: 400 }, 1000, 1000, 4000, 4000, 0.01);
    expect(withMargin).toEqual({ x: 360, y: 760, width: 1280, height: 1680 });
    expect(cropRectFor({ x: 0, y: 0, width: 990, height: 990 }, 1000, 1000, 4000, 4000)).toBeNull();
    expect(cropRectFor({ x: 5, y: 5, width: 10, height: 10 }, 1000, 1000, 4000, 4000)).toBeNull();
    expect(cropRectFor(null, 1000, 1000, 4000, 4000)).toBeNull();
  });

  it('消す範囲の外側や、字から遠い灰色を白にする', () => {
    const w = 30;
    const h = 30;
    const plane = blank(w, h, 120);
    const ink = blank(w, h);
    rect(ink, w, 10, 10, 12, 12);
    whiteOutsideInk(plane, ink, w, h, 2);
    expect(plane[10 * w + 10]).toBe(120);
    expect(plane[12 * w + 13]).toBe(120);
    expect(plane[10 * w + 20]).toBe(255);
    expect(plane[25 * w + 25]).toBe(255);
    const target = blank(w, h, 0);
    const mask = new Uint8Array(w * h);
    mask[15 * w + 15] = 1;
    whitenMask(target, mask, w, h, 1);
    expect(target[14 * w + 14]).toBe(255);
    expect(target[16 * w + 16]).toBe(255);
    expect(target[17 * w + 17]).toBe(0);
  });
});
