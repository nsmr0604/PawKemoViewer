// ---------------------------------------------------------------------------
// 轻量 i18n: 言語ファイルを読み込み、t() で文字列を取得する。
//
// - 言語ファイル: src/locales/ja.ts (既定) / en.ts
// - フォールバック (3 段):
//   1. 選択言語の辞書 (言語ファイルが読み込めなければ日本語辞書を使う)
//   2. 組み込み日本語辞書 (キーが欠落している場合)
//   3. キー名そのもの (ies. どの辞書にも無い場合)
// - 現在の言語は Settings.locale に保存し、起動時に loadLocale() で適用する
// - 将来的に言語を増やす場合は LOCALES と locales/ にファイルを追加するだけ
// ---------------------------------------------------------------------------

import { ja, type TranslationKey } from "./locales/ja"

export type Locale = "ja" | "en"
export const LOCALES: readonly Locale[] = ["ja", "en"] as const

type Dictionary = Partial<Record<TranslationKey, string>>

/** 言語ファイルが無い / 読み込めない場合に使う組み込み日本語辞書 */
const FALLBACK_DICTIONARY: Dictionary = ja

/** 言語ファイルのローダー。動的 import の失敗を loadLocale() が捕捉する */
const LOADERS: Record<Locale, () => Promise<Dictionary>> = {
  ja: async () => (await import("./locales/ja")).ja,
  en: async () => (await import("./locales/en")).en,
}

let current: Locale = "ja"
let dictionary: Dictionary = FALLBACK_DICTIONARY

/** 言語ファイルを読み込んで適用する。失敗・未対応ロケールは日本語へフォールバック */
export async function loadLocale(locale: Locale): Promise<Locale> {
  const target: Locale = LOCALES.includes(locale) ? locale : "ja"
  try {
    dictionary = await LOADERS[target]()
    current = target
  } catch {
    // 言語ファイルが無い / 読込失敗 → 組み込み日本語へ
    dictionary = FALLBACK_DICTIONARY
    current = "ja"
  }
  return current
}

/** 既に読み込んでいる辞書へ即時切替する (日本語に戻す場合もフォールバック辞書を使う) */
export function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) {
    dictionary = FALLBACK_DICTIONARY
    current = "ja"
    return
  }
  current = locale
  // en の辞書がまだロードされていなければ日本語のまま (loadLocale を await していない場合)
  if (locale === "ja") dictionary = FALLBACK_DICTIONARY
}

export function getLocale(): Locale {
  return current
}

/** 翻訳を取得する。{name} プレースホルダーを vars で置換する */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const raw = dictionary[key] ?? FALLBACK_DICTIONARY[key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

export type { TranslationKey }
