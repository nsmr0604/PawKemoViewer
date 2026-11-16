import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Tauri アプリのフロントエンド。
// API リクエストは src/api.ts から Tauri の api_request コマンド (Rust/reqwest) 経由で
// 行われるため、開発時のプロキシ設定は不要 (CORS も発生しない)。
export default defineConfig({
  plugins: [react()],
})
