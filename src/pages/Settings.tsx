import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { getSettings, updateSettings, api } from "../api"
import { setMeta } from "../db"
import { navigate } from "../router"

export function SettingsPage() {
  const s = getSettings()

  const [sessionKey, setSessionKey] =
    useState(s.sessionKey)

  const [saved, setSaved] =
    useState(false)

  const [testResult, setTestResult] =
    useState<string | null>(null)

  const [version, setVersion] =
    useState<string>("")

  const [appVersion, setAppVersion] =
    useState<string>("")

  useEffect(() => {
    // アプリ自身のバージョン (tauri.conf.json / Cargo.toml と共通)
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("取得失敗"))
  }, [])

  const save = () => {
    updateSettings({
      sessionKey: sessionKey.trim(),
    })

    setSaved(true)

    setTimeout(
      () => setSaved(false),
      2000
    )
  }

  const testSession = async () => {
    setTestResult("テスト中…")

    try {
      await api.accountFavorites("artist")

      setTestResult(
        "✅ お気に入りを取得できました (セッション有効)"
      )

    } catch (e) {
      setTestResult(
        `❌ 失敗: ${
          e instanceof Error
            ? e.message
            : e
        }`
      )
    }
  }

  const clearCreatorCache =
    async () => {

      const req =
        indexedDB.open(
          "pawchive-viewer"
        )

      req.onsuccess = () => {

        const db = req.result

        const t =
          db.transaction(
            "creators",
            "readwrite"
          )

        t.objectStore(
          "creators"
        ).clear()

        t.oncomplete =
          async () => {

            await setMeta(
              "creatorsFetchedAt",
              undefined
            )

            setTestResult(
              "クリエイターキャッシュを消去しました"
            )
          }
      }
    }

  const showVersion =
    async () => {

      try {
        setVersion(
          await api.version()
        )

      } catch {

        setVersion(
          "取得失敗"
        )
      }
    }

  return (
    <div className="page settings">

      <h2>設定</h2>

      <h2>ログイン</h2>

      <div className="settings-actions">

        <button
          className="btn btn-primary"
          onClick={() =>
            navigate(
              "/login?next=/settings"
            )
          }
        >
          ID / パスワードでログイン
        </button>

        <small className="small">
          ログインするとセッションキーが自動設定されます。
        </small>

      </div>

      <label className="field">

        <span>
          pawchive セッションキー
          (お気に入り同期に使用)
        </span>

        <input
          type="password"
          value={sessionKey}
          onChange={(e) =>
            setSessionKey(
              e.target.value
            )
          }
          placeholder="pawchive.pw の session 値"
        />

        <small>
          pawchive.pw にログイン →
          Cookie →
          session の値を入力してください。
        </small>

        <button
          className="btn"
          onClick={testSession}
        >
          セッションをテスト
        </button>

        {testResult && (
          <span className="small">
            {testResult}
          </span>
        )}

      </label>

      <div className="settings-actions">

        <button
          className="btn btn-primary"
          onClick={save}
        >
          保存
        </button>

        {saved && (
          <span className="ok">
            保存しました
          </span>
        )}

      </div>

      <h2>キャッシュ</h2>

      <div className="settings-actions">

        <button
          className="btn"
          onClick={
            clearCreatorCache
          }
        >
          クリエイターキャッシュを消去
        </button>

      </div>

      <h2>情報</h2>

      <div className="settings-actions">

        <button
          className="btn"
          onClick={showVersion}
        >
          サーバーバージョン
        </button>

        {version && (
          <code className="small">
            {version}
          </code>
        )}

      </div>

      <h2>
        このアプリについて
      </h2>

      <p className="small">
        Pawchive Viewer は
        pawchive.pw の
        非公式クライアントです。
      </p>

      <p className="small">
        アプリバージョン:{" "}
        <code>{appVersion || "…"}</code>
      </p>

    </div>
  )
}