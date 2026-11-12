import { normalize } from './categorize.js';
import { sanitizeHistory } from './history.js';

// 品物の台帳。別名は店ごとに覚え、あいまいな一致ではまとめない。
// まとめるときは mergedInto を付けるだけで、明細の raw と notation は動かさない。

export function resolveGoods(goods, id) {
  const byId = new Map((goods || []).map((g) => [g.id, g]));
  const seen = new Set();
  let cur = byId.get(id) || null;
  while (cur?.mergedInto && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = byId.get(cur.mergedInto);
    if (!next) break;
    cur = next;
  }
  return cur;
}

/** その店の表記に完全一致する品。まとめた先までたどる。別の店の別名は見ない。 */
export function goodsForAlias(goods, storeId, notation) {
  const key = normalize(notation);
  if (!storeId || !key) return [];
  const hits = [];
  const seen = new Set();
  for (const g of goods || []) {
    if (!g?.aliases?.some((a) => a.storeId === storeId && normalize(a.notation) === key)) continue;
    const resolved = resolveGoods(goods, g.id);
    if (!resolved || seen.has(resolved.id)) continue;
    seen.add(resolved.id);
    hits.push(resolved);
  }
  return hits;
}

/** 共通する一番長い文字列の長さ。完全に含まれる場合も含む。 */
export function overlapLength(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x.includes(y)) return y.length;
  if (y.includes(x)) return x.length;
  let best = 0;
  const limit = Math.min(x.length, 80);
  const limitY = Math.min(y.length, 80);
  for (let i = 0; i < limit; i += 1) {
    for (let j = 0; j < limitY; j += 1) {
      let k = 0;
      while (i + k < x.length && j + k < y.length && x[i + k] === y[j + k]) k += 1;
      if (k > best) best = k;
    }
  }
  return best;
}

export function sharesText(a, b) {
  return overlapLength(a, b) >= 2;
}

function aliasOf(storeId, notation) {
  const key = normalize(notation);
  if (!storeId || !key) return null;
  return { storeId, notation: key };
}

function pushAlias(aliases, alias) {
  if (!alias) return aliases;
  if (aliases.some((a) => a.storeId === alias.storeId && a.notation === alias.notation)) return aliases;
  return [...aliases, alias];
}

/** 台帳にない明細を、正規化した品名ごとに一つの品へする。 */
function materialize(history, virtId, makeId) {
  const norm = String(virtId).slice('virt:'.length);
  if (!norm) return null;
  const id = `g_${makeId()}`;
  const matched = [];
  const lines = history.lines.map((line) => {
    const owned = line.goodsId && history.goods.some((g) => g.id === line.goodsId);
    if (owned || normalize(line.name) !== norm) return line;
    matched.push(line);
    return { ...line, goodsId: id };
  });
  if (!matched.length) return null;
  let aliases = [];
  for (const line of matched) aliases = pushAlias(aliases, aliasOf(line.storeId, line.notation));
  const goods = [...history.goods, { id, name: matched[0].name || norm, aliases, mergedInto: null }];
  return { history: { ...history, goods, lines }, id };
}

/**
 * source を target にまとめる。明細の文言は変えない。
 * source が virt: のときは、その品名の明細から台帳の品を作ってからまとめる。
 * 輪になるとき、自分自身のときは、履歴をそのまま返す。
 */
export function mergeGoods(history, sourceId, targetId, makeId) {
  let h = sanitizeHistory(history);
  if (!sourceId || !targetId || sourceId === targetId) return h;
  const idOf = typeof makeId === 'function' ? makeId : () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (String(sourceId).startsWith('virt:')) {
    const made = materialize(h, sourceId, idOf);
    if (!made) return h;
    h = made.history;
    sourceId = made.id;
  }
  if (String(targetId).startsWith('virt:')) {
    const made = materialize(h, targetId, idOf);
    if (!made) return h;
    h = made.history;
    targetId = made.id;
  }
  const source = h.goods.find((g) => g.id === sourceId);
  const target = h.goods.find((g) => g.id === targetId);
  if (!source || !target) return h;
  if (resolveGoods(h.goods, targetId)?.id === sourceId) return h;
  if (source.mergedInto === targetId) return h;
  return {
    ...h,
    goods: h.goods.map((g) => (g.id === sourceId ? { ...g, mergedInto: targetId } : g)),
  };
}

/** まとめを外す。明細と別名はその品に残ったまま、表示は元の品名に戻る。 */
export function splitGoods(history, sourceId) {
  const h = sanitizeHistory(history);
  if (!sourceId) return h;
  return {
    ...h,
    goods: h.goods.map((g) => (g.id === sourceId ? { ...g, mergedInto: null } : g)),
  };
}

/**
 * 保存した行を台帳へ結びつける。同じ店・同じ表記の別名は、今回の品へ移す。
 * rows: { name, notation, storeId, goodsId }
 */
export function assignGoods(history, rows, makeId) {
  const h = sanitizeHistory(history);
  const idOf = typeof makeId === 'function' ? makeId : () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let goods = h.goods.map((g) => ({ ...g, aliases: (g.aliases || []).map((a) => ({ ...a })) }));
  const assigned = [];
  for (const row of rows || []) {
    const name = String(row?.name ?? '').trim();
    const notation = normalize(row?.notation || '');
    const storeId = typeof row?.storeId === 'string' ? row.storeId : '';
    let g = row?.goodsId ? goods.find((x) => x.id === row.goodsId) || null : null;
    if (g?.mergedInto) g = resolveGoods(goods, g.id);
    if (!g && name) g = goods.find((x) => !x.mergedInto && normalize(x.name) === normalize(name)) || null;
    if (!g && name) {
      g = { id: `g_${idOf()}`, name, aliases: [], mergedInto: null };
      goods = [...goods, g];
    }
    if (g && notation && storeId) {
      goods = goods.map((x) => {
        if (x.id === g.id) return x;
        const aliases = x.aliases.filter((a) => !(a.storeId === storeId && a.notation === notation));
        return aliases.length === x.aliases.length ? x : { ...x, aliases };
      });
      g = goods.find((x) => x.id === g.id);
      const aliases = pushAlias(g.aliases, { storeId, notation });
      if (aliases !== g.aliases) {
        g = { ...g, aliases };
        goods = goods.map((x) => (x.id === g.id ? g : x));
      }
    }
    assigned.push({ ...row, goodsId: g ? g.id : null, name: g ? g.name : name });
  }
  return { history: { ...h, goods }, rows: assigned };
}

/** まとめる画面の行。台帳にない明細は virt: として出す。 */
export function productGroups(history) {
  const h = sanitizeHistory(history);
  const byId = new Map(h.goods.map((g) => [g.id, g]));
  const groups = h.goods.map((g) => {
    const resolved = resolveGoods(h.goods, g.id);
    const lines = h.lines.filter((l) => l.goodsId === g.id);
    return {
      id: g.id,
      name: g.name,
      aliases: g.aliases,
      mergedInto: g.mergedInto,
      mergedName: g.mergedInto && resolved && resolved.id !== g.id ? resolved.name : '',
      virtual: false,
      lineCount: lines.length,
      raws: lines.map((l) => l.raw).filter((r) => typeof r === 'string' && r).slice(0, 2),
    };
  });
  const buckets = new Map();
  for (const line of h.lines) {
    if (line.goodsId && byId.has(line.goodsId)) continue;
    const key = normalize(line.name);
    if (!key) continue;
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: `virt:${key}`,
        name: line.name,
        aliases: [],
        mergedInto: null,
        mergedName: '',
        virtual: true,
        lineCount: 0,
        raws: [],
      });
    }
    const bucket = buckets.get(key);
    bucket.lineCount += 1;
    if (bucket.raws.length < 2 && typeof line.raw === 'string' && line.raw) bucket.raws.push(line.raw);
  }
  return [...groups, ...buckets.values()];
}
