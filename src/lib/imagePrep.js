// 読む前の画像の下ごしらえ。画素の配列だけを扱う純粋関数。画面（canvas）は src/ocr/prepareImage.js。
// 画像はこの端末の中だけで扱い、どこにも送らない。

export const PREP_MIN_WIDTH = 1500;
export const PREP_TARGET_WIDTH = 1800;
export const PREP_MAX_WIDTH = 2000;
export const PREP_MAX_HEIGHT = 3600;
export const PREP_MAX_UPSCALE = 3;

function positiveInt(n) {
  const x = Math.round(Number(n));
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * 読み取り用の大きさ。幅が 1500 未満なら 1800 に拡大（最大3倍）、2000 を超えたら 2000 に縮小。
 * 1500〜2000 はそのまま。縦が 3600 を超えるときは縦で縮める。
 */
export function prepSize(width, height) {
  const w = positiveInt(width);
  const h = positiveInt(height);
  if (!w || !h) return { width: 0, height: 0, scale: 1 };
  let scale = 1;
  if (w < PREP_MIN_WIDTH) scale = Math.min(PREP_TARGET_WIDTH / w, PREP_MAX_UPSCALE);
  else if (w > PREP_MAX_WIDTH) scale = PREP_MAX_WIDTH / w;
  if (h * scale > PREP_MAX_HEIGHT) scale = PREP_MAX_HEIGHT / h;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/** RGBA から明るさだけの Uint8Array（幅×高さ）を取り出す。整数近似（77, 150, 29）。 */
export function lumaPlane(rgba) {
  const src = rgba instanceof Uint8ClampedArray || rgba instanceof Uint8Array ? rgba : Uint8Array.from(rgba || []);
  const n = Math.floor(src.length / 4);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    out[i] = (src[j] * 77 + src[j + 1] * 150 + src[j + 2] * 29) >> 8;
  }
  return out;
}

/** 明るさの配列を RGBA（白黒・不透明）に戻す。 */
export function planeToRgba(plane) {
  const out = new Uint8ClampedArray(plane.length * 4);
  for (let i = 0; i < plane.length; i++) {
    const j = i * 4;
    out[j] = plane[i];
    out[j + 1] = plane[i];
    out[j + 2] = plane[i];
    out[j + 3] = 255;
  }
  return out;
}

/**
 * 影やむらを消す。各画素を「まわり（半径 radius の四角）の平均」で割り、白を 200 付近にそろえる。
 * 紙の明るさが場所で違っても、字だけが暗く残る。
 */
export function flattenBackground(plane, width, height, radius = Math.max(12, Math.round(width / 40))) {
  const w = positiveInt(width);
  const h = positiveInt(height);
  const out = new Uint8Array(plane.length);
  if (!w || !h || plane.length !== w * h) return out;
  const stride = w + 1;
  const sat = new Uint32Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += plane[y * w + x];
      sat[(y + 1) * stride + x + 1] = sat[y * stride + x + 1] + row;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const area = (x1 - x0) * (y1 - y0);
      const sum = sat[y1 * stride + x1] - sat[y0 * stride + x1] - sat[y1 * stride + x0] + sat[y0 * stride + x0];
      const mean = Math.max(1, sum / area);
      const v = (plane[y * w + x] * 200) / mean;
      out[y * w + x] = v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

/** 暗い側 lowPct%、明るい側 highPct% を切り捨てて 0〜255 に引き伸ばす（コントラスト強調）。 */
export function stretchContrast(plane, lowPct = 1, highPct = 1) {
  const out = new Uint8Array(plane.length);
  if (!plane.length) return out;
  const hist = new Uint32Array(256);
  for (let i = 0; i < plane.length; i++) hist[plane[i]]++;
  const lowCut = (plane.length * lowPct) / 100;
  const highCut = (plane.length * highPct) / 100;
  let acc = 0;
  let lo = 0;
  for (; lo < 255; lo++) {
    acc += hist[lo];
    if (acc > lowCut) break;
  }
  acc = 0;
  let hi = 255;
  for (; hi > 0; hi--) {
    acc += hist[hi];
    if (acc > highCut) break;
  }
  if (hi - lo < 8) {
    out.set(plane);
    return out;
  }
  const scale = 255 / (hi - lo);
  for (let i = 0; i < plane.length; i++) {
    const v = (plane[i] - lo) * scale;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  return out;
}

/** 大津の方法。暗い群と明るい群の分離が最大になるしきい値（この値以下を暗いとする）。 */
export function otsuThreshold(plane) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < plane.length; i++) hist[plane[i]]++;
  const total = plane.length;
  if (!total) return 128;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** しきい値以下を黒 (0)、それより明るければ白 (255)。 */
export function binarize(plane, threshold) {
  const out = new Uint8Array(plane.length);
  for (let i = 0; i < plane.length; i++) out[i] = plane[i] <= threshold ? 0 : 255;
  return out;
}

/**
 * しきい値のまわり ±softness だけを 0〜255 に引き伸ばす。しきい値より十分暗い・明るい画素は
 * 黒・白に振り切れ、ふちの中間の明るさは残る。細い字がつぶれにくい二値化。
 */
export function softBinarize(plane, threshold, softness = 40) {
  const out = new Uint8Array(plane.length);
  const lo = threshold - softness;
  const scale = 255 / (softness * 2);
  for (let i = 0; i < plane.length; i++) {
    const v = (plane[i] - lo) * scale;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  return out;
}

/** mask が 1 の画素と、そこから grow 画素以内を白にする。plane を直接書き換える。 */
export function whitenMask(plane, mask, width, height, grow = 0) {
  const w = positiveInt(width);
  const h = positiveInt(height);
  if (!w || !h || plane.length !== w * h || mask.length !== plane.length) return;
  const hit = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) hit.push(i);
  for (const i of hit) {
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -grow; dy <= grow; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -grow; dx <= grow; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w) plane[yy * w + xx] = 255;
      }
    }
  }
}

/**
 * 二値画像 ink（黒=0）の黒から radius 画素より遠い所を、plane で白にする。
 * ふちや影のうすい灰色（字ではない）が残らず、字のふちの中間の明るさだけが残る。plane を直接書き換える。
 */
export function whiteOutsideInk(plane, ink, width, height, radius = 2) {
  const w = positiveInt(width);
  const h = positiveInt(height);
  if (!w || !h || plane.length !== w * h || ink.length !== plane.length) return;
  const wide = new Uint8Array(plane.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ink[y * w + x] !== 0) continue;
      const a = Math.max(0, x - radius);
      const b = Math.min(w - 1, x + radius);
      for (let xx = a; xx <= b; xx++) wide[y * w + xx] = 1;
    }
  }
  const near = new Uint8Array(plane.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!wide[y * w + x]) continue;
      const a = Math.max(0, y - radius);
      const b = Math.min(h - 1, y + radius);
      for (let yy = a; yy <= b; yy++) near[yy * w + x] = 1;
    }
  }
  for (let i = 0; i < plane.length; i++) if (!near[i]) plane[i] = 255;
}

/** 黒い画素の割合（0〜1）。 */
export function darkRatio(plane) {
  if (!plane.length) return 0;
  let dark = 0;
  for (let i = 0; i < plane.length; i++) if (plane[i] < 128) dark++;
  return dark / plane.length;
}

/** 長辺が maxEdge 以下になるよう縮めた配列（箱平均）。傾きの推定用。 */
export function shrinkPlane(plane, width, height, maxEdge = 600) {
  const scale = Math.max(width, height) / maxEdge;
  if (scale <= 1) return { plane, width, height };
  const step = Math.ceil(scale);
  const w = Math.max(1, Math.floor(width / step));
  const h = Math.max(1, Math.floor(height / step));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let min = 255;
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const v = plane[(y * step + dy) * width + x * step + dx];
          if (v < min) min = v;
        }
      }
      out[y * w + x] = min;
    }
  }
  return { plane: out, width: w, height: h };
}

function profileScore(xs, ys, angle, offset, rows) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const hist = new Uint32Array(rows);
  for (let i = 0; i < xs.length; i++) {
    const r = Math.round(ys[i] * cos - xs[i] * sin + offset);
    if (r >= 0 && r < rows) hist[r]++;
  }
  let score = 0;
  for (let r = 0; r < rows; r++) score += hist[r] * hist[r];
  return score;
}

/**
 * 行の傾き（度）。二値画像（黒=字）の黒い画素を角度ごとに横へ集計し、行がいちばん
 * くっきり分かれる角度を選ぶ。正は時計回りに傾いている（右が下がる）。範囲外・字が少ないときは 0。
 */
export function estimateSkewDegrees(binary, width, height, { maxDegrees = 15, minDarkPixels = 200 } = {}) {
  const w = positiveInt(width);
  const h = positiveInt(height);
  if (!w || !h || binary.length !== w * h) return 0;
  const small = shrinkPlane(binary, w, h);
  const xs = [];
  const ys = [];
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      if (small.plane[y * small.width + x] === 0) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < Math.min(minDarkPixels, 60)) return 0;
  const rows = small.width + small.height + 2;
  const offset = small.width;
  const bigRows = rows + small.width;
  const scoreAt = (deg) => profileScore(xs, ys, (deg * Math.PI) / 180, offset, bigRows);
  let bestDeg = 0;
  let best = scoreAt(0);
  const coarse = 0.5;
  for (let d = -maxDegrees; d <= maxDegrees; d += coarse) {
    const s = scoreAt(d);
    if (s > best) {
      best = s;
      bestDeg = d;
    }
  }
  const center = bestDeg;
  for (let d = center - coarse; d <= center + coarse + 1e-9; d += 0.1) {
    const s = scoreAt(d);
    if (s > best) {
      best = s;
      bestDeg = d;
    }
  }
  return Math.round(bestDeg * 10) / 10;
}

/** 傾きを直す回転角（度）。小さすぎる傾きは直さない（0）。 */
export function deskewRotation(skewDegrees, { minDegrees = 0.4, maxDegrees = 15 } = {}) {
  const d = Number(skewDegrees);
  if (!Number.isFinite(d) || Math.abs(d) < minDegrees || Math.abs(d) > maxDegrees) return 0;
  return -d;
}

/**
 * 二値画像（黒=0）から、大きすぎる黒のかたまりを白にする。紙のふちや机の影の帯など、字ではないもの。
 * かたまりの外接四角の長辺が maxExtent を超えたら消す。消した画素数を返す。plane は直接書き換える。
 * removedMask（同じ大きさの Uint8Array）を渡すと、消した画素に 1 を立てる。
 * medianFactor が正なら、字の大きさ（かたまりの外接四角の長辺の中央値）の medianFactor 倍と maxExtent の大きいほうを
 * 上限にする。字そのものが大きい画像で、字を消してしまわないため。
 */
export function removeLargeBlobs(plane, width, height, maxExtent, removedMask = null, medianFactor = 0) {
  const w = positiveInt(width);
  const h = positiveInt(height);
  if (!w || !h || plane.length !== w * h || !(maxExtent > 0)) return 0;
  const label = new Int32Array(w * h);
  const parent = [0];
  const find = (a) => {
    let r = a;
    while (parent[r] !== r) r = parent[r];
    let c = a;
    while (parent[c] !== r) {
      const next = parent[c];
      parent[c] = r;
      c = next;
    }
    return r;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (plane[i] !== 0) continue;
      const left = x > 0 ? label[i - 1] : 0;
      const up = y > 0 ? label[i - w] : 0;
      if (!left && !up) {
        parent.push(parent.length);
        label[i] = parent.length - 1;
      } else if (left && up) {
        label[i] = left;
        const a = find(left);
        const b = find(up);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      } else {
        label[i] = left || up;
      }
    }
  }
  const x0 = new Int32Array(parent.length).fill(w);
  const y0 = new Int32Array(parent.length).fill(h);
  const x1 = new Int32Array(parent.length).fill(-1);
  const y1 = new Int32Array(parent.length).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = label[y * w + x];
      if (!l) continue;
      const r = find(l);
      label[y * w + x] = r;
      if (x < x0[r]) x0[r] = x;
      if (x > x1[r]) x1[r] = x;
      if (y < y0[r]) y0[r] = y;
      if (y > y1[r]) y1[r] = y;
    }
  }
  let limit = maxExtent;
  if (medianFactor > 0) {
    const extents = [];
    const size = new Uint32Array(parent.length);
    for (let i = 0; i < label.length; i++) if (label[i]) size[label[i]]++;
    for (let r = 1; r < parent.length; r++) {
      if (parent[r] === r && size[r] >= 12) extents.push(Math.max(x1[r] - x0[r] + 1, y1[r] - y0[r] + 1));
    }
    if (extents.length) {
      extents.sort((a, b) => a - b);
      limit = Math.max(maxExtent, extents[Math.floor(extents.length / 2)] * medianFactor);
    }
  }
  let removed = 0;
  for (let i = 0; i < plane.length; i++) {
    const r = label[i];
    if (!r) continue;
    if (Math.max(x1[r] - x0[r] + 1, y1[r] - y0[r] + 1) > limit) {
      plane[i] = 255;
      if (removedMask) removedMask[i] = 1;
      removed++;
    }
  }
  return removed;
}

/**
 * 黒い画素がある範囲（余白つき）。黒が無ければ全体。
 * minCount 個未満しか黒がない行・列は無いものとする（ごみの点で範囲が広がらないように）。
 */
export function inkBounds(plane, width, height, margin = 0, minCount = 1) {
  const w = positiveInt(width);
  const h = positiveInt(height);
  const cols = new Uint32Array(w);
  const rows = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (plane[y * w + x] !== 0) continue;
      cols[x]++;
      rows[y]++;
    }
  }
  const first = (counts) => counts.findIndex((c) => c >= minCount);
  const last = (counts) => {
    for (let i = counts.length - 1; i >= 0; i--) if (counts[i] >= minCount) return i;
    return -1;
  };
  const x0 = first(cols);
  const y0 = first(rows);
  const x1 = last(cols);
  const y1 = last(rows);
  if (x0 < 0 || y0 < 0 || x1 < 0 || y1 < 0) return { x: 0, y: 0, width: w, height: h };
  const left = Math.max(0, x0 - margin);
  const top = Math.max(0, y0 - margin);
  const right = Math.min(w, x1 + 1 + margin);
  const bottom = Math.min(h, y1 + 1 + margin);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * 小さく縮めた画像で見つけた字の範囲を、元の画像の座標に直し、余白（長辺の marginRatio）を足す。
 * 範囲が画像の 90% 以上、または 4% 未満（ごみだけ）なら null（切り取らない）。
 */
export function cropRectFor(bounds, detectWidth, detectHeight, sourceWidth, sourceHeight, marginRatio = 0.015) {
  const dw = positiveInt(detectWidth);
  const dh = positiveInt(detectHeight);
  const sw = positiveInt(sourceWidth);
  const sh = positiveInt(sourceHeight);
  if (!bounds || !dw || !dh || !sw || !sh) return null;
  const share = (bounds.width * bounds.height) / (dw * dh);
  if (share >= 0.9 || share < 0.04) return null;
  const fx = sw / dw;
  const fy = sh / dh;
  const margin = Math.round(Math.max(sw, sh) * marginRatio);
  const x = Math.max(0, Math.floor(bounds.x * fx) - margin);
  const y = Math.max(0, Math.floor(bounds.y * fy) - margin);
  const right = Math.min(sw, Math.ceil((bounds.x + bounds.width) * fx) + margin);
  const bottom = Math.min(sh, Math.ceil((bounds.y + bounds.height) * fy) + margin);
  return { x, y, width: right - x, height: bottom - y };
}
