export const MAX_LOCALE_BYTES = 1024 * 1024

export type LocaleDict = Record<string, string>
export type LocaleIssue =
  | { kind: "json" | "size" | "empty" }
  | { kind: "value" | "unknown" | "missing" | "variables"; key: string }

type Validation =
  | { dictionary: LocaleDict; issues: [] }
  | { dictionary: null; issues: LocaleIssue[] }

function variables(text: string): string {
  const names = [...text.matchAll(/\{\{\s*-?\s*([^{}]+?)\s*\}\}/g)]
    .map(([, expression]) => expression.split(",", 1)[0].trim())
  return JSON.stringify([...new Set(names)].sort())
}

function exceedsUtf8Limit(text: string): boolean {
  let bytes = 0
  for (const character of text) {
    const code = character.codePointAt(0)!
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    if (bytes > MAX_LOCALE_BYTES) return true
  }
  return false
}

export function validateLocale(text: string, reference?: LocaleDict, complete = false): Validation {
  if (text.length > MAX_LOCALE_BYTES || exceedsUtf8Limit(text)) {
    return { dictionary: null, issues: [{ kind: "size" }] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { dictionary: null, issues: [{ kind: "json" }] }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > 10000) {
    return { dictionary: null, issues: [{ kind: "json" }] }
  }

  const dictionary: LocaleDict = Object.create(null)
  const issues: LocaleIssue[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!key || key.length > 512 || ["__proto__", "constructor", "prototype"].includes(key)) {
      issues.push({ kind: "unknown", key })
    } else if (reference && !Object.hasOwn(reference, key)) {
      issues.push({ kind: "unknown", key })
    } else if (typeof value !== "string" || value.length > 10000 || !value.trim()) {
      issues.push({ kind: "value", key })
    } else if (reference && variables(value) !== variables(reference[key])) {
      issues.push({ kind: "variables", key })
    } else {
      dictionary[key] = value
    }
  }

  for (const key of complete && reference ? Object.keys(reference) : ["locale.name"]) {
    if (!Object.hasOwn(raw, key)) issues.push({ kind: "missing", key })
  }
  if (!issues.length && Object.keys(dictionary).length < 2) issues.push({ kind: "empty" })
  return issues.length ? { dictionary: null, issues } : { dictionary, issues: [] }
}
