import { getSettings } from "./api"

/** 法務文書はリポジトリの docs/legal を正本とする (main ブランチ公開後に有効)。 */
const LEGAL_BASE = "https://github.com/nsmr0604/PawKemoViewer/blob/main/docs/legal"

function localeSuffix(): "ja" | "en" {
  return getSettings().locale === "ja" ? "ja" : "en"
}

export function termsUrl(): string {
  return `${LEGAL_BASE}/terms.${localeSuffix()}.md`
}

export function privacyUrl(): string {
  return `${LEGAL_BASE}/privacy.${localeSuffix()}.md`
}
