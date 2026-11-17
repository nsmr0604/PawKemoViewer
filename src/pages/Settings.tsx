import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { invoke } from "@tauri-apps/api/core"
import { getSettings, updateSettings, api, apiStatus } from "../api"
import { clearCreatorCache, creatorCacheInfo, CreatorCacheInfo } from "../db"
import {
  getLogEntries,
  clearLog,
  formatLog,
  logInfo,
} from "../log"
import { navigate } from "../router"

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function fmtTs(ms: number | undefined): string {
  if (!ms) return "-"
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`
}

export function SettingsPage() {
  const s = getSettings()

  const [sessionKey, setSessionKey] = useState(s.sessionKey)
  const [theme, setTheme] = useState<"dark" | "light">(s.theme)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [version, setVersion] = useState<string>("")
  const [appVersion, setAppVersion] = useState<string>("")
  const [cache, setCache] = useState<CreatorCacheInfo | null>(null)
  const [logText, setLogText] = useState<string | null>(null)
  const [logResult, setLogResult] = useState<string | null>(null)

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("取得失敗"))
    creatorCacheInfo().then(setCache).catch(() => setCache(null))
  }, [])

  const save = () => {
    updateSettings({ sessionKey: sessionKey.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const applyTheme = (t: "dark" | "light") => {
    setTheme(t)
    updateSettings({ theme: t })
    document.documentElement.dataset.theme = t
  }

  const testSession = async () => {
    setTestResult("テスト中…")
    try {
      await api.accountFavorites("artist")
      setTestResult("✅ お気に入りを取得できました (セッション有効)")
    } catch (e) {
      const st = apiStatus(e)
      setTestResult(
        st === 401
          ? "❌ セッションキーが無効または期限切れです"
          : `❌ 失敗${st !== null ? ` (HTTP ${st})` : ""}: ${e instanceof Error ? e.message : e}`,
      )
    }
  }

  const doClearCache = async () => {
    await clearCreatorCache()
    setCache({ count: 0, bytes: 0, fetchedAt: undefined })
    logInfo("クリエイターキャッシュを消去しました")
  }

  const showLog = () => setLogText(formatLog() || "(ログはまだありません)")

  const exportLog = async () => {
    try {
      const path = await invoke<string>("export_log", { text: formatLog() })
      setLogResult(`書き出しました: ${path}`)
    } catch (e) {
      setLogResult(`失敗: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const showVersion = async () => {
    try {
      setVersion(await api.version())
    } catch {
      setVersion("取得失敗")
    }
  }

  const logCount = getLogEntries().length

  return (
    <div className="page settings">
      <h2>設定</h2>

      {/* ------------------------------------------------ アカウント */}
      <div className="settings-section">
        <div className="section-label">アカウント</div>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={() => navigate("/login?next=/settings")}>
            ID / パスワードでログイン
          </button>
          <small className="small">ログインするとセッションキーが自動設定されます。</small>
        </div>

        <label className="field">
          <span>pawchive セッションキー (お気に入り同期に使用)</span>
          <input
            type="password"
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
            placeholder="pawchive.pw の session 値"
          />
          <small>pawchive.pw にログイン → Cookie → session の値を入力してください。</small>
          <button className="btn" onClick={testSession}>
            セッションをテスト
          </button>
          {testResult && <span className="small">{testResult}</span>}
        </label>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={save}>
            保存
          </button>
          {saved && <span className="ok">保存しました</span>}
        </div>
      </div>

      {/* ------------------------------------------------ 表示 */}
      <div className="settings-section">
        <div className="section-label">表示</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>テーマ</span>
            <small>アプリの外観を切り替えます (即時反映)</small>
          </div>
          <div className="segmented">
            <button
              className={`seg ${theme === "dark" ? "seg-active" : ""}`}
              onClick={() => applyTheme("dark")}
            >
              🌙 ダーク
            </button>
            <button
              className={`seg ${theme === "light" ? "seg-active" : ""}`}
              onClick={() => applyTheme("light")}
            >
              ☀️ ライト
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ キャッシュ */}
      <div className="settings-section">
        <div className="section-label">キャッシュ</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>クリエイター索引</span>
            <small>
              {cache
                ? `${cache.count.toLocaleString()} 件 · ${fmtBytes(cache.bytes)} · 最終取得 ${fmtTs(cache.fetchedAt)}`
                : "読み込み中…"}
            </small>
          </div>
          <button className="btn" onClick={doClearCache}>
            消去
          </button>
        </div>
      </div>

      {/* ------------------------------------------------ 診断 */}
      <div className="settings-section">
        <div className="section-label">診断</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>ログ</span>
            <small>
              通信エラー・未処理エラーを記録しています (最大 400 件、{logCount} 件保持)。
              接続できない・ログインに失敗する際の切り分けに使えます。
            </small>
          </div>
          <div className="settings-actions">
            <button className="btn" onClick={showLog}>
              表示
            </button>
            <button className="btn" onClick={exportLog}>
              書き出す
            </button>
            <button
              className="btn"
              onClick={() => {
                clearLog()
                setLogText(null)
                setLogResult("ログを消去しました")
              }}
            >
              消去
            </button>
          </div>
        </div>

        {logResult && <span className="small">{logResult}</span>}

        {logText !== null && (
          <pre className="log-view mono">
            {logText}
          </pre>
        )}
      </div>

      {/* ------------------------------------------------ 情報 */}
      <div className="settings-section">
        <div className="section-label">情報</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>サーバーバージョン</span>
          </div>
          <div className="settings-actions">
            <button className="btn" onClick={showVersion}>
              確認
            </button>
            {version && <code className="small">{version}</code>}
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>アプリバージョン</span>
          </div>
          <code className="small">{appVersion || "…"}</code>
        </div>

        <p className="small">
          Pawchive Viewer は pawchive.pw の非公式クライアントです。
        </p>
      </div>
    </div>
  )
}
