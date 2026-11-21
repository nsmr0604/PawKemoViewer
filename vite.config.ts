import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { execFileSync } from "node:child_process"

// ローカルビルドでもデバッグ版の表記に commit を出せるようにする。
// CI は VITE_BUILD_COMMIT=github.sha を渡すので、ここは未指定時のフォールバック。
function localCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

// Tauri アプリのフロントエンド。
// API リクエストは src/api.ts から Tauri の api_request コマンド (Rust/reqwest) 経由で
// 行われるため、開発時のプロキシ設定は不要 (CORS も発生しない)。
export default defineConfig({
  plugins: [react()],
  define: {
    // 未指定時はローカルデバッグ扱い (REV=0) として commit を埋め込む
    "import.meta.env.VITE_BUILD_REV": JSON.stringify(process.env.VITE_BUILD_REV ?? "0"),
    "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(
      process.env.VITE_BUILD_COMMIT ?? localCommit(),
    ),
  },
  server: {
    // src-tauri/target (cargo のビルド成果物) を監視すると
    // Windows 上で EBUSY が発生し dev サーバがクラッシュするため除外
    watch: { ignored: ["**/src-tauri/target/**", "**/.agent-work/**"] },
  },
})
