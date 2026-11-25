// 開発ビルドのバージョンを `x.y.z+<run>` にする。
// - Tauri は 4 桁 (x.y.z.run) を semver として受け付けない
// - Linux の .deb/.rpm は `-` を許可しない (RPM の Version に使えない)
// そのため semver の build metadata (`+`) を使う。リリースビルドでは実行しない。
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const run = process.argv[2]
if (!/^\d+$/.test(run ?? "")) {
  throw new Error(`Usage: node scripts/dev-version.mjs <run-number>`)
}

const packagePath = join(root, "package.json")
const pkg = JSON.parse(readFileSync(packagePath, "utf8"))
const base = String(pkg.version).split(/[-+]/)[0]
const next = `${base}+${run}`
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

console.log(`dev version -> ${next} (run ${run})`)
