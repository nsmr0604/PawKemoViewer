// ネイティブアイコンをビルド時に生成する。
//   モバイル (android/ios) : app-icons/dark.png を既定、light.png を代替として使用
//   PC (desktop)           : app-icons/pc.png を使用
// src-tauri/icons/ は gitignore 済みで、このスクリプトの出力先。
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(".");
const OUT = join(ROOT, "src-tauri", "icons");
const SOURCES = {
  mobile: join(ROOT, "src-tauri", "app-icons", "dark.png"),
  desktop: join(ROOT, "src-tauri", "app-icons", "pc.png"),
};

function tauriIcon(input, output) {
  const runner = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(runner, ["tauri", "icon", input, "--output", output], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`tauri icon failed: ${input}`);
}

for (const [name, file] of Object.entries(SOURCES)) {
  if (!existsSync(file)) throw new Error(`source icon not found: ${file}`);
  console.log(`icon source (${name}): ${file}`);
}

mkdirSync(OUT, { recursive: true });

// 1) モバイル元画像で全プラットフォーム分を生成 (android/ios は dark のものを採用)
tauriIcon(SOURCES.mobile, OUT);

// 2) PC 元画像からデスクトップ用だけを生成し、ルートのアイコンを上書き。
//    android/ と ios/ のディレクトリは dark のまま残す。
const temp = mkdtempSync(join(tmpdir(), "pawchive-desktop-icons-"));
try {
  tauriIcon(SOURCES.desktop, temp);
  for (const entry of readdirSync(temp)) {
    const from = join(temp, entry);
    if (!statSync(from).isFile()) continue;
    cpSync(from, join(OUT, entry));
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`icons generated: ${OUT}`);
