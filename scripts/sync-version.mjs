// Cargo.toml のバージョンを package.json (単一情報源) から同期する。
// tauri.conf.json は "../package.json" を参照するため同期不要、
// package-lock.json は npm version が自動更新する。
// `npm version <x.y.z>` の postversion フック、または手動実行で使う。
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version
if (!/^\d+\.\d+\.\d+/.test(version)) {
  throw new Error(`Invalid version in package.json: ${version}`)
}

const cargoPath = join(root, "src-tauri", "Cargo.toml")
const before = readFileSync(cargoPath, "utf8")
const after = before.replace(/^version = "[^"]+"/m, `version = "${version}"`)
if (after === before) {
  console.log(`Cargo.toml already at ${version}`)
} else {
  writeFileSync(cargoPath, after)
  console.log(`Cargo.toml version -> ${version}`)
}
