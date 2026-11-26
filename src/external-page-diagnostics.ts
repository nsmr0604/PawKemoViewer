import { invoke } from "@tauri-apps/api/core"
import { getVersion } from "@tauri-apps/api/app"
import { getPlatformRuntime } from "./platform/runtime"
import { displayAppVersion } from "./version"
import type { FileSaveResult } from "./platform/contracts"

type Event =
  | "post_link_internal" | "post_link_no_referer" | "post_link_no_original_url"
  | "post_link_rejected_url" | "post_link_unsupported_runtime" | "post_link_native" | "post_link_fallback"
  | "invoke_started" | "invoke_resolved" | "invoke_pending" | "invoke_rejected"
  | "external_page_url_rejected"
  | "invalid_url" | "unsupported_scheme" | "invalid_referer" | "unsupported_referer"
  | "probe_started"

const events: string[] = []

export function traceExternalPage(event: Event) {
  events.push(`${Date.now()} js ${event}`)
  if (events.length > 100) events.shift()
}

export function traceExternalPageError(error: unknown) {
  switch (error) {
    case "invalid url": return traceExternalPage("invalid_url")
    case "unsupported scheme": return traceExternalPage("unsupported_scheme")
    case "invalid referer": return traceExternalPage("invalid_referer")
    case "referer must be a FANBOX or Patreon page": return traceExternalPage("unsupported_referer")
    default: return traceExternalPage("invoke_rejected")
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(reject, ms) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function probeIOSExternalPage(open: (url: string, referer: string) => Promise<void>) {
  traceExternalPage("probe_started")
  return withTimeout(open("https://example.com/", "https://www.fanbox.cc/"), 8000)
}

export async function saveIOSExternalPageReport() {
  const { descriptor } = getPlatformRuntime()
  const version = displayAppVersion(await getVersion())
  const native = await withTimeout(invoke<{
    device: string
    osVersion: string
    events: string[]
  }>("external_page_diagnostic_events"), 3000).catch(() => null)
  const lines = [
    `PawKemoViewer ${version} | external page diagnostic`,
    `platform=${descriptor.os} native=${descriptor.isNative} touch=${navigator.maxTouchPoints > 1}`,
    native ? `iOS=${native.osVersion} device=${native.device}` : "native_diagnostics_unavailable",
    ...[...events, ...(native?.events ?? [])].sort(),
  ]
  return invoke<FileSaveResult>("save_user_file", {
    purpose: "log",
    filename: "external-page-diagnostic.txt",
    text: lines.join("\n") + "\n",
    appDirectory: true,
  })
}
