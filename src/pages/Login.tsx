import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { updateSettings, getSettings, api } from "../api"
import { navigate, useRoute } from "../router"

export function LoginPage() {
  const route = useRoute()
  const next = route.query.get("next") || "/"
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setResult({ ok: false, msg: "ユーザー名とパスワードを入力してください" })
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
      }>("login_request", { username, password })
      if (j.ok) {
        if (j.session) {
          updateSettings({ sessionKey: j.session })
          // 取得確認 (ベストエフォート)
          try {
            await api.accountFavorites("artist")
          } catch {
            /* まだ反映されていない場合は無視 */
          }
          setResult({ ok: true, msg: "ログインしました" })
          setTimeout(() => navigate(next.startsWith("/") ? next : "/", true), 800)
        } else {
          // 認証は成功したが cookie が取得できなかった
          setResult({
            ok: true,
            msg: "認証に成功しましたが、セッションキーを取得できませんでした。設定画面から手動で貼り付けてください。",
          })
          setTimeout(() => navigate("/settings", true), 2500)
        }
      } else {
        setResult({ ok: false, msg: j.error || "ログインに失敗しました" })
      }
    } catch (e) {
      setResult({ ok: false, msg: `通信エラー: ${e instanceof Error ? e.message : e}` })
    } finally {
      setBusy(false)
      setPassword("")
    }
  }

  const { sessionKey } = getSettings()

  return (
    <div className="page login-page">
      <div className="login-card">
        <h1>🐾 ログイン</h1>
        <p className="login-desc">
          pawchive.pw のアカウントでログインすると、アカウントのお気に入りを同期できます。
          認証情報はログイン時にのみ使用され、この端末に保存されるのはセッションキーだけです。
        </p>
        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span>ユーザー名</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="pawchive のユーザー名"
            />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="pawchive のパスワード"
            />
          </label>
          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? "ログイン中…" : "ログイン"}
          </button>
        </form>
        {result && (
          <div className={`login-result ${result.ok ? "ok" : "login-error"}`}>{result.msg}</div>
        )}
        {sessionKey && (
          <div className="login-status">
            セッションキーが設定済みです (設定画面で確認・削除できます)
          </div>
        )}
        <div className="login-links">
          <a
            className="btn btn-ghost"
            href="https://pawchive.pw/account/register?location=/login"
            target="_blank"
            rel="noreferrer"
          >
            アカウントを持っていない場合は登録 ↗
          </a>
        </div>
        <div className="login-links">
          <span
            className="link"
            onClick={() => navigate("/settings")}
            role="button"
          >
            セッションキーを手動入力する →
          </span>
        </div>
      </div>
    </div>
  )
}
