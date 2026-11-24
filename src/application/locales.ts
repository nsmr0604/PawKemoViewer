import type { LocaleFileSelection, LocaleRepository } from "./locale-repository"
import { MAX_LOCALE_BYTES, type LocaleIssue } from "../domain/locale-validation"

const LOCALE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/

type LocaleFile = Pick<File, "name" | "size" | "text">
type ImportFailure =
  | { name: string; reason: "code" | "size" | "write" }
  | { name: string; reason: "json"; issues: LocaleIssue[] }

export async function exportPrivateLocaleToFolder(repository: LocaleRepository | undefined, code: string, validate: (json: string) => LocaleIssue[]) {
  if (!repository?.exportToFolder) return false
  const catalogue = await repository.listPrivate()
  const file = catalogue?.files.find((entry) => entry.code === code)
  if (!file || validate(file.json).length) return false
  return repository.exportToFolder(file.code, file.json)
}

export function createLocaleUseCases(repository: LocaleRepository | undefined, validate: (json: string) => LocaleIssue[], picker?: LocaleFileSelection) {
  return {
    async addLocale(rawCode: string, json: string) {
      const code = rawCode.trim()
      if (!LOCALE_CODE.test(code)) return { kind: "invalid-code" } as const
      const issues = validate(json)
      if (issues.length) return { kind: "invalid-json", issues } as const
      if (!repository?.writePrivate) throw new Error("Locale service unavailable")
      await repository.writePrivate(code, json)
      return { kind: "saved", code } as const
    },

    async importLocaleFiles(files: Iterable<LocaleFile>, target: "private" | "secondary") {
      const write = target === "private" ? repository?.writePrivate : repository?.writeSecondary
      if (!write) return { kind: "unavailable" } as const
      let imported = 0
      const failures: ImportFailure[] = []
      for (const file of Array.from(files)) {
        const { name } = file
        const code = name.replace(/\.json$/i, "")
        if (!LOCALE_CODE.test(code)) {
          failures.push({ name, reason: "code" })
          continue
        }
        if (file.size > MAX_LOCALE_BYTES) {
          failures.push({ name, reason: "size" })
          continue
        }
        try {
          const json = await file.text()
          const issues = validate(json)
          if (issues.length) {
            failures.push({ name, reason: "json", issues })
            continue
          }
          await write.call(repository, code, json)
          imported++
        } catch {
          failures.push({ name, reason: "write" })
        }
      }
      return { kind: "completed", imported, failures } as const
    },

    canPickLocale: picker !== undefined,
    canSaveLocaleToAppDirectory: picker?.saveToAppDirectory !== undefined,

    async pickLocale() {
      if (!picker || !repository?.writePrivate) throw new Error("Locale picker unavailable")
      const result = await picker.open()
      if (result.kind === "cancelled") return result
      const code = result.name.replace(/\.json$/i, "")
      if (!LOCALE_CODE.test(code)) return { kind: "invalid-code" } as const
      const issues = validate(result.json)
      if (issues.length) return { kind: "invalid-json", issues } as const
      const catalogue = await repository.listPrivate()
      if (!catalogue) throw new Error("Could not check existing locale files")
      const filename = `${code.toLowerCase()}.json`
      const existingCode = catalogue.files.find((file) => file.code.toLowerCase() === code.toLowerCase())?.code
        ?? catalogue.invalid.find((name) => name.toLowerCase() === filename)?.slice(0, -5)
      if (existingCode) return { kind: "conflict", code: existingCode, json: result.json } as const
      await repository.writePrivate(code, result.json, false)
      return { kind: "saved", code } as const
    },

    async exportPrivateLocale(code: string, destination: "picker" | "app" = "picker") {
      if (!picker || !repository) throw new Error("Locale picker unavailable")
      const catalogue = await repository.listPrivate()
      const file = catalogue?.files.find((entry) => entry.code === code)
      if (!file) return { kind: "missing" } as const
      const issues = validate(file.json)
      if (issues.length) return { kind: "invalid-json", issues } as const
      if (destination === "app") {
        if (!picker.saveToAppDirectory) throw new Error("App language folder unavailable")
        return picker.saveToAppDirectory(file.code, file.json)
      }
      return picker.save(file.code, file.json)
    },

    async deleteLocale(code: string) {
      if (!repository?.deletePrivate) throw new Error("Locale service unavailable")
      return repository.deletePrivate(code)
    },
  }
}
