// レシート写真を、読む前に小さく・白黒・濃くする。画素配列だけで完結する（外には送らない）。

/** 長辺が maxEdge を超えるときだけ縮小した幅と高さ。 */
export function targetSize(width, height, maxEdge = 2000) {
  const w = Math.max(0, Math.floor(Number(width) || 0));
  const h = Math.max(0, Math.floor(Number(height) || 0));
  if (!w || !h) return { width: 1, height: 1 };
  const edge = Math.max(w, h);
  const limit = Number(maxEdge);
  if (!Number.isFinite(limit) || limit < 1 || edge <= limit) return { width: w, height: h };
  const scale = limit / edge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** 双一次補間。幅と高さが同じなら同じ配列を返す。 */
export function resizeRGBA(data, width, height, tw, th) {
  if (tw === width && th === height) return data;
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy = ((y + 0.5) * height) / th - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < tw; x++) {
      const sx = ((x + 0.5) * width) / tw - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const i = (y * tw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = data[(y0 * width + x0) * 4 + c];
        const p10 = data[(y0 * width + x1) * 4 + c];
        const p01 = data[(y1 * width + x0) * 4 + c];
        const p11 = data[(y1 * width + x1) * 4 + c];
        out[i + c] = Math.round(p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy);
      }
    }
  }
  return out;
}

/** 透明は白の上に載せてから、輝度の白黒にする。 */
export function toGray(rgba, width, height) {
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const alpha = rgba[o + 3] / 255;
    const r = rgba[o] * alpha + 255 * (1 - alpha);
    const g = rgba[o + 1] * alpha + 255 * (1 - alpha);
    const b = rgba[o + 2] * alpha + 255 * (1 - alpha);
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    out[o] = out[o + 1] = out[o + 2] = y;
    out[o + 3] = 255;
  }
  return out;
}

/** 上下 2% を伸ばして、印字と余白の差を大きくする。すでに濃いときはそのまま。 */
export function stretchContrast(rgba, width, height) {
  const n = width * height;
  if (!n) return rgba;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[rgba[i * 4]]++;
  const cut = n * 0.02;
  let acc = 0;
  let lo = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= cut) { lo = v; break; }
  }
  acc = 0;
  let hi = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= cut) { hi = v; break; }
  }
  if (hi <= lo + 16) return rgba;
  const scale = 255 / (hi - lo);
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < n; i++) {
    let y = Math.round((rgba[i * 4] - lo) * scale);
    if (y < 0) y = 0;
    else if (y > 255) y = 255;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = y;
    out[o + 3] = 255;
  }
  return out;
}

/** { width, height, data } を縮小し、白黒にして濃くする。 */
export function prepareImageData(image, { maxEdge = 2000 } = {}) {
  const width = Math.max(0, Math.floor(Number(image?.width) || 0));
  const height = Math.max(0, Math.floor(Number(image?.height) || 0));
  const src = image?.data;
  if (!width || !height || !src) {
    return { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) };
  }
  const size = targetSize(width, height, maxEdge);
  const resized = resizeRGBA(src, width, height, size.width, size.height);
  const gray = toGray(resized, size.width, size.height);
  return { width: size.width, height: size.height, data: stretchContrast(gray, size.width, size.height) };
}
