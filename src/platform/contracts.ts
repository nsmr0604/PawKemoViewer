/** Platform foundation contracts. Implementations belong to platform-family / OS adapter modules. */
import type { PlatformType } from "../platform"

export type PlatformFamily = "desktop" | "mobile" | "web"

export interface PlatformDescriptor {
  family: PlatformFamily
  os: PlatformType
  isNative: boolean
}

/** Capability declarations describe available adapter integration points, not current implementation status. */
export interface PlatformServices {
  storage?: unknown
  database?: unknown
  network?: unknown
  logging?: unknown
  files?: unknown
  locale?: unknown
  clipboard?: unknown
  lifecycle?: unknown
  permissions?: unknown
}

export interface PlatformRuntime {
  descriptor: PlatformDescriptor
  services: PlatformServices
}
