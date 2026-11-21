import type { LocaleRepository } from "./locale-repository"

const LOCALE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/
const MAX_LOCALE_BYTES = 1024 * 1024

type LocaleFile = Pick<File, "name" | "size" | "text">
type ImportFailure = { name: string; reason: "code" | "size" | "json" | "write" }

export function createLocaleUseCases(repository: LocaleRepository | undefined, isValidJson: (json: string) => boolean) {
  return {
    async addLocale(rawCode: string, json: string) {
      const code = rawCode.trim()
      if (!LOCALE_CODE.test(code)) return { kind: "invalid-code" } as const
      if (!isValidJson(json)) return { kind: "invalid-json" } as const
      if (!repository) throw new Error("Locale service unavailable")
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
          if (!isValidJson(json)) {
            failures.push({ name, reason: "json" })
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

    async deleteLocale(code: string) {
      if (!repository) throw new Error("Locale service unavailable")
      return repository.deletePrivate(code)
    },
  }
}
