import { getSettings, updateSettings } from "./api"
import { t } from "./i18n"
import { navigate } from "./router"

export function activateAccount(next?: string) {
  if (!getSettings().sessionKey) {
    navigate(next ? `/login?next=${encodeURIComponent(next)}` : "/login")
    return
  }
  if (window.confirm(t("nav.logoutConfirm"))) updateSettings({ sessionKey: "" })
}
