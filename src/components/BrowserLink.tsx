import { useState, type AnchorHTMLAttributes } from "react"
import { invoke } from "@tauri-apps/api/core"
import { t } from "../i18n"
import { getPlatformRuntime } from "../platform/runtime"

export function BrowserLink({ href, children, ...props }: Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "title" | "children"> & { href: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  return (
    <>
      <a {...props} href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => {
        if (!getPlatformRuntime().descriptor.isNative) return
        event.preventDefault()
        setFailedUrl(null)
        void invoke("open_in_browser", { url: href }).catch(() => setFailedUrl(href))
      }}>
        {children}
      </a>
      {failedUrl === href && <small role="status">{t("common.browserOpenFailed")}</small>}
    </>
  )
}
