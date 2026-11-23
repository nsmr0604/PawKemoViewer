/**
 * 診断ビルド専用の pkv 疎通テスト。
 * DEBUG_DIAG 時だけ読み込まれる Full 診断コンポーネントからのみ import する。
 */
import { getPlatformRuntime } from "./platform/runtime"

/** pkv プロトコルの URL。本番の api.ts と同じ OS 別形式を使う */
export function pkvProbeUrl(target: string, referer: string): string {
  const os = getPlatformRuntime().descriptor.os
  const base = os === "windows" || os === "android"
    ? "http://pkv.localhost/file"
    : "pkv://localhost/file"
  return `${base}?u=${encodeURIComponent(target)}&r=${encodeURIComponent(referer)}`
}

/** 画像として読み込み、プロキシ経由で取得できたかを判定する */
export function probePkvImage(target: string, referer: string, timeoutMs = 20000): Promise<string> {
  const url = pkvProbeUrl(target, referer)
  return new Promise((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(() => resolve("timeout"), timeoutMs)
    image.onload = () => {
      window.clearTimeout(timer)
      resolve(`ok ${image.naturalWidth}x${image.naturalHeight}`)
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      resolve("error")
    }
    image.src = url
  })
}
