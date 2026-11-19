// ---------------------------------------------------------------------------
// i18next による多言語対応。言語ファイルは JSON (src/locales/*.json)。
//
// - 日本語 (ja.json) は JS バンドルに静的に埋め込む (既定 + 喪失時の最終フォールバック)。
//   言語ファイルが読めなくても、日本語は必ず表示できる
// - 英語など他の言語は動的 import で遅延読み込みする (失敗時は日本語へ)
// - 欠落キーは日本語 (fallbackLng) から補う
// - 開発者向けのログ・コメントは日本語のままでよい (i18n の対象外)
// ---------------------------------------------------------------------------

import i18n from "i18next"
import { initReactI18next } from "react-i18next"
// 日本語は静的 import (JS に埋め込み)。言語ファイルの喪失に依存しない
import ja from "./locales/ja.json"

export type Locale = "ja" | "en"
export const LOCALES: readonly Locale[] = ["ja", "en"] as const
export type TranslationKey = keyof typeof ja

type Resource = Record<string, string>

/** 日本語以外の言語ファイル。追加時はここに 1 行足す */
const LOADERS: Record<Exclude<Locale, "ja">, () => Promise<{ default: Resource }>> = {
  en: () => import("./locales/en.json"),
}

i18n.use(initReactI18next).init({
  resources: { ja: { translation: ja } },
  lng: "ja",
  fallbackLng: "ja",
  supportedLngs: [...LOCALES],
  // 平坦なキー (settings.title など) をそのまま使う
  keySeparator: false,
  nsSeparator: false,
  // 値は React 側でエスケープされるため、i18next 側の HTML エスケープは不要
  interpolation: { escapeValue: false },
})

/** 言語を読み込んで適用する。失敗・未対応は日本語へフォールバックし、適用された言語を返す */
export async function loadLocale(locale: Locale): Promise<Locale> {
  const target: Locale = LOCALES.includes(locale) ? locale : "ja"
  if (target === "ja") {
    await i18n.changeLanguage("ja")
    return "ja"
  }
  try {
    if (!i18n.hasResourceBundle(target, "translation")) {
      const mod = await LOADERS[target]()
      i18n.addResourceBundle(target, "translation", mod.default, true, true)
    }
    await i18n.changeLanguage(target)
    return target
  } catch {
    // 言語ファイルが無い / 読込失敗 → 同梱の日本語へ
    await i18n.changeLanguage("ja")
    return "ja"
  }
}

const translate = i18n.t.bind(i18n) as unknown as (key: string, options?: Record<string, unknown>) => string

/** 翻訳を取得する。{{name}} 形式の補間値は vars で渡す */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(key, vars)
}

export default i18n
