import { esc } from './util.js';

function clampPercent(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** 「レシートを読む」の入口に足すボタン。既存の貼る欄はその下に残す。 */
export function scanEntryHtml() {
  return `<div class="scan-entry">
<label class="scan-b">撮って読む
<input id="receipt-camera" class="scan-file" type="file" accept="image/*" capture="environment" aria-label="撮って読む" data-testid="receipt-camera">
</label>
<label class="scan-photo">写真から選ぶ
<input id="receipt-photo" class="scan-file" type="file" accept="image/*" aria-label="写真から選ぶ" data-testid="receipt-photo">
</label>
</div>
<div id="scan-status"></div>`;
}

/** 読み取り中と、失敗したときの表示。idle のときは空。 */
export function scanStatusHtml(view) {
  if (!view || view.phase === 'idle') return '';
  if (view.phase === 'failed') {
    return `<div class="scan-status" data-testid="scan-failed" role="status"><p>読み取れませんでした。もう一度撮るか、文字を貼ってください。</p>
<div class="scan-acts"><button type="button" class="scan-again" data-action="receipt-scan-again">もう一度撮る</button>
<button type="button" class="scan-paste" data-action="receipt-scan-paste">文字を貼る</button></div></div>`;
  }
  const percent = clampPercent(view.percent);
  const width = percent == null ? 0 : percent;
  const pct = percent == null ? '' : `${percent}%`;
  return `<div class="scan-status" data-testid="scan-progress" role="status"><p class="scan-label">${esc(view.label || '読み取っています')}</p>
<div class="scan-bar" aria-hidden="true"><span style="width:${width}%"></span></div>
<p class="scan-pct">${pct}</p></div>`;
}
