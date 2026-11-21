import { invoke } from "@tauri-apps/api/core"

export type AppIconTheme = "light" | "dark"

/**
 * モバイルのアプリアイコンをテーマに合わせて切り替える。
 * 既定 (primary) は dark アイコン。light テーマのときだけ代替 light アイコンへ切り替え、
 * dark テーマでは set_icon(null) で primary (dark) に戻す。
 * desktop / web ではプラグインが unsupported を返すためサイレントに無視する。
 */
export async function syncAppIcon(theme: AppIconTheme): Promise<void> {
  try {
    await invoke("plugin:app-icon|set_icon", {
      request: { icon: theme === "light" ? "light" : null },
    })
  } catch {
    // 非対応プラットフォーム、またはアイコン未生成のビルド
  }
}
