import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getVersion } from "@tauri-apps/api/app"
import { updateSettings, getSettings } from "../api"
import { syncFollowsWithAccount } from "../follows"
import { navigate, useRoute } from "../router"
import { t } from "../i18n"
import { displayAppVersion } from "../version"

export function LoginPage() {
  const route = useRoute()
  const next = route.query.get("next") || "/"
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [appVersion, setAppVersion] = useState("")

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(""))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setResult({ ok: false, msg: t("login.errorEmpty") })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      // Rust 側で pawchive.pw /account/login に POST し、
      // session cookie を検証してから返す
      const j = await invoke<{
        ok: boolean
        session?: string
        error?: string
      }>("login_request", {
        username,
        password,
        // Tauri v2 の引数は camelCase (timeout_secs → timeoutSecs)
        timeoutSecs: getSettings().timeoutSecs || null,
      })
      if (j.ok) {
        if (j.session) {
          updateSettings({ sessionKey: j.session })
          // ログイン直後にローカルフォローをアカウントと同期する。
          await syncFollowsWithAccount()
          setResult({ ok: true, msg: t("login.success") })
          setTimeout(() => navigate(next.startsWith("/") ? next : "/", true), 800)
        } else {
          // 認証は成功したが cookie が取得できなかった
          setResult({
            ok: true,
            msg: t("login.sessionError"),
          })
          setTimeout(() => navigate("/settings", true), 2500)
        }
      } else {
        setResult({ ok: false, msg: j.error || t("login.errorFail") })
      }
    } catch (e) {
      setResult({ ok: false, msg: t("login.commError", { msg: e instanceof Error ? e.message : String(e) }) })
    } finally {
      setBusy(false)
      setPassword("")
    }
  }

  const { sessionKey } = getSettings()

  return (
    <div className="page login-page">
      <div className="login-card">
        <h1>🐾 {t("login.title")}</h1>
        <p className="login-desc">{t("login.desc")}</p>
        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span>{t("login.username")}</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder={t("login.usernamePlaceholder")}
            />
          </label>
          <label className="field">
            <span>{t("login.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder={t("login.passwordPlaceholder")}
            />
          </label>
          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
        {result && (
          <div className={`login-result ${result.ok ? "ok" : "login-error"}`}>{result.msg}</div>
        )}
        {sessionKey && (
          <div className="login-status">
            {t("login.sessionSet")}
          </div>
        )}
        <div className="login-links">
          <a
            className="btn btn-ghost"
            href="https://pawchive.pw/account/register?location=/login"
            target="_blank"
            rel="noreferrer"
          >
            {t("login.register")}
          </a>
        </div>

        {appVersion && (
          <div className="login-version small">PawKemoViewer v{displayAppVersion(appVersion)}</div>
        )}
      </div>
    </div>
  )
}
