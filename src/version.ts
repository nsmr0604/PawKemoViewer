// アプリ版の表示用。バージョン番号 (tauri.conf.json) は変えず、
// デバッグビルドのみビルドした commit (short SHA) を `x.y.z(commit)` として併記する。
// VITE_BUILD_REV が数字のときがデバッグビルド (正式リリースは 'release')。
// commit は VITE_BUILD_COMMIT (CI は github.sha / ローカルは git rev-parse) から取得する。
const RAW_REV: string = import.meta.env.VITE_BUILD_REV ?? ""
const RAW_COMMIT: string = import.meta.env.VITE_BUILD_COMMIT ?? ""
const IS_DEBUG = /^\d+$/.test(RAW_REV)
const COMMIT = /^[0-9a-f]{7,40}$/i.test(RAW_COMMIT) ? RAW_COMMIT.slice(0, 7) : ""

export function displayAppVersion(version: string): string {
  return IS_DEBUG && COMMIT ? `${version}(${COMMIT})` : version
}
