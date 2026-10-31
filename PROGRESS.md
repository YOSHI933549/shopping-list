# PROGRESS

- 2026-10-31 15:40 JST: フォルダ作成・git init・BRIEF.md 作成。Claude Code (sonnet) に実装を依頼。
- 2026-10-31 マイルストーン1: Vite 構成、売り場辞書(`src/data/aisles.js`)と分類(`src/lib/categorize.js`)、状態管理(`src/state/store.js`)、アイコン、音声パース、各テスト。
- 2026-10-31 マイルストーン2: UI 一式（買い物リスト／入力シート／今日買ったもの／定期購入品／マイページ）、e2e(18ステップ)、shots(01〜07 + 確認用 08〜10)。README.md / AGENTS.md 作成。
- 検証結果: `npm run check` 112 tests OK / `npm run build` OK / `npm run e2e` OK / `npm run shots` OK。shots は全画像を目視確認済み（重なり・文字切れ・豆腐文字なし）。

## 既知の未対応
- 音声入力は実機のマイク/ブラウザ依存のため自動テスト対象外（パース処理のみテスト）。
- 実機(iOS Safari)での確認・ソフトキーボード表示時のシート位置は未確認。
- タブ切り替え時にスクロール位置が引き継がれる。

## 再開のしかた
`npm install` → `npm run check` → `npm run dev`。UI を触ったら `npm run shots` で目視。

## 2026-10-31 16:15 JST レビュー（開発係）
- check 112→114件・build・e2e 18ステップ・shots 10枚を自分で再実行し全部通過。画像を目視し重なり・文字切れ・豆腐文字なし。
- 辞書に「しゃけ」を追加（テストも追加）。
- 未 push・リモートなし。次: よしぞうさんの確認 → GitHub リポジトリ作成と Pages 公開は承認後。

## 2026-10-31 値段メモ欄の追加
- 追加: `src/lib/price.js`（parsePrice / formatYen / priceKey）、store に `priceBook`（キー=storeId+NUL+正規化した品名）、`setItemPrice` / `recordPrice` / `lastPrice`。品物に `price`（整数 or null）。
- 記録のタイミングは「購入（チェック）時」（追加しただけでは記録しない。「前回」と「今回」が同時に同じ値になるのを避けるため）。値段編集は行の品名タップ→編集シート。
- 互換: STORAGE_KEY・VERSION は据え置き。読み込み時(validateState)に priceBook 無し→空で補い、items 等は消さない。お店削除時はそのお店の priceBook も削除。
- 結果: `npm run check` 147 tests OK（+33）/ `npm run build` OK / `npm run e2e` 27 steps OK（+9）/ `npm run shots` 13枚。11-price・12-price-aisle-sheet・13-price-edit-sheet を目視確認（重なり・文字切れ・豆腐文字なし。長い名前＋値段も折り返して収まる）。
- 未 commit / 未 push。
