// アプリ版の表示用。バージョン番号 (tauri.conf.json) は変えず、
// デバッグビルドのみ CI の run_number を `rev.<番号>` として併記する。
// リリースは VITE_BUILD_REV=release (数字でない) のため併記しない。
const RAW_REV: string = import.meta.env.VITE_BUILD_REV ?? ""
const BUILD_REV = /^\d+$/.test(RAW_REV) ? RAW_REV : ""

export function displayAppVersion(version: string): string {
  return BUILD_REV ? `${version} (rev.${BUILD_REV})` : version
}
