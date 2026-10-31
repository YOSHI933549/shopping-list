import { categorize } from './categorize.js';
import { normalize } from './categorize.js';

// 線画アイコン（viewBox 32、stroke のみ）。すべてオリジナル。
export const ICONS = {
  // UI（モック由来）
  mic: '<rect x="12" y="4" width="8" height="15" rx="4"/><path d="M8 15a8 8 0 0 0 16 0M16 23v5M12 28h8"/>',
  pencil: '<path d="M6 26l2-7L21 6l5 5-13 13z"/><path d="M18 9l5 5"/>',
  repeat: '<path d="M7 12a9 9 0 0 1 16-3l2 2M25 6v5h-5M25 20a9 9 0 0 1-16 3l-2-2M7 26v-5h5"/>',
  list: '<rect x="6" y="4" width="20" height="24" rx="2"/><path d="M11 11h10M11 16h10M11 21h6"/>',
  person: '<circle cx="16" cy="11" r="5"/><path d="M6 28c1-6 5-9 10-9s9 3 10 9"/>',
  check: '<path d="M8 16l5 5 11-11"/>',
  close: '<path d="M9 9l14 14M23 9L9 23"/>',
  plus: '<path d="M16 7v18M7 16h18"/>',
  trash: '<path d="M7 9h18M13 9V6h6v3M9 9l1 18h12l1-18M14 14v9M18 14v9"/>',
  up: '<path d="M8 20l8-9 8 9"/>',
  down: '<path d="M8 12l8 9 8-9"/>',
  // 食品
  cabbage: '<path d="M5 17c0-7 5-11 11-11s11 4 11 11-5 10-11 10S5 24 5 17z"/><path d="M16 27c-4-5-4-13 0-17M16 27c4-5 4-13 0-17M8 12c3 1 6 4 8 8M24 12c-3 1-6 4-8 8"/>',
  carrot: '<path d="M22 10c3 3 3 7-1 12l-9 6c-2 1-4-1-3-3l6-9c4-5 7-6 7-6z"/><path d="M19 13l-3 2M17 18l-3 2M22 10c1-3 3-5 6-5M22 10c-1-3-3-5-6-5M22 10c3-1 5 0 6 2"/>',
  onion: '<path d="M16 8c-6 3-10 8-10 13 0 4 4 7 10 7s10-3 10-7c0-5-4-10-10-13z"/><path d="M16 8c-3 5-3 15 0 20M16 8c3 5 3 15 0 20M16 8V3M16 5c-2-1-3-1-4 0"/>',
  tomato: '<circle cx="16" cy="18" r="10"/><path d="M10 11c2 0 4 1 6 0 2 1 4 0 6 0M16 11V6M16 8l-3 1M16 8l3 1"/>',
  apple: '<path d="M16 10c-6-3-11 1-10 8s5 10 10 8c5 2 9-1 10-8s-4-11-10-8z"/><path d="M16 10c0-3 2-5 4-6"/>',
  banana: '<path d="M6 8c1 10 8 18 20 17-2 1-4 2-7 2C10 27 4 18 6 8z"/><path d="M6 8l3-2c1 8 6 14 15 16l2 3M9 6l-1-2"/>',
  citrus: '<circle cx="16" cy="17" r="10"/><path d="M16 7v20M6 17h20M9 10l14 14M23 10L9 24"/>',
  strawberry: '<path d="M6 12c2-3 7-3 10-1 3-2 8-2 10 1-1 8-5 15-10 17-5-2-9-9-10-17z"/><path d="M13 5l3 4 3-4M12 15h.5M17 16h.5M14 21h.5M19 21h.5M16 25h.5"/>',
  grape: '<circle cx="12" cy="14" r="3.5"/><circle cx="20" cy="14" r="3.5"/><circle cx="16" cy="20" r="3.5"/><circle cx="16" cy="27" r="0.5"/><path d="M16 10V4c2 0 4 1 6 3"/>',
  mushroom: '<path d="M5 16c0-6 5-10 11-10s11 4 11 10z"/><path d="M13 16v8c0 2 1 4 3 4s3-2 3-4v-8"/>',
  enoki: '<path d="M11 28c0-6-1-14-2-18M16 28V9M21 28c0-6 1-14 2-18"/><ellipse cx="9" cy="8" rx="2.2" ry="1.6"/><ellipse cx="16" cy="7" rx="2.2" ry="1.6"/><ellipse cx="23" cy="8" rx="2.2" ry="1.6"/><path d="M8 24h16"/>',
  potato: '<path d="M7 15c0-5 6-8 12-7s8 6 6 11-8 8-13 6-5-6-5-10z"/><path d="M12 14h.5M18 13h.5M16 19h.5M21 18h.5M12 21h.5"/>',
  eggplant: '<path d="M6 25c-2-4 0-8 4-10 5-2 8-5 10-9 3 1 6 4 5 8-1 5-5 9-9 11-4 2-8 2-10 0z"/><path d="M21 6c0-2 2-3 4-3M22 7l3 3"/>',
  greens: '<path d="M16 28V12M16 20c-4 0-8-3-9-9 6 0 9 3 9 9zM16 16c4 0 8-3 9-9-6 0-9 3-9 9z"/>',
  corn: '<path d="M16 4c4 4 6 10 5 17l-5 7-5-7C10 14 12 8 16 4z"/><path d="M11 12h10M10 17h12M16 4v24"/>',
  // 肉・魚・卵・乳
  meat: '<path d="M7 20c-3-6 2-13 9-13s12 5 10 11-9 8-13 7-5-3-6-5z"/><path d="M12 15c2-2 6-2 8 0"/><circle cx="20" cy="19" r="2"/>',
  chicken: '<path d="M20 5c4 0 7 3 7 6s-3 6-7 6c-2 0-3-1-5-1l-7 7c-1 1-3 1-4 0s-1-3 0-4l7-7c0-2-1-3-1-5 0-3 3-6 7-6z"/>',
  sausage: '<path d="M7 22c-3-3-3-6 0-9l6-6c3-3 6-3 9 0l3 3c3 3 3 6 0 9l-6 6c-3 3-6 3-9 0z"/><path d="M12 12l8 8M10 22l-3 3M22 10l3-3"/>',
  fish: '<path d="M4 16c4-6 10-8 16-5l6-4v18l-6-4c-6 3-12 1-16-5z"/><circle cx="10" cy="15" r="1"/><path d="M15 12c2 3 2 5 0 8"/>',
  shrimp: '<path d="M22 6c4 2 5 7 2 11-2 4-7 7-12 8l-4-3c4 0 7-2 8-5 0-4 2-7 6-11z"/><path d="M8 25l-3 2M13 22l-2 4M18 18l-1 4M24 8l3-1"/>',
  egg: '<path d="M16 4c-6 0-10 9-10 15 0 5 4 9 10 9s10-4 10-9c0-6-4-15-10-15z"/><path d="M11 20c0 3 2 5 5 5"/>',
  milk: '<path d="M11 4h10l1 6 3 4v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V14l3-4z"/><path d="M10 10h12M7 17h18"/>',
  cheese: '<path d="M4 14l12-8 12 8v10H4z"/><path d="M4 14h24"/><circle cx="11" cy="19" r="1.8"/><circle cx="20" cy="20" r="2.4"/>',
  tofu: '<path d="M6 13l10-5 10 5v10l-10 5-10-5z"/><path d="M6 13l10 5 10-5M16 18v10"/>',
  natto: '<path d="M5 14h22v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M5 14l3-6h16l3 6M11 19h.5M16 21h.5M21 19h.5M13 24h.5M19 24h.5"/>',
  // パン・米・麺
  bread: '<path d="M6 12c0-4 4-6 10-6s10 2 10 6c0 2-1 3-2 3v11a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V15c-1 0-2-1-2-3z"/><path d="M13 12h6"/>',
  rice: '<path d="M5 15h22c0 8-4 13-11 13S5 23 5 15z"/><path d="M8 15c0-5 3-8 8-8s8 3 8 8"/><path d="M12 11h.5M16 9h.5M20 11h.5M14 13h.5M18 13h.5"/>',
  noodle: '<path d="M5 15h22c0 8-4 13-11 13S5 23 5 15z"/><path d="M9 15c1-4 3-7 2-11M15 15c1-4 3-7 2-11M21 15c1-4 3-7 2-11"/>',
  flour: '<path d="M8 8h16l2 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V12z"/><path d="M6 12h20M12 18h8M12 22h8"/>',
  // 調味料・缶・乾物
  seasoning: '<path d="M12 4h8v4h-8z"/><path d="M11 8h10v3l2 3v12a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V14l2-3z"/><path d="M9 18h14M9 23h14"/>',
  can: '<ellipse cx="16" cy="8" rx="9" ry="3"/><path d="M7 8v16c0 2 4 4 9 4s9-2 9-4V8"/><path d="M7 14c0 2 4 4 9 4s9-2 9-4"/>',
  seaweed: '<path d="M6 6h20v20H6z"/><path d="M6 12h20M6 19h20M13 6v20"/>',
  dried: '<path d="M8 6c4 2 8 2 16 0M9 12c4 2 7 2 14 0M8 18c4 2 8 2 16 0M10 24c3 1 6 1 12 0"/>',
  // お菓子・飲料・酒・冷凍
  snack: '<path d="M6 6h20l-2 22H8z"/><path d="M6 6l2-2h16l2 2M11 14c2-2 4-2 5 0s3 2 5 0M11 20c2-2 4-2 5 0s3 2 5 0"/>',
  candy: '<circle cx="16" cy="16" r="6"/><path d="M10 16L3 11v10zM22 16l7-5v10z"/>',
  icecream: '<path d="M9 14a7 7 0 0 1 14 0z"/><path d="M9 14l7 15 7-15"/><path d="M12 14l4 8 4-8"/>',
  drink: '<path d="M8 8h16l-2 20H10z"/><path d="M10 14h12M17 8l3-5h4"/>',
  tea: '<path d="M5 12h18v7a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"/><path d="M23 14h2a3 3 0 0 1 0 6h-2M10 5c1 2-1 3 0 5M15 5c1 2-1 3 0 5"/>',
  water: '<path d="M16 4c5 7 8 11 8 16a8 8 0 0 1-16 0c0-5 3-9 8-16z"/><path d="M12 21c0 2 2 4 4 4"/>',
  beer: '<path d="M7 9h14v17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M21 12h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3M7 9c0-3 3-4 5-3 2-2 6-1 6 2M12 14v9M16 14v9"/>',
  wine: '<path d="M9 4h14c0 8-2 13-7 13S9 12 9 4z"/><path d="M16 17v10M10 28h12M9.5 10h13"/>',
  frozen: '<path d="M16 3v26M5 9.5l22 13M5 22.5l22-13M12 5l4 3 4-3M12 27l4-3 4 3"/>',
  // 日用品・薬・ベビー・ペット
  bottle: '<path d="M12 4h8v4h-8zM11 8h10l2 5v14a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V13z"/><path d="M13 17c2 2 4 2 6 0"/>',
  brush: '<path d="M6 26L22 10"/><rect x="20" y="3" width="6" height="10" rx="1.5" transform="rotate(45 23 8)"/><path d="M21 5l-2-2M24 4l-1-2M26 7l2-1"/>',
  tissue: '<path d="M5 14h22v13H5z"/><path d="M12 14c0-4 2-8 4-9 2 1 4 5 4 9M10 20h12"/>',
  toiletpaper: '<ellipse cx="12" cy="12" rx="7" ry="8"/><path d="M12 4h12v16H12"/><ellipse cx="12" cy="12" rx="2.5" ry="3"/><path d="M12 20c3 0 6 2 6 6h8"/>',
  sponge: '<path d="M5 12l4-4h16l2 4v10l-4 4H8l-3-4z"/><path d="M5 12h22M11 17h.5M16 19h.5M21 17h.5M13 22h.5M19 22h.5"/>',
  battery: '<rect x="6" y="10" width="18" height="12" rx="2"/><path d="M24 14h3v4h-3M12 13v6M10 16h4"/>',
  soap: '<path d="M10 13h12v13a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z"/><path d="M13 13V7h5l3-2M18 7h3"/>',
  pill: '<rect x="4" y="11" width="24" height="10" rx="5" transform="rotate(-35 16 16)"/><path d="M12 9l10 14"/>',
  bandage: '<rect x="3" y="11" width="26" height="10" rx="5" transform="rotate(-35 16 16)"/><path d="M13 13l6 6M12 17l-1 .5M20 15l1-.5"/>',
  mask: '<path d="M6 10c6 2 14 2 20 0v9c0 4-5 7-10 7S6 23 6 19z"/><path d="M6 12H3M26 12h3M10 15h12M10 19h12"/>',
  diaper: '<path d="M4 9h24v7c0 5-4 9-7 9l-5-4-5 4c-3 0-7-4-7-9z"/><path d="M4 9c4 2 20 2 24 0"/>',
  paw: '<circle cx="9" cy="12" r="2.5"/><circle cx="15" cy="7" r="2.5"/><circle cx="22" cy="9" r="2.5"/><circle cx="26" cy="15" r="2.3"/><path d="M10 24c0-5 4-9 7-9s7 4 6 8c-1 3-4 3-6 2-2 1-5 2-7-1z"/>',
  box: '<path d="M5 10l11-5 11 5v13l-11 5-11-5z"/><path d="M5 10l11 5 11-5M16 15v13"/>',
};

// 品名 → 個別アイコン（正規化済みの部分一致、長いものを優先）
const NAME_ICONS = [
  ['cabbage', 'キャベツ 白菜 レタス サラダ菜'], ['carrot', '人参 にんじん 大根 ごぼう'], ['onion', '玉ねぎ 玉葱 たまねぎ ねぎ にんにく 長ねぎ'],
  ['tomato', 'トマト パプリカ ピーマン'], ['apple', 'りんご 林檎 梨 桃 柿'], ['banana', 'バナナ'], ['citrus', 'みかん オレンジ レモン グレープフルーツ ゆず'],
  ['strawberry', 'いちご 苺'], ['grape', 'ぶどう 葡萄 ブルーベリー さくらんぼ'], ['mushroom', 'しいたけ 椎茸 しめじ エリンギ まいたけ マッシュルーム'], ['enoki', 'えのき'],
  ['potato', 'じゃがいも さつまいも さといも 里芋 長芋 山芋'], ['eggplant', 'なす 茄子 ズッキーニ きゅうり'], ['greens', 'ほうれん草 小松菜 水菜 ブロッコリー ニラ 春菊 もやし チンゲン菜'], ['corn', 'とうもろこし コーン'],
  ['chicken', '鶏 とり肉 手羽 ささみ から揚げ 唐揚げ チキン'], ['sausage', 'ソーセージ ウインナー ベーコン ハム'], ['meat', '肉 豚 牛 ひき肉 ステーキ ハンバーグ'],
  ['shrimp', 'えび 海老 いか たこ ほたて 帆立 かに'], ['fish', '魚 鮭 さけ さば 鯖 あじ いわし さんま ぶり まぐろ たら 刺身 しらす'],
  ['egg', '卵 たまご 玉子'], ['milk', '牛乳 ミルク 豆乳 ヨーグルト 生クリーム'], ['cheese', 'チーズ バター'],
  ['tofu', '豆腐 厚揚げ 油揚げ'], ['natto', '納豆'],
  ['bread', 'パン トースト ベーグル'], ['rice', '米 ごはん ご飯 おにぎり'], ['noodle', 'うどん そば ラーメン パスタ そうめん スパゲッティ 麺'], ['flour', '小麦粉 片栗粉 薄力粉 強力粉'],
  ['seasoning', '醤油 しょうゆ 味噌 みそ 酢 みりん 塩 砂糖 ソース ケチャップ マヨネーズ ドレッシング'], ['can', '缶'], ['seaweed', 'のり 海苔'], ['dried', 'わかめ ひじき 昆布 かつお節'],
  ['icecream', 'アイス'], ['candy', 'あめ 飴 キャンディ グミ ガム チョコ'], ['snack', 'スナック ポテチ ポテトチップス クッキー せんべい'],
  ['tea', 'お茶 緑茶 麦茶 紅茶 コーヒー ココア'], ['water', '水 炭酸水 ミネラルウォーター'], ['drink', 'ジュース コーラ サイダー'], ['beer', 'ビール 発泡酒 チューハイ ハイボール'], ['wine', 'ワイン 日本酒 焼酎 ウイスキー'],
  ['tissue', 'ティッシュ'], ['toiletpaper', 'トイレットペーパー'], ['sponge', 'スポンジ たわし'], ['battery', '電池'], ['soap', '石鹸 せっけん ハンドソープ ボディソープ シャンプー'],
  ['brush', '歯ブラシ'], ['bottle', '柔軟剤 洗剤 漂白剤'], ['pill', '薬 風邪薬 頭痛薬 胃腸薬 サプリ ビタミン'], ['bandage', '絆創膏 ばんそうこう'], ['mask', 'マスク'],
  ['diaper', 'おむつ オムツ おしりふき'], ['paw', 'キャットフード ドッグフード 猫砂 ペット'],
].flatMap(([icon, words]) => words.split(' ').map((w) => [normalize(w), icon]))
  .sort((a, b) => b[0].length - a[0].length);

// 売り場ごとの代表アイコン
export const AISLE_ICONS = {
  '野菜・果物': 'greens', '肉': 'meat', '魚': 'fish', '豆腐・納豆': 'tofu', '乳製品・卵': 'milk', 'パン': 'bread', '米・麺・粉': 'rice',
  '調味料': 'seasoning', '缶詰・乾物': 'can', 'お菓子': 'snack', '飲料': 'drink', 'お酒': 'beer', '冷凍食品': 'frozen',
  '日用品・洗剤': 'bottle', '薬・衛生用品': 'pill', 'ベビー・ペット': 'paw', 'その他': 'box',
};

export function iconNameFor(name) {
  const n = normalize(name);
  if (n) {
    const exact = NAME_ICONS.find(([w]) => w === n);
    if (exact) return exact[1];
    const hit = NAME_ICONS.find(([w]) => (w.length === 1 ? n.startsWith(w) || n.endsWith(w) : n.includes(w)));
    if (hit) return hit[1];
  }
  return AISLE_ICONS[categorize(name)] || 'box';
}

export function icon(key, size = 30, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">${ICONS[key] || ICONS.box}</svg>`;
}

export function itemIcon(name, size = 30, cls = 'ic') {
  return icon(iconNameFor(name), size, cls);
}
