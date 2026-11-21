import { useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { t } from "../i18n"
import { navigate } from "../router"
import { NavIcon } from "./NavigationRail"
import { navigationItems } from "./navigation-items"

export function BottomNavigation({ currentPath, followCount }: { currentPath: string; followCount: number }) {
  const barRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const viewport = window.visualViewport
    const bar = barRef.current
    if (!viewport || !bar) return

    // キーボードなどで表示領域が縮んだ分だけ固定バーを持ち上げる。
    const alignToViewport = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      bar.style.setProperty("--bottom-nav-inset", `${inset}px`)
    }

    alignToViewport()
    viewport.addEventListener("resize", alignToViewport)
    viewport.addEventListener("scroll", alignToViewport)
    window.addEventListener("resize", alignToViewport)
    return () => {
      viewport.removeEventListener("resize", alignToViewport)
      viewport.removeEventListener("scroll", alignToViewport)
      window.removeEventListener("resize", alignToViewport)
    }
  }, [])

  return createPortal(
    <nav ref={barRef} className="bottom-nav" aria-label={t("nav.primary")}>
      {navigationItems(currentPath, followCount).map(({ path, label, icon, active, badge }) => (
        <button
          key={path}
          type="button"
          className={active ? "nav-active" : ""}
          onClick={() => navigate(path, path === "/")}
          aria-current={active ? "page" : undefined}
        >
          <NavIcon name={icon} />
          <span>{label}{badge !== undefined && badge > 0 ? ` (${badge})` : ""}</span>
        </button>
      ))}
    </nav>,
    document.body,
  )
}
