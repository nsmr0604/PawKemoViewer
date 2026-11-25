// 開発ビルドのバージョンを `x.y.z+<ビルド番号>` にする。
// ビルド番号は全プラットフォームで同じ値になるよう **git のコミット数** を使う
// (引数で明示することもできる。ローカル確認用)。
// - Tauri は 4 桁 (x.y.z.n) を semver として受け付けない
// - Linux の .deb/.rpm は `-` を許可しない (RPM の Version に使えない)
// そのため semver の build metadata (`+`) を使う。リリースビルドでは実行しない。
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const explicit = process.argv[2]
const buildNumber =
  explicit ?? execSync("git rev-list --count HEAD", { cwd: root }).toString().trim()
if (!/^\d+$/.test(buildNumber)) {
  throw new Error(`Invalid build number: ${buildNumber}`)
}

const packagePath = join(root, "package.json")
const pkg = JSON.parse(readFileSync(packagePath, "utf8"))
const base = String(pkg.version).split(/[-+]/)[0]
const next = `${base}+${buildNumber}`
pkg.version = next
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n")

const lockPath = join(root, "package-lock.json")
try {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"))
  lock.version = next
  if (lock.packages && lock.packages[""]) lock.packages[""].version = next
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n")
} catch {
  // lock が無い環境では何もしない
}

const cargoPath = join(root, "src-tauri", "Cargo.toml")
const before = readFileSync(cargoPath, "utf8")
const after = before.replace(/^version = "[^"]+"/m, `version = "${next}"`)
if (after !== before) writeFileSync(cargoPath, after)

console.log(`dev version -> ${next} (build ${buildNumber})`)
