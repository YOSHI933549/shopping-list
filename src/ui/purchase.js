import { icon } from '../lib/icons.js';
import {
  PERIODS, formatMark, formatPurchaseDate, itemHistory, purchaseView,
} from '../lib/purchaseView.js';
import { esc } from './util.js';

function money(price) {
  if (price == null) return '<span class="hnow none" data-testid="purchase-noprice">—</span>';
  return `<span class="hnow">${esc(formatMark(price))}</span>`;
}

function missingNote(n) {
  return n > 0 ? `<span class="hist-miss">※値段なし${n}件</span>` : '';
}

function totalBits(total, missing) {
  const label = total == null ? '—' : formatMark(total);
  return `<span class="hist-sum-num">合計 ${esc(label)}${missingNote(missing)}</span>`;
}

function summaryHtml(view) {
  return `<span class="hist-cond" data-testid="history-condition">${esc(view.condition)}</span>${totalBits(view.total, view.missing)}`;
}

function priceColumn(price, previous) {
  const prev = previous == null ? '' : `<span class="hprev" data-testid="purchase-prev">前回${esc(formatMark(previous))}</span>`;
  return `<span class="hprices">${money(price)}${prev}</span>`;
}

function dayHtml(day) {
  const rows = day.items.map((item) => (
    `<button type="button" class="hitem" data-testid="purchase-row" data-action="open-purchase" data-id="${esc(item.key)}">` +
    `<span class="hmain"><span class="hname">${esc(item.name)}</span><span class="hmeta">${esc(item.storeName)}</span></span>` +
    `${priceColumn(item.price, item.previous)}</button>`
  )).join('');
  return `<section class="card hday" data-testid="purchase-day" data-date="${esc(day.date || '')}">` +
    `<div class="hday-head"><div class="hday-side"><div class="hday-date">${esc(day.heading)}</div>` +
    `<div class="hday-stores">${esc(day.storesLabel)}</div></div>` +
    `<div class="hday-total" data-testid="purchase-day-total">${totalBits(day.total, day.missing)}</div></div>` +
    rows + '</section>';
}

function emptyHtml(kind) {
  if (kind === 'none') {
    return `<div class="empty" data-testid="history-empty">${icon('list', 56)}<b>購入履歴はまだありません</b><p>買い物リストで丸を押すと、買った品がここに残ります。<br>レシートを保存した品も入ります。</p></div>`;
  }
  return `<div class="empty" data-testid="history-filtered-empty"><b>この条件では見つかりません</b><p>お店・期間・品名の条件に合う購入がありません。</p><button type="button" class="btn" data-action="hist-reset" data-testid="history-reset">条件を外す</button></div>`;
}

function pills(items, current, action, testid) {
  const buttons = items.map((item) => {
    const on = item.id === current;
    return `<button type="button" class="pill${on ? ' on' : ''}" aria-pressed="${on ? 'true' : 'false'}" data-action="${action}" data-id="${esc(item.id)}">${esc(item.name)}</button>`;
  }).join('');
  return `<div class="pills" data-testid="${testid}">${buttons}</div>`;
}

function screen(title, backLabel, body, bar = '') {
  return `<div class="purchase" data-testid="purchase-view"><header class="hist-top"><div class="hist-title"><h1>${title}</h1>` +
    `<button type="button" class="btn-ghost" data-action="close-history">${esc(backLabel)}</button></div></header>${bar}${body}</div>`;
}

function listBody(view) {
  const bar = `<div class="hist-bar" data-testid="history-filters"><div class="hist-line"><span class="hist-k">期間</span>${pills(PERIODS, view.period, 'hist-period', 'history-period')}</div>` +
    `<div class="hist-line"><span class="hist-k">お店</span>${pills(view.choices, view.storeId, 'hist-store', 'history-stores')}</div>` +
    `<label class="hist-search"><input id="history-query" data-testid="history-query" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" placeholder="品名で探す" aria-label="品名で探す" value="${esc(view.query)}"></label>` +
    `<div class="hist-sum" data-testid="history-summary">${summaryHtml(view)}</div></div>`;
  const main = `<main class="plain" data-scroll data-testid="history-body">${view.empty ? emptyHtml(view.empty) : view.days.map(dayHtml).join('')}</main>`;
  return screen('購入履歴', '戻る', main, bar);
}

function detailBody(detail) {
  const stats = detail.stats
    ? `<p class="hist-stats" data-testid="purchase-stats">最安 ${esc(formatMark(detail.stats.min))}（${esc(detail.stats.storeName)}）・平均 ${esc(formatMark(detail.stats.avg))}</p>`
    : '';
  const rows = detail.rows.map((row) => (
    `<div class="hitem" data-testid="purchase-past"><span class="hmain"><span class="hname">${esc(formatPurchaseDate(row.date))}</span>` +
    `<span class="hmeta">${esc(row.storeName)}</span></span><span class="hprices">${money(row.price)}</span></div>`
  )).join('');
  const main = `<main class="plain" data-scroll>${stats}<section class="card hday">${rows}</section></main>`;
  return screen(esc(detail.name), '戻る', main);
}

export function renderPurchases(state, ui, now = new Date()) {
  const stores = state?.stores || [];
  const history = state?.history;
  if (ui.purchaseItem) {
    const detail = itemHistory(history, stores, ui.purchaseItem);
    if (detail) return detailBody(detail);
  }
  const view = purchaseView(history, stores, {
    storeId: ui.purchaseStore || 'all',
    period: ui.purchasePeriod || 'all',
    query: ui.purchaseQuery || '',
    now,
  });
  return listBody(view);
}
