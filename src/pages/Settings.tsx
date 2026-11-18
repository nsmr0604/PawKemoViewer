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
  logLong,
} from "../log"
import { DEBUG_DIAG, debugOpenLogFolder } from "../debug"
import { navigate } from "../router"
import { getPlatformName, readClipboardTextSafe, type LayoutMode } from "../platform"
import { exportBackup, applyBackup, buildBackup } from "../backup"
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
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>(s.layoutMode || "auto")
  const [noImageMode, setNoImageModeState] = useState<boolean>(s.noImageMode || false)
  const [proxyImages, setProxyImagesState] = useState<boolean>(s.proxyImages || false)
  const [postViewMode, setPostViewModeState] = useState<"grid" | "list">(s.postViewMode || "grid")
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [version, setVersion] = useState<string>("")
  const [appVersion, setAppVersion] = useState<string>("")
  const [cache, setCache] = useState<CreatorCacheInfo | null>(null)
  const [logText, setLogText] = useState<string | null>(null)
  const [logResult, setLogResult] = useState<string | null>(null)
  const [timeoutSecs, setTimeoutSecsState] = useState<number>(s.timeoutSecs || 30)
  const [backupResult, setBackupResult] = useState<string | null>(null)
  const [backupPaste, setBackupPaste] = useState("")
  const [showBackupPaste, setShowBackupPaste] = useState(false)

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

  const applyLayoutMode = (lm: LayoutMode) => {
    setLayoutModeState(lm)
    updateSettings({ layoutMode: lm })
  }

  const applyPostViewMode = (vm: "grid" | "list") => {
    setPostViewModeState(vm)
    updateSettings({ postViewMode: vm })
  }

  const toggleNoImageMode = (val: boolean) => {
    setNoImageModeState(val)
    updateSettings({ noImageMode: val })
  }

  const toggleProxyImages = (val: boolean) => {
    setProxyImagesState(val)
    updateSettings({ proxyImages: val })
    // 表示中の URL は設定反映済みなので、リロードして新しい URL 形式を適用する
    setTimeout(() => window.location.reload(), 300)
  }

  const applyTimeoutSecs = (v: number) => {
    setTimeoutSecsState(v)
    updateSettings({ timeoutSecs: v })
  }

  const doExportBackup = async () => {
    try {
      const path = await exportBackup()
      let clip = ""
      try {
        await navigator.clipboard.writeText(buildBackup())
        clip = " (クリップボードにもコピー済み)"
      } catch {
        /* クリップボード失敗は無視 (ファイル保存で十分) */
      }
      setBackupResult(`書き出しました: ${path}${clip}`)
      logInfo("バックアップを書き出しました")
      // デバッグ診断ビルド (VITE_DEBUG_DIAG=1) 限定: バックアップ JSON 全文を
      // 診断ログへ出力する (実機では app_data_dir が取り出せず・クリップボードも
      // adb から読めないためログ経由が最短。リリースビルドでは分離される)
      if (DEBUG_DIAG) {
        logLong("info", "DEBUG BACKUP DUMP (デバッグ診断ビルド限定・下記全文):\n" + buildBackup())
      }
    } catch (e) {
      setBackupResult(`書き出し失敗: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const doImportFromClipboard = async () => {
    const text = await readClipboardTextSafe()
    if (!text) {
      setBackupResult("クリップボードが空か読み取れません")
      return
    }
    await doImport(text)
  }

  const doImport = async (text: string) => {
    if (!window.confirm("バックアップを読み込むと、現在のフォロー・既読・設定を上書きします。よろしいですか?")) return
    try {
      const r = await applyBackup(text)
      setBackupResult(
        `読み込みました: フォロー ${r.follows} 件 · 既読 ${r.seen} 件 · 設定 ${r.settings ? "反映" : "変更なし"}`,
      )
      logInfo("バックアップを読み込みました")
      // フォロー数表示を即反映させるため再読み込み
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      setBackupResult(`読み込み失敗: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const testSession = async () => {
    setTestResult("テスト中…")
    try {
      // 保存前の入力値をそのまま検証する (保存済み設定とは分離)。
      await api.accountFavorites("artist", sessionKey.trim())
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

      {/* ------------------------------------------------ デバッグ診断 (ビルド時フラグ注入・リリースでは分離) */}
      {DEBUG_DIAG && (
        <div className="settings-section">
          <div className="section-label">デバッグ診断 (診断ビルド限定)</div>

          <div className="setting-item">
            <div className="setting-text">
              <span>診断フラグ</span>
              <small>
                有効 (VITE_DEBUG_DIAG=1 / cargo feature debug-diag)。
                ログは app_data/logs/debug-app.log に常時追記されます。
                バックアップ JSON のダンプはこのセクション・書き出し時に出力されます
              </small>
            </div>
            <code className="small">DEBUG_DIAG=on</code>
          </div>

          <div className="setting-item">
            <div className="setting-text">
              <span>ログフォルダ</span>
              <small>ログファイルの保存先をファイラで開きます (PC 向け)</small>
            </div>
            <button className="btn" onClick={() => debugOpenLogFolder().then((p) => setLogResult(`フォルダ: ${p}`)).catch((e) => setLogResult(`失敗: ${e instanceof Error ? e.message : String(e)}`))}>
              開く
            </button>
          </div>

          <div className="setting-item">
            <div className="setting-text">
              <span>バックアップ JSON ダンプ</span>
              <small>
                現在のバックアップ JSON 全文を診断ログへ出力します
                (実機での sessionKey 回収用。書き出し時にも自動ダンプされます)
              </small>
            </div>
            <button
              className="btn"
              onClick={() => {
                logLong("info", "DEBUG BACKUP DUMP (手動ダンプ・下記全文):\n" + buildBackup())
                setLogResult("診断ログへダンプしました (表示 or ファイルログで確認)")
              }}
            >
              ダンプ
            </button>
          </div>

          {logResult && <span className="small">{logResult}</span>}
        </div>
      )}

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

        <div className="setting-item">
          <div className="setting-text">
            <span>レイアウトモード</span>
            <small>
              デスクトップ (左アイコンレール) とモバイル (ボトムナビ) の表示を切り替えます
            </small>
          </div>
          <div className="segmented">
            <button
              className={`seg ${layoutMode === "auto" ? "seg-active" : ""}`}
              onClick={() => applyLayoutMode("auto")}
            >
              自動
            </button>
            <button
              className={`seg ${layoutMode === "desktop" ? "seg-active" : ""}`}
              onClick={() => applyLayoutMode("desktop")}
            >
              🖥️ デスクトップ
            </button>
            <button
              className={`seg ${layoutMode === "mobile" ? "seg-active" : ""}`}
              onClick={() => applyLayoutMode("mobile")}
            >
              📱 モバイル
            </button>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>投稿一覧の表示形式</span>
            <small>グリッド (カード配置) またはリスト (行型) を指定します</small>
          </div>
          <div className="segmented">
            <button
              className={`seg ${postViewMode === "grid" ? "seg-active" : ""}`}
              onClick={() => applyPostViewMode("grid")}
            >
              🔲 グリッド
            </button>
            <button
              className={`seg ${postViewMode === "list" ? "seg-active" : ""}`}
              onClick={() => applyPostViewMode("list")}
            >
              ☰ リスト
            </button>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>低通信モード (No Image Mode)</span>
            <small>サムネイルやプレビュー画像を読み込まず、通信量を大幅に節約します</small>
          </div>
          <button
            className={`btn ${noImageMode ? "btn-primary" : "btn-ghost"}`}
            onClick={() => toggleNoImageMode(!noImageMode)}
          >
            {noImageMode ? "有効 (画像オフ)" : "無効 (通常)"}
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>画像を paw:// プロキシ経由で読み込む</span>
            <small>
              DNS フィルタリング (AdGuard 等) で画像が表示されない端末向けの迂回設定。
              通常は無効のまま推奨
            </small>
          </div>
          <button
            className={`btn ${proxyImages ? "btn-primary" : "btn-ghost"}`}
            onClick={() => toggleProxyImages(!proxyImages)}
          >
            {proxyImages ? "有効 (プロキシ経由)" : "無効 (直接読み込み)"}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------ 接続 */}
      <div className="settings-section">
        <div className="section-label">接続</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>通信タイムアウト</span>
            <small>
              応答が遅い・失敗する環境では長めに設定します (既定 30 秒)。
              ログインにも同じ値を使用します
            </small>
          </div>
          <div className="segmented">
            {[10, 30, 60, 120].map((v) => (
              <button
                key={v}
                className={`seg ${timeoutSecs === v ? "seg-active" : ""}`}
                onClick={() => applyTimeoutSecs(v)}
              >
                {v}秒
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ データ (バックアップ) */}
      <div className="settings-section">
        <div className="section-label">データ</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>バックアップ (書き出し)</span>
            <small>
              フォロー・既読・設定を JSON ファイルに保存します
              (端末移行・初期化前に使用)
            </small>
          </div>
          <button className="btn" onClick={doExportBackup}>
            書き出す
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>バックアップ (読み込み)</span>
            <small>
              書き出した JSON を読み込み、フォロー・既読・設定を復元します
              (現在の内容を上書きします)
            </small>
          </div>
          <div className="settings-actions">
            <button className="btn" onClick={doImportFromClipboard}>
              クリップボードから
            </button>
            <button className="btn" onClick={() => setShowBackupPaste((v) => !v)}>
              貼り付ける
            </button>
          </div>
        </div>

        {showBackupPaste && (
          <label className="field">
            <span>バックアップ JSON</span>
            <textarea
              rows={5}
              value={backupPaste}
              onChange={(e) => setBackupPaste(e.target.value)}
              placeholder='{"type":"pawchive-backup",...} を貼り付け'
              className="mono"
            />
            <button
              className="btn"
              disabled={!backupPaste.trim()}
              onClick={() => {
                doImport(backupPaste)
                setShowBackupPaste(false)
                setBackupPaste("")
              }}
            >
              この内容を読み込む
            </button>
          </label>
        )}

        {backupResult && <span className="small">{backupResult}</span>}
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
            <span>実行プラットフォーム</span>
          </div>
          <code className="small">{getPlatformName()}</code>
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
