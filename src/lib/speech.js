import { categorize } from './categorize.js';

/**
 * 音声認識の結果を品名に分ける。
 * 、 , ， スペース で区切り、「と」は控えめに: 「と」の左側が辞書にある品名のときだけ区切る
 * （「とうふ」「トマト」「ポテトサラダ」などを壊さないため）。
 */
export function parseSpoken(text) {
  const parts = String(text ?? '').normalize('NFKC').split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) splitTo(p, out);
  return out;
}

function splitTo(seg, out) {
  for (let i = 1; i < seg.length - 1; i++) {
    if (seg[i] !== 'と') continue;
    const left = seg.slice(0, i);
    if (categorize(left) !== 'その他') {
      out.push(left);
      splitTo(seg.slice(i + 1), out);
      return;
    }
  }
  if (seg) out.push(seg);
}

export function speechSupported(win = globalThis) {
  return !!(win && (win.SpeechRecognition || win.webkitSpeechRecognition));
}

/** 1回だけ聞き取る。onResult(text) / onEnd(errorOrNull)。停止用の関数を返す。 */
export function listen({ onResult, onEnd }, win = globalThis) {
  const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!SR) { onEnd?.('unsupported'); return () => {}; }
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let err = null;
  rec.onresult = (e) => {
    const t = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ');
    if (t.trim()) onResult(t);
  };
  rec.onerror = (e) => { err = e.error || 'error'; };
  rec.onend = () => onEnd?.(err);
  try { rec.start(); } catch { onEnd?.('error'); }
  return () => { try { rec.stop(); } catch { /* 無視 */ } };
}
