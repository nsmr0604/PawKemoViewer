// アプリ版の表示用。
// パッケージのバージョンは `x.y.z`(リリース) / `x.y.z+<コミット数>`(開発) で、
// アプリ上では短い commit (SHA) を併記する。
// commit は VITE_BUILD_COMMIT (CI は github.sha / ローカルは git rev-parse) から取得する。
const RAW_COMMIT: string = import.meta.env.VITE_BUILD_COMMIT ?? ""
const COMMIT = /^[0-9a-f]{7,40}$/i.test(RAW_COMMIT) ? RAW_COMMIT.slice(0, 7) : ""

export function displayAppVersion(version: string): string {
  return COMMIT ? `${version} (${COMMIT})` : version
}
