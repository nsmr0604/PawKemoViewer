import { readFileSync, writeFileSync } from "node:fs"

const path = new URL("../../src-tauri/tauri.conf.json", import.meta.url)
const config = JSON.parse(readFileSync(path, "utf8"))
config.identifier = "com.nsmr0604.pawkemoviewer.localetest"
writeFileSync(path, JSON.stringify(config, null, 2) + "\n")
