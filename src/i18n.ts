// ---------------------------------------------------------------------------
// i18next による多言語対応。言語は動的に増やせる。
//
// 言語の出どころ:
//   - 同梱: ja (JS に埋め込み) / en (遅延読込)
//   - 外部: app_data/locales/<code>.json (利用者が追加・差し替え・削除できる)
//
// 規則:
//   - 外部ファイルは同梱と同じコードなら上書き (ja.json で日本語も差し替え可)
//   - 欠落キーは日本語 (同梱 ja) で補う。同梱 ja は常に最後の砦として残る
//   - 外部ファイルは日本語の辞書を基準に検査する
// 開発者向けのログ・コメントは日本語のまま。
// ---------------------------------------------------------------------------

import i18n from "i18next"
import { initReactI18next } from "react-i18next"
// 日本語は静的 import (JS に埋め込み)。外部ファイルや言語ファイルの喪失に依存しない
import ja from "./locales/ja.json"
import { logWarn } from "./log"
import type { LocaleRepository } from "./application/locale-repository"
import { validateLocale, type LocaleIssue } from "./domain/locale-validation"

export type Locale = string
type Dict = Record<string, string>

export interface LocaleInfo {
  code: string
  name: string
  /** app_data/locales の外部ファイルがあるか (削除・差し替えの対象) */
  external: boolean
}

export type TranslationKey = keyof typeof ja

const BASE_JA: Dict = ja
/** 同梱の言語 (遅延読込)。表示名は BUNDLED_NAMES */
const BUNDLED_LOADERS: Record<string, () => Promise<{ default: Dict }>> = {
  en: () => import("./locales/en.json"),
}
const BUNDLED_NAMES: Record<string, string> = { ja: "日本語", en: "English" }

const external = new Map<string, Dict>()
const secondary = new Map<string, Dict>()
let secondaryDir = ""
let invalidFiles: (string | { filename: string; issues: LocaleIssue[] })[] = []

i18n.use(initReactI18next).init({
  // i18next は渡したオブジェクトを参照のまま書き換えるため、同梱の辞書はコピーを渡す
  resources: { ja: { translation: { ...BASE_JA } } },
  lng: "ja",
  fallbackLng: "ja",
  // 平坦なキー (settings.title など) をそのまま使う
  keySeparator: false,
  nsSeparator: false,
  // 値は React 側でエスケープされるため、i18next 側の HTML エスケープは不要
  interpolation: { escapeValue: false },
})

export function validateExternalLocale(text: string) {
  return validateLocale(text, BASE_JA)
}

/** 外部ファイルを再スキャンする (app_data/locales)。ブラウザ実行などでは何もしない */
export async function refreshLocales(repository: LocaleRepository | undefined): Promise<void> {
  const [privateResult, secondaryResult] = await Promise.allSettled([
    repository?.listPrivate(),
    repository?.listSecondary?.(),
  ])
  external.clear()
  secondary.clear()
  invalidFiles = []
  secondaryDir = ""

  // 同梱辞書にアプリ専用、追加フォルダーの順に重ねる。
  const privateFiles = privateResult.status === "fulfilled" ? privateResult.value : null
  const secondaryFiles = secondaryResult.status === "fulfilled" ? secondaryResult.value : null
  for (const [source, files, dictionaries] of [
    ["", privateFiles, external],
    ["secondary:", secondaryFiles, secondary],
  ] as const) {
    if (!files) continue
    invalidFiles.push(...files.invalid.map((name) => source + name))
    for (const file of files.files) {
      const { dictionary, issues } = validateExternalLocale(file.json)
      if (dictionary) {
        dictionaries.set(file.code, dictionary)
      } else {
        const filename = `${source}${file.code}.json`
        invalidFiles.push({ filename, issues })
        logWarn(`言語ファイルを読み込めません: ${filename}`)
      }
    }
  }
  secondaryDir = secondaryFiles?.dir ?? ""
  // 外部の ja.json による上書きを反映する
  replaceDictionary("ja", (await dictionaryFor("ja")) ?? BASE_JA)
}

/** 選択できる言語の一覧 (同梱 + 外部)。日本語を先頭に */
export function availableLocales(): LocaleInfo[] {
  const codes = new Set<string>(["ja", ...Object.keys(BUNDLED_LOADERS), ...external.keys(), ...secondary.keys()])
  return [...codes].map((code) => ({
    code,
    name: secondary.get(code)?.["locale.name"] || external.get(code)?.["locale.name"] || BUNDLED_NAMES[code] || code,
    external: external.has(code),
  }))
}

/** 追加の言語フォルダーの読み込み結果 (表示用) */
export function secondaryLocaleFolder(): string {
  return secondaryDir
}
export function invalidLocaleFiles(): string[] {
  return invalidFiles.map((file) => typeof file === "string"
    ? file
    : `${file.filename} (${formatLocaleIssues(file.issues)})`)
}

/** 言語の辞書: 同梱 (あれば) に外部 (あれば) を重ねる。どちらも無ければ null */
async function dictionaryFor(code: string): Promise<Dict | null> {
  const bundled: Dict | null =
    code === "ja" ? BASE_JA : BUNDLED_LOADERS[code] ? (await BUNDLED_LOADERS[code]()).default : null
  const ext = external.get(code) ?? null
  const shared = secondary.get(code) ?? null
  if (!bundled && !ext && !shared) return null
  return { ...(bundled ?? {}), ...(ext ?? {}), ...(shared ?? {}) }
}

function replaceDictionary(code: string, dictionary: Dict) {
  i18n.removeResourceBundle(code, "translation")
  i18n.addResourceBundle(code, "translation", { ...dictionary })
}

/** 言語を読み込んで適用する。未知・失敗は日本語へフォールバックし、適用された言語を返す */
export async function loadLocale(code: Locale): Promise<Locale> {
  try {
    const dict = await dictionaryFor(code)
    if (!dict) throw new Error(`unknown locale: ${code}`)
    replaceDictionary(code, dict)
    await i18n.changeLanguage(code)
    return code
  } catch {
    await i18n.changeLanguage("ja")
    return "ja"
  }
}

const translate = i18n.t.bind(i18n) as unknown as (key: string, options?: Record<string, unknown>) => string

/** 翻訳を取得する。{{name}} 形式の補間値は vars で渡す */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(key, vars)
}

export function formatLocaleIssues(issues: LocaleIssue[]): string {
  const shown = issues.slice(0, 3).map((issue) => t(`settings.localeIssue.${issue.kind}`,
    "key" in issue ? { key: issue.key } : undefined))
  if (issues.length > shown.length) {
    shown.push(t("settings.localeIssue.more", { count: issues.length - shown.length }))
  }
  return shown.join(" / ")
}

export default i18n
