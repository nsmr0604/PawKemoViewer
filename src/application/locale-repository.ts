export interface LocaleCatalogue {
  dir: string
  files: { code: string; json: string }[]
  invalid: string[]
}

export interface LocaleRepository {
  listPrivate(): Promise<LocaleCatalogue | null>
  listSecondary?(): Promise<LocaleCatalogue | null>
  writePrivate(code: string, json: string): Promise<void>
  writeSecondary?(code: string, json: string): Promise<void>
  deletePrivate(code: string): Promise<boolean>
}
