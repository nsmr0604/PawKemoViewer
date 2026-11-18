// ---------------------------------------------------------------------------
// デバッグ診断コードのビルド時注入フラグ
//
// デバッグ用の診断コード (backup JSON ダンプ・詳細通信ログ等) は
// **ビルド時のフラグで注入**し、リリースビルドではコード自体を分離する。
//
// - フロントエンド: VITE_DEBUG_DIAG=1 を付けたビルドのみ有効
//   - 開発サーバ (`npm run dev`): `.env.development` で自動有効
//   - テスト用ビルド: `VITE_DEBUG_DIAG=1 npm run build` (または CI の
//     workflow_dispatch input `debug_diag`)
//   - リリースビルド: フラグ無し → 定数 false に畳まれ、
//     `if (DEBUG_DIAG)` 分岐ごとバンドラが排除する
// - Rust 側: cargo feature `debug-diag` (src-tauri/Cargo.toml)。
//   Rust 側診断コードは `#[cfg(feature = "debug-diag")]` で注入する
// ---------------------------------------------------------------------------

/** ビルド時に注入されるデバッグ診断フラグ (リリースビルドでは false 定数) */
export const DEBUG_DIAG = import.meta.env.VITE_DEBUG_DIAG === "1"
