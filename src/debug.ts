import { invoke } from "@tauri-apps/api/core"

// ---------------------------------------------------------------------------
// デバッグ診断コードのビルド時注入フラグ
//
// デバッグ用の診断コード (backup JSON ダンプ・詳細通信ログ等) は
// **ビルド時のフラグで注入**し、リリースビルドではコード自体を分離する。
//
// - フロントエンド: VITE_DEBUG_DIAG=1 を付けたビルドのみ有効
//   - 開発サーバ (`npm run dev`): `.env.development` で自動有効
//   - テスト用ビルド: `VITE_DEBUG_DIAG=1 npm run build` (または CI の
//     workflow_dispatch input `release=false` = 既定のデバッグビルド)
//   - リリースビルド: フラグ無し → 定数 false に畳まれ、
//     `if (DEBUG_DIAG)` 分岐ごとバンドラが排除する
// - Rust 側: cargo feature `debug-diag` (src-tauri/Cargo.toml)。
//   Rust 側診断コマンドは `#[cfg(feature = "debug-diag")]` で注入し、
//   リリースビルドではコマンド登録自体が行われない
// ---------------------------------------------------------------------------

/** このモジュール自体をデバッグビルド専用の動的チャンクとしてロードする */
/** ログ行を PC 側ファイル (app_data/logs/debug-app.log) へ追記する。
 *  Rust 側 debug_append_log は debug-diag feature のビルドにのみ存在するため、
 *  呼び出しは DEBUG_DIAG ビルドからのみ行う (実装は lib.rs 参照) */
export function debugAppendLog(line: string): void {
  invoke("debug_append_log", { text: line }).catch(() => {
    /* ファイルログ失敗は無視 (リングバッファと UI 表示は生きている) */
  })
}

/** ログフォルダ (app_data/logs) を OS のファイラで開く (PC 向け) */
export async function debugOpenLogFolder(): Promise<string> {
  return invoke<string>("debug_open_log_folder")
}

