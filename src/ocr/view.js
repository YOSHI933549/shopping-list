// 読み取り中と失敗の表示。既存の貼る欄はそのまま残す。

/** phase: idle / run / fail。root は貼るシートの親。 */
export function applyScanView(root, view) {
  const box = root?.querySelector?.('[data-testid="receipt-scan"]');
  if (!box) return;
  const phase = view?.phase || 'idle';
  box.hidden = phase === 'idle';
  const msg = box.querySelector('[data-testid="receipt-scan-status"]');
  if (msg) msg.textContent = phase === 'idle' ? '' : (view?.message || '');
  const track = box.querySelector('[data-testid="receipt-scan-track"]');
  const bar = box.querySelector('[data-testid="receipt-scan-bar"]');
  const actions = box.querySelector('[data-testid="receipt-scan-actions"]');
  if (track) track.hidden = phase !== 'run';
  if (bar) {
    const n = Number(view?.progress);
    const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 100))) : 0;
    bar.style.width = `${pct}%`;
  }
  if (actions) actions.hidden = phase !== 'fail';
  const shoot = root.querySelector?.('[data-testid="receipt-shoot"]');
  if (shoot) shoot.disabled = phase === 'run';
}
