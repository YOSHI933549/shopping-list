// 文字認識が返した「単語と位置」を、見た目の1行ずつに並べ直す。純粋関数。
// 値段の列が別のかたまりとして読まれても、同じ高さなら品名と同じ行に戻す。
import { joinCjkSpaces } from './receiptLines.js';


function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toBox(word) {
  const b = word && (word.bbox || word);
  const x0 = Number(b?.x0);
  const y0 = Number(b?.y0);
  const x1 = Number(b?.x1);
  const y1 = Number(b?.y1);
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

const DASH_ONLY = /^[ー\-_|｜、。.,'"`~=・]+$/;

/**
 * ごみらしい単語か。紙のふちや影が字に見えたもの。
 * 線や点だけの単語。
 */
export function isNoiseWord(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (DASH_ONLY.test(t) && !/^[-−]$/.test(t)) return true;
  return false;
}

/** tesseract の blocks から単語を平らに集める。 */
export function wordsFromBlocks(blocks) {
  const words = [];
  for (const block of blocks || []) {
    for (const para of block?.paragraphs || []) {
      for (const line of para?.lines || []) {
        for (const w of line?.words || []) words.push(w);
      }
    }
  }
  return words;
}

function gatherItems(words) {
  const items = [];
  for (const w of words || []) {
    const text = String(w?.text ?? '').trim();
    const box = toBox(w);
    if (!box || isNoiseWord(text)) continue;
    items.push({ text, ...box, cy: (box.y0 + box.y1) / 2, h: box.y1 - box.y0 });
  }
  return items;
}

/**
 * 単語（{ text, bbox: { x0, y0, x1, y1 } }）を行にまとめる。
 * 縦の中心が同じ行の目安（単語の高さの中央値の半分）以内なら同じ行。行の中は左から右。
 * 返す rows[i].words は { text, x0, y0, x1, y1 } を左から並べたもの。lineH は単語の高さの中央値。
 */
export function layoutRows(words) {
  const items = gatherItems(words);
  if (!items.length) return { rows: [], lineH: 0 };
  const lineH = median(items.map((i) => i.h));
  items.sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.cy - row.cy) <= lineH * 0.5) {
      row.words.push(it);
      row.cy = row.words.reduce((s, i) => s + i.cy, 0) / row.words.length;
    } else {
      rows.push({ cy: it.cy, words: [it] });
    }
  }
  for (const row of rows) row.words.sort((a, b) => a.x0 - b.x0);
  return { rows, lineH };
}

/**
 * 1行の文字。隣との隙間が広ければ空白1つ、とても広ければ空白2つ（品名と値段の間）にする。
 */
export function rowText(row, lineH) {
  const sorted = row.words;
  let line = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x0 - sorted[i - 1].x1;
    if (gap > lineH * 3) line += '  ';
    else if (gap > lineH * 0.25) line += ' ';
    line += sorted[i].text;
  }
  return line;
}

/** 単語から行の文字だけを作る。 */
export function linesFromWords(words) {
  const { rows, lineH } = layoutRows(words);
  return rows.map((row) => rowText(row, lineH));
}

const PRICE_WORD = /^[¥￥\\YyVvWwΨ羊半\-−~]{0,3}[0-9OoIl|,.、，ー\s]{1,10}円?$/;

function isPriceish(word) {
  const text = word.text.normalize('NFKC');
  return /[0-9¥\\円]/.test(text) && PRICE_WORD.test(text);
}

/**
 * 値段が右端にそろっている位置（値段らしい右端の単語の x1 の中央値）。2行未満なら null。
 */
export function priceColumnEdge(rows) {
  const edges = [];
  for (const row of rows || []) {
    const last = row.words[row.words.length - 1];
    if (last && isPriceish(last)) edges.push(last.x1);
  }
  return edges.length >= 2 ? median(edges) : null;
}

function isFragment(word) {
  const text = word.text;
  return text.length === 1 || (text.length <= 3 && !/[\u3040-\u30FF\u3400-\u9FFF]/.test(text));
}

/**
 * 行の右端の値段の範囲 { start, end }（rows[i].words の添字、end を含む）。なければ null。
 * 右端の単語が値段らしい形、または値段の列（edge）の右端にそろって数字か「¥」に似た字を含む短い単語なら値段。
 * 値段が「\」「2」「っ」「8」のように何語かに割れて読まれたときは、隣と詰まっている短い断片を左へたどってまとめる。
 */
export function priceSpan(row, edge = null, lineH = 0) {
  const words = row?.words || [];
  const end = words.length - 1;
  if (end < 0) return null;
  const word = words[end];
  const text = word.text.normalize('NFKC');
  const aligned = edge != null && word.x1 >= edge - lineH * 2 && text.length <= 10 && /[0-9¥\\]/.test(text);
  if (!isPriceish(word) && !aligned) return null;
  let start = end;
  while (start > 0 && words[start].x0 - words[start - 1].x1 <= lineH * 0.6 && isFragment(words[start - 1])) start -= 1;
  return { start, end };
}

/** span の単語を、位置を合わせた1語（text はその文字）に置き換える。row.words を直接書き換える。 */
export function replaceSpan(row, span, text) {
  const part = row.words.slice(span.start, span.end + 1);
  const merged = {
    text,
    x0: Math.min(...part.map((w) => w.x0)),
    y0: Math.min(...part.map((w) => w.y0)),
    x1: Math.max(...part.map((w) => w.x1)),
    y1: Math.max(...part.map((w) => w.y1)),
  };
  merged.cy = (merged.y0 + merged.y1) / 2;
  merged.h = merged.y1 - merged.y0;
  row.words.splice(span.start, span.end - span.start + 1, merged);
}

/** 単語から行を作り、日本語の字のあいだの空白を詰めて、改行でつないだ文字にする。単語が無ければ空。 */
export function textFromWords(words) {
  return linesFromWords(words).map(joinCjkSpaces).join('\n');
}
