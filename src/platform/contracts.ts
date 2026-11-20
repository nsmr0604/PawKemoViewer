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

export interface FileExportService {
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

export interface PermissionService {
  request(permission: string): Promise<boolean>
}

/** Service integration points; optional until each migration is completed. */
export interface PlatformServices {
  storage?: KeyValueStorage
  database?: unknown
  network?: unknown
  logging?: unknown
  files?: FileExportService
  locale?: unknown
  clipboard?: ClipboardService
  lifecycle?: LifecycleService
  permissions?: PermissionService
}

export interface PlatformRuntime {
  descriptor: PlatformDescriptor
  services: PlatformServices
}
