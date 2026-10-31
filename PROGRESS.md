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

## 2026-10-31 リポジトリ取り込み
- `main` は README 1行（`# shopping-list`）の初期コミットのまま。v1 は別ブランチ。
- この環境で再実行: `npm run check` 114件 OK、`npm run build` OK、`npm run e2e` 18ステップ OK。辞書・画面の挙動は変えていない。
- `.github/workflows/pages.yml` を追加。`base: './'` のまま（`/shopping-list/` では相対パスが解決する）。
- Pages の Source を GitHub Actions にする操作は未実施（オーナー作業）。
