/** Platform foundation contracts. OS implementations are injected by family adapters. */
import type { PlatformType } from "../platform"

export type PlatformFamily = "desktop" | "mobile" | "web"

export interface PlatformDescriptor {
  family: PlatformFamily
  os: PlatformType
  isNative: boolean
}

export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** Storage areas are resolved by native platform APIs, not hard-coded paths. */
export type StorageArea = "primary-private" | "secondary-accessible"
export interface StorageLocationService {
  resolve(area: StorageArea, purpose: "logs" | "locales" | "exports" | "backup" | "general"): Promise<string | null>
}

export interface LocaleFileSet { dir: string; files: { code: string; json: string }[]; invalid: string[] }\nexport interface LocaleService { listExternal(): Promise<LocaleFileSet | null> }\n\nexport interface FileExportService {
  exportText(filename: string, content: string): Promise<string>
}

export interface ClipboardService {
  readText(): Promise<string | null>
  writeText(text: string): Promise<boolean>
}

export interface LifecycleService {
  onBackRequested(handler: () => void): () => void
  exit(): Promise<void>
}

export interface LoggingService { append(line: string): void }

export interface PermissionService {
  request(permission: string): Promise<boolean>
}

/** Service integration points; optional until each migration is completed. */
export interface PlatformServices {
  storage?: KeyValueStorage
  storageLocations?: StorageLocationService
  database?: unknown
  network?: unknown
  logging?: LoggingService
  files?: FileExportService
  locale?: LocaleService
  clipboard?: ClipboardService
  lifecycle?: LifecycleService
  permissions?: PermissionService
}

export interface PlatformRuntime {
  descriptor: PlatformDescriptor
  services: PlatformServices
}
