/**
 * プラットフォーム固有処理と共通インターフェースの分離
 * 
 * JHenTai / EhViewer / FANBOX Viewer の実測知見に基づくクロスプラットフォーム設計:
 * - デスクトップ (Windows/macOS/Linux) ⇔ モバイル (Android/iOS) の判別
 * - Layout Mode (デスクトップ: 左アイコンレール / モバイル: ボトムナビ)
 * - クリップボード連携 (Check Gallery URL in Clipboard)
 * - キーボードショートカット
 */

export type PlatformType = "android" | "windows" | "macos" | "linux" | "ios" | "unknown"
export type LayoutMode = "auto" | "desktop" | "mobile"
export type ResolvedLayout = "desktop" | "mobile"

/** 実行環境の UA からプラットフォームを判定 */
export function getPlatform(): PlatformType {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("android")) return "android"
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios"
  if (ua.includes("windows") || ua.includes("win32")) return "windows"
  // iPadOS can report a desktop Macintosh user agent.
  if (ua.includes("macintosh") && navigator.maxTouchPoints > 1) return "ios"
  if (ua.includes("macintosh") || ua.includes("mac os x")) return "macos"
  if (ua.includes("linux")) return "linux"
  return "unknown"
}

export function isMobile(): boolean {
  const p = getPlatform()
  return p === "android" || p === "ios"
}

export function isDesktop(): boolean {
  return !isMobile()
}

export function getPlatformName(): string {
  const p = getPlatform()
  switch (p) {
    case "android": return "Android"
    case "windows": return "Windows"
    case "macos": return "macOS"
    case "linux": return "Linux"
    case "ios": return "iOS"
    default: return "Web / Unknown"
  }
}

/**
 * ユーザー指定の layoutMode ("auto" | "desktop" | "mobile") と
 * 画面幅・プラットフォームから実際適用するレイアウトを決定する
 * (JHenTai Layout Mode 実装の設計)
 */
export function resolveLayout(mode: LayoutMode, windowWidth: number): ResolvedLayout {
  if (mode === "desktop") return "desktop"
  if (mode === "mobile") return "mobile"
  // "auto": 幅 768px 以上かつデスクトップ環境ならデスクトップレイアウト
  if (windowWidth >= 768 && isDesktop()) return "desktop"
  return "mobile"
}

/**
 * 安全なクリップボードテキスト読み取り
 * (権限エラーや非対応環境でも例外を投げず null を返す)
 */
export async function readClipboardTextSafe(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return null
  }
  try {
    const text = await navigator.clipboard.readText()
    return text ? text.trim() : null
  } catch {
    // 権限未付与・非アクティブ時は握りつぶす
    return null
  }
}

export interface ExtractedCreator {
  service: "fanbox" | "patreon"
  idOrSlug: string
  originalUrl: string
}

/**
 * クリップボードや入力文字列からクリエイターの URL / ID を抽出する
 * (JHenTai の Check Gallery URL in Clipboard 相当)
 */
export function extractCreatorFromText(text: string): ExtractedCreator | null {
  if (!text) return null
  const t = text.trim()

  // https://tateha.fanbox.cc
  const fbSub = t.match(/https?:\/\/([a-zA-Z0-9_-]+)\.fanbox\.cc/i)
  if (fbSub && fbSub[1] && fbSub[1].toLowerCase() !== "www") {
    return { service: "fanbox", idOrSlug: fbSub[1].toLowerCase(), originalUrl: t }
  }

  // https://www.fanbox.cc/@tateha
  const fbAt = t.match(/https?:\/\/(?:www\.)?fanbox\.cc\/@([a-zA-Z0-9_-]+)/i)
  if (fbAt && fbAt[1]) {
    return { service: "fanbox", idOrSlug: fbAt[1].toLowerCase(), originalUrl: t }
  }

  // https://www.patreon.com/user?u=123456
  const patU = t.match(/https?:\/\/(?:www\.)?patreon\.com\/user\?u=(\d+)/i)
  if (patU && patU[1]) {
    return { service: "patreon", idOrSlug: patU[1], originalUrl: t }
  }

  // https://www.patreon.com/m/slug または https://www.patreon.com/slug
  const patSlug = t.match(/https?:\/\/(?:www\.)?patreon\.com\/(?:m\/)?([a-zA-Z0-9_-]+)/i)
  if (patSlug && patSlug[1] && !["home", "join", "login", "signup", "settings"].includes(patSlug[1].toLowerCase())) {
    return { service: "patreon", idOrSlug: patSlug[1].toLowerCase(), originalUrl: t }
  }

  // https://pawchive.pw/creators/fanbox/20352
  const pawC = t.match(/https?:\/\/pawchive\.pw\/creators\/(fanbox|patreon)\/([a-zA-Z0-9_-]+)/i)
  if (pawC && pawC[1] && pawC[2]) {
    return {
      service: pawC[1].toLowerCase() as "fanbox" | "patreon",
      idOrSlug: pawC[2],
      originalUrl: t,
    }
  }

  return null
}
