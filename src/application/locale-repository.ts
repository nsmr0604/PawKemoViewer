export interface LocaleCatalogue {
  dir: string
  files: { code: string; json: string }[]
  invalid: string[]
}

export interface LocaleRepository {
  listPrivate(): Promise<LocaleCatalogue | null>
  listSecondary?(): Promise<LocaleCatalogue | null>
  exportToFolder?(code: string, json: string): Promise<boolean>
  writePrivate?(code: string, json: string, replaceExisting?: boolean): Promise<void>
  writeSecondary?(code: string, json: string): Promise<void>
  deletePrivate?(code: string): Promise<boolean>
}

export interface LocaleFileSelection {
  open(): Promise<{ kind: "cancelled" } | { kind: "selected"; name: string; json: string }>
  save(code: string, json: string): Promise<{ kind: "cancelled" | "saved"; path?: string }>
  saveToAppDirectory?(code: string, json: string): Promise<{ kind: "saved"; path: string }>
}
