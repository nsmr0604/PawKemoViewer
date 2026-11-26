import { getSettings } from "./api"

/** 法務文書は 0.6.0 ブランチの docs/legal を正本とする。
 *  main へマージしたら LEGAL_BASE を main に切り替える。 */
const LEGAL_BASE = "https://github.com/nsmr0604/PawKemoViewer/blob/0.6.0/docs/legal"
const ISSUES_URL = "https://github.com/nsmr0604/PawKemoViewer/issues"
const RIGHTS_CONTACT_URL = "https://github.com/nsmr0604/PawKemoViewer/issues"

function localeSuffix(): "ja" | "en" {
  return getSettings().locale === "ja" ? "ja" : "en"
}

export function termsUrl(): string {
  return `${LEGAL_BASE}/terms.${localeSuffix()}.md`
}

export function privacyUrl(): string {
  return `${LEGAL_BASE}/privacy.${localeSuffix()}.md`
}

/** 一般の連絡先 (不具合・要望) */
export function contactUrl(): string {
  return ISSUES_URL
}

/** 権利侵害・削除依頼・プライバシー用の連絡先 */
export function rightsContactUrl(): string {
  return RIGHTS_CONTACT_URL
}
