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
import { clearIconCache, creatorIconInfo } from "../icons"
import {
  t,
  loadLocale,
  refreshLocales,
  availableLocales,
  localeFolder,
  invalidLocaleFiles,
  parseLocaleJson,
  type Locale,
  type LocaleInfo,
} from "../i18n"
import { displayAppVersion } from "../version"

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
  const [postFileListMode, setPostFileListModeState] = useState<boolean>(s.postFileListMode || false)
  const [excludeFanboxCover, setExcludeFanboxCoverState] = useState<boolean>(s.excludeFanboxCover || false)
  const [excludeAiPosts, setExcludeAiPostsState] = useState<boolean>(s.excludeAiPosts || false)
  const [locale, setLocaleState] = useState<Locale>(s.locale || "ja")
  const [iconCache, setIconCache] = useState<{ count: number; bytes: number } | null>(null)
  const [postViewMode, setPostViewModeState] = useState<"grid" | "list">(s.postViewMode || "grid")
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [loginStatus, setLoginStatus] = useState<"checking" | "loggedIn" | "loggedOut" | "unknown">(s.sessionKey ? "checking" : "loggedOut")
  const [version, setVersion] = useState<string>("")
  const [appVersion, setAppVersion] = useState<string>("")
  const [cache, setCache] = useState<CreatorCacheInfo | null>(null)
  const [logText, setLogText] = useState<string | null>(null)
  const [logResult, setLogResult] = useState<string | null>(null)
  const [timeoutSecs, setTimeoutSecsState] = useState<number>(s.timeoutSecs || 30)
  const [backupResult, setBackupResult] = useState<string | null>(null)
  const [backupPaste, setBackupPaste] = useState("")
  const [showBackupPaste, setShowBackupPaste] = useState(false)
  const [localeList, setLocaleList] = useState<LocaleInfo[]>(() => availableLocales())
  const [localeMsg, setLocaleMsg] = useState<string | null>(null)
  const [localeAddOpen, setLocaleAddOpen] = useState(false)
  const [localeAddCode, setLocaleAddCode] = useState("")
  const [localeAddJson, setLocaleAddJson] = useState("")

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(t("settings.loadFailed")))
    creatorCacheInfo().then(setCache).catch(() => setCache(null))
    creatorIconInfo().then(setIconCache).catch(() => setIconCache(null))
  }, [])

  // 保存済みセッションを検証し、期限切れのキーをログイン済みと誤表示しない。
  useEffect(() => {
    let active = true
    if (!s.sessionKey) {
      setLoginStatus("loggedOut")
      return () => { active = false }
    }
    setLoginStatus("checking")
    api.accountFavorites("artist").then(() => {
      if (active) setLoginStatus("loggedIn")
    }).catch((e) => {
      if (!active) return
      setLoginStatus(apiStatus(e) === 401 ? "loggedOut" : "unknown")
    })
    return () => { active = false }
  }, [s.sessionKey])
  const save = () => {
    updateSettings({ sessionKey: sessionKey.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const applyTheme = (value: "dark" | "light") => {
    setTheme(value)
    updateSettings({ theme: value })
    document.documentElement.dataset.theme = value
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

  const togglePostFileListMode = (val: boolean) => {
    setPostFileListModeState(val)
    updateSettings({ postFileListMode: val })
  }

  const toggleExcludeFanboxCover = (val: boolean) => {
    setExcludeFanboxCoverState(val)
    updateSettings({ excludeFanboxCover: val })
  }

  const toggleExcludeAiPosts = (val: boolean) => {
    setExcludeAiPostsState(val)
    updateSettings({ excludeAiPosts: val })
  }

  // 言語ファイルを読み込んでから設定に保存する。
  // 読込失敗時は loadLocale() が日本語へフォールバックするため、
  // その結果を state と設定に反映する (存在しない言語が残らない)。
  const applyLocale = async (value: Locale) => {
    const applied = await loadLocale(value)
    setLocaleState(applied)
    updateSettings({ locale: applied })
  }

  const reloadLocales = async () => {
    await refreshLocales()
    setLocaleList(availableLocales())
    // 外部の ja.json 等を反映させるため、現在の言語を読み直す
    await applyLocale(locale)
  }

  const addLocale = async () => {
    const code = localeAddCode.trim()
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(code)) {
      setLocaleMsg(t("settings.localeBadCode"))
      return
    }
    if (!parseLocaleJson(localeAddJson)) {
      setLocaleMsg(t("settings.localeBadJson"))
      return
    }
    try {
      await invoke("write_locale_file", { code, json: localeAddJson })
    } catch (e) {
      setLocaleMsg(t("settings.failedMsg", { msg: e instanceof Error ? e.message : String(e) }))
      return
    }
    await refreshLocales()
    setLocaleList(availableLocales())
    setLocaleAddCode("")
    setLocaleAddJson("")
    setLocaleAddOpen(false)
    setLocaleMsg(t("settings.localeAdded", { code }))
    await applyLocale(locale)
  }

  const deleteLocale = async (code: string) => {
    if (!window.confirm(t("settings.localeDeleteConfirm", { code }))) return
    try {
      await invoke("delete_locale_file", { code })
    } catch (e) {
      setLocaleMsg(t("settings.failedMsg", { msg: e instanceof Error ? e.message : String(e) }))
      return
    }
    await refreshLocales()
    setLocaleList(availableLocales())
    setLocaleMsg(t("settings.localeDeleted", { code }))
    // 削除した言語を選択中なら日本語へ戻す
    if (locale === code) await applyLocale("ja")
  }

  const doClearIconCache = async () => {
    await clearIconCache()
    setIconCache(await creatorIconInfo().catch(() => null))
    logInfo("クリエイターアイコンのキャッシュを消去しました")
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
        clip = t("settings.clipCopied")
      } catch {
        /* クリップボード失敗は無視 (ファイル保存で十分) */
      }
      setBackupResult(t("settings.exported", { path, clip }))
      logInfo("バックアップを書き出しました")
      // デバッグ診断ビルド (VITE_DEBUG_DIAG=1) 限定: バックアップ JSON 全文を
      // 診断ログへ出力する (実機では app_data_dir が取り出せず・クリップボードも
      // adb から読めないためログ経由が最短。リリースビルドでは分離される)
      if (DEBUG_DIAG) {
        logLong("info", "DEBUG BACKUP DUMP (デバッグ診断ビルド限定・下記全文):\n" + buildBackup())
      }
    } catch (e) {
      setBackupResult(t("settings.exportFailed", { msg: e instanceof Error ? e.message : String(e) }))
    }
  }

  const doImportFromClipboard = async () => {
    const text = await readClipboardTextSafe()
    if (!text) {
      setBackupResult(t("settings.clipEmpty"))
      return
    }
    await doImport(text)
  }

  const doImport = async (text: string) => {
    if (!window.confirm(t("settings.importConfirm"))) return
    try {
      const r = await applyBackup(text)
      setBackupResult(
        t("settings.imported", {
          follows: r.follows,
          seen: r.seen,
          settings: r.settings ? t("settings.settingsApplied") : t("settings.settingsUnchanged"),
        }),
      )
      logInfo("バックアップを読み込みました")
      // フォロー数表示を即反映させるため再読み込み
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      setBackupResult(t("settings.importFailed", { msg: e instanceof Error ? e.message : String(e) }))
    }
  }

  const testSession = async () => {
    setTestResult(t("settings.testing"))
    try {
      // 保存前の入力値をそのまま検証する (保存済み設定とは分離)。
      await api.accountFavorites("artist", sessionKey.trim())
      setTestResult(t("settings.testOk"))
    } catch (e) {
      const st = apiStatus(e)
      setTestResult(
        st === 401
          ? t("settings.testInvalid")
          : t("settings.testFail", {
              status: st !== null ? t("settings.httpStatus", { st }) : "",
              msg: e instanceof Error ? e.message : String(e),
            }),
      )
    }
  }

  const doClearCache = async () => {
    await clearCreatorCache()
    setCache({ count: 0, bytes: 0, fetchedAt: undefined })
    logInfo("クリエイターキャッシュを消去しました")
  }

  const showLog = () => setLogText(formatLog() || t("settings.noLog"))

  const exportLog = async () => {
    try {
      const path = await invoke<string>("export_log", { text: formatLog() })
      setLogResult(t("settings.exported", { path, clip: "" }))
    } catch (e) {
      setLogResult(t("settings.failedMsg", { msg: e instanceof Error ? e.message : String(e) }))
    }
  }

  const showVersion = async () => {
    try {
      setVersion(await api.version())
    } catch {
      setVersion(t("settings.loadFailed"))
    }
  }

  const logCount = getLogEntries().length

  return (
    <div className="page settings">
      <h2>{t("settings.title")}</h2>
      <p className="settings-intro">{t("settings.intro")}</p>

      <nav className="settings-nav" aria-label={t("settings.sections")}>
        {[
          ["settings-account", t("settings.accountTitle")],
          ["settings-display", t("settings.displayTitle")],
          ["settings-post", t("settings.postTitle")],
          ["settings-connection", t("settings.navConnection")],
          ["settings-data", t("settings.navBackup")],
          ["settings-cache", t("settings.navStorage")],
          ["settings-diagnostics", t("settings.diagnostics")],
          ["settings-info", t("settings.info")],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------ アカウント */}
      <div id="settings-account" className="settings-section">
        <div className="section-label">{t("settings.accountTitle")}</div>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={() => navigate("/login?next=/settings")}>
            {t("settings.loginButton")}
          </button>
          <small className="small">{t("settings.loginHint")}</small>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.loginStatus")}</span>
            <small>{t("settings.loginStatusDesc")}</small>
          </div>
          <span className={loginStatus === "loggedIn" ? "ok" : "small"} role="status" aria-live="polite">
            {t("settings.loginStatus." + loginStatus)}
          </span>
        </div>

      </div>

      {/* ------------------------------------------------ 表示 */}
      <div id="settings-display" className="settings-section">
        <div className="section-label">{t("settings.displayTitle")}</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.language")}</span>
            <small>{t("settings.languageDesc")}</small>
          </div>
          <select
            className="locale-select"
            value={locale}
            onChange={(e) => void applyLocale(e.target.value)}
          >
            {localeList.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.localeFolder")}</span>
            <small>{localeFolder() || "-"}</small>
            {invalidLocaleFiles().length > 0 && (
              <small>{t("settings.localeInvalid", { files: invalidLocaleFiles().join(", ") })}</small>
            )}
          </div>
          <button className="btn" onClick={() => void reloadLocales()}>
            {t("settings.localeRefresh")}
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.localeAddTitle")}</span>
            <small>{t("settings.localeAddDesc")}</small>
          </div>
          <button className="btn" onClick={() => setLocaleAddOpen((v) => !v)}>
            {t("settings.localeAddButton")}
          </button>
        </div>

        {localeAddOpen && (
          <div className="field">
            <label>
              <span>{t("settings.localeCode")}</span>
              <input
                type="text"
                value={localeAddCode}
                onChange={(e) => setLocaleAddCode(e.target.value)}
                placeholder="es / zh-Hant"
              />
            </label>
            <label>
              <span>{t("settings.localeJson")}</span>
              <textarea
                rows={5}
                className="mono"
                value={localeAddJson}
                onChange={(e) => setLocaleAddJson(e.target.value)}
                placeholder='{"locale.name": "Español", ...}'
              />
            </label>
            <button className="btn" disabled={!localeAddCode.trim() || !localeAddJson.trim()} onClick={() => void addLocale()}>
              {t("settings.localeAddButton")}
            </button>
          </div>
        )}

        {localeList.some((l) => l.external) && (
          <div className="setting-item">
            <div className="setting-text">
              {localeList
                .filter((l) => l.external)
                .map((l) => (
                  <div key={l.code} className="settings-actions">
                    <span>{l.name} ({l.code})</span>
                    <button className="btn btn-ghost" onClick={() => void deleteLocale(l.code)}>
                      {t("settings.localeDelete")}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {localeMsg && <span className="small">{localeMsg}</span>}

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.theme")}</span>
            <small>{t("settings.themeDesc")}</small>
          </div>
          <div className="segmented">
            <button
              className={`seg ${theme === "dark" ? "seg-active" : ""}`}
              onClick={() => applyTheme("dark")}
            >
              {t("settings.themeDark")}
            </button>
            <button
              className={`seg ${theme === "light" ? "seg-active" : ""}`}
              onClick={() => applyTheme("light")}
            >
              {t("settings.themeLight")}
            </button>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.layout")}</span>
            <small>{t("settings.layoutDesc")}</small>
          </div>
          <div className="segmented">
            <button
              className={`seg ${layoutMode === "auto" ? "seg-active" : ""}`}
              onClick={() => applyLayoutMode("auto")}
            >
              {t("settings.layoutAuto")}
            </button>
            <button
              className={`seg ${layoutMode === "desktop" ? "seg-active" : ""}`}
              onClick={() => applyLayoutMode("desktop")}
            >
              {t("settings.layoutDesktop")}
            </button>
            <button
              className={`seg ${layoutMode === "mobile" ? "seg-active" : ""}`}
              onClick={() => applyLayoutMode("mobile")}
            >
              {t("settings.layoutMobile")}
            </button>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.postView")}</span>
            <small>{t("settings.postViewDesc")}</small>
          </div>
          <div className="segmented">
            <button
              className={`seg ${postViewMode === "grid" ? "seg-active" : ""}`}
              onClick={() => applyPostViewMode("grid")}
            >
              {t("settings.gridBtn")}
            </button>
            <button
              className={`seg ${postViewMode === "list" ? "seg-active" : ""}`}
              onClick={() => applyPostViewMode("list")}
            >
              {t("settings.listBtn")}
            </button>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.noImage")}</span>
            <small>{t("settings.noImageDesc")}</small>
          </div>
          <button
            className={`btn ${noImageMode ? "btn-primary" : "btn-ghost"}`}
            onClick={() => toggleNoImageMode(!noImageMode)}
          >
            {noImageMode ? t("settings.noImageOn") : t("settings.noImageOff")}
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.proxy")}</span>
            <small>{t("settings.proxyDesc")}</small>
          </div>
          <button
            className={`btn ${proxyImages ? "btn-primary" : "btn-ghost"}`}
            onClick={() => toggleProxyImages(!proxyImages)}
          >
            {proxyImages ? t("settings.proxyOn") : t("settings.proxyOff")}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------ 投稿表示 (省データ) */}
      <div id="settings-post" className="settings-section">
        <div className="section-label">{t("settings.postTitle")}</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.fileList")}</span>
            <small>{t("settings.fileListDesc")}</small>
          </div>
          <button
            className={`btn ${postFileListMode ? "btn-primary" : "btn-ghost"}`}
            onClick={() => togglePostFileListMode(!postFileListMode)}
          >
            {postFileListMode ? t("settings.fileListOn") : t("settings.fileListOff")}
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.excludeAiTitle")}</span>
            <small>{t("settings.excludeAiDesc")}</small>
          </div>
          <button
            className={`btn ${excludeAiPosts ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={excludeAiPosts}
            onClick={() => toggleExcludeAiPosts(!excludeAiPosts)}
          >
            {excludeAiPosts ? t("settings.excludeAiOn") : t("settings.excludeAiOff")}
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.coverTitle")}</span>
            <small>{t("settings.coverDesc")}</small>
          </div>
          <button
            className={`btn ${excludeFanboxCover ? "btn-primary" : "btn-ghost"}`}
            onClick={() => toggleExcludeFanboxCover(!excludeFanboxCover)}
          >
            {excludeFanboxCover ? t("settings.coverOn") : t("settings.coverOff")}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------ 接続 */}
      <div id="settings-connection" className="settings-section">
        <div className="section-label">{t("settings.navConnection")}</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.timeout")}</span>
            <small>{t("settings.timeoutDesc")}</small>
          </div>
          <div className="segmented">
            {[10, 30, 60, 120].map((v) => (
              <button
                key={v}
                className={`seg ${timeoutSecs === v ? "seg-active" : ""}`}
                onClick={() => applyTimeoutSecs(v)}
              >
                {t("settings.seconds", { n: v })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ データ (バックアップ) */}
      <div id="settings-data" className="settings-section">
        <div className="section-label">{t("settings.backupSection")}</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.exportTitle")}</span>
            <small>{t("settings.exportDesc")}</small>
          </div>
          <button className="btn" onClick={doExportBackup}>
            {t("settings.export")}
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.importTitle")}</span>
            <small>{t("settings.importDesc")}</small>
          </div>
          <div className="settings-actions">
            <button className="btn" onClick={doImportFromClipboard}>
              {t("settings.importClipboard")}
            </button>
            <button className="btn" onClick={() => setShowBackupPaste((v) => !v)}>
              {t("settings.importPaste")}
            </button>
          </div>
        </div>

        {showBackupPaste && (
          <label className="field">
            <span>{t("settings.backupJson")}</span>
            <textarea
              rows={5}
              value={backupPaste}
              onChange={(e) => setBackupPaste(e.target.value)}
              placeholder={t("settings.pastePlaceholder")}
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
              {t("settings.importThis")}
            </button>
          </label>
        )}

        {backupResult && <span className="small">{backupResult}</span>}
      </div>

      {/* ------------------------------------------------ キャッシュ */}
      <div id="settings-cache" className="settings-section">
        <div className="section-label">{t("settings.storageTitle")}</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.creatorIndex")}</span>
            <small>
              {cache
                ? `${cache.count.toLocaleString()} 件 · ${fmtBytes(cache.bytes)} · ${t("settings.lastFetched")} ${fmtTs(cache.fetchedAt)}`
                : t("common.loading")}
            </small>
          </div>
          <button className="btn" onClick={doClearCache}>
            {t("settings.clear")}
          </button>
        </div>
        <div className="setting-subsection">
        <div className="section-label">{t("settings.iconTitle")}</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.creatorIcon")}</span>
            <small>
              {iconCache
                ? t("settings.iconInfo", { count: iconCache.count.toLocaleString(), size: fmtBytes(iconCache.bytes) })
                : t("common.loading")}
            </small>
          </div>
          <button className="btn" onClick={doClearIconCache}>
            {t("settings.clear")}
          </button>
        </div>
      </div>
      </div>

      {/* ------------------------------------------------ 診断 */}
      <div id="settings-diagnostics" className="settings-section">
        <div className="section-label">{t("settings.diagnostics")}</div>
        {DEBUG_DIAG && (
          <>
            <div className="setting-item">
              <div className="setting-text">
                <span>{t("settings.diagFlag")}</span>
                <small>{t("settings.diagFlagDesc")}</small>
              </div>
              <code className="small">DEBUG_DIAG=on</code>
            </div>
            <div className="setting-subsection">
              <div className="section-label">{t("settings.developerSessionTitle")}</div>
              <p className="small">{t("settings.developerSessionDesc")}</p>
              <label className="field">
                <span>{t("settings.sessionLabel")}</span>
                <input type="password" value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} placeholder={t("settings.sessionPlaceholder")} autoComplete="off" />
                <small>{t("settings.sessionHelp")}</small>
              </label>
              <div className="settings-actions">
                <button className="btn" onClick={testSession}>{t("settings.testSession")}</button>
                <button className="btn btn-primary" onClick={save}>{t("settings.save")}</button>
                {saved && <span className="ok">{t("settings.saved")}</span>}
                {testResult && <span className="small" role="status">{testResult}</span>}
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-text">
                <span>{t("settings.logFolder")}</span>
                <small>{t("settings.logFolderDesc")}</small>
              </div>
              <button className="btn" onClick={() => debugOpenLogFolder().then((p) => setLogResult(t("settings.folderResult", { path: p }))).catch((e) => setLogResult(t("settings.failedMsg", { msg: e instanceof Error ? e.message : String(e) })))}>{t("settings.open")}</button>
            </div>
            <div className="setting-item">
              <div className="setting-text">
                <span>{t("settings.backupDump")}</span>
                <small>{t("settings.backupDumpDesc")}</small>
              </div>
              <button className="btn" onClick={() => {
                logLong("info", "DEBUG BACKUP DUMP (manual dump):\\n" + buildBackup())
                setLogResult(t("settings.dumped"))
              }}>{t("settings.dump")}</button>
            </div>
          </>
        )}


        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.logTitle")}</span>
            <small>{t("settings.logDesc", { count: logCount })}</small>
          </div>
          <div className="settings-actions">
            <button className="btn" onClick={showLog}>
              {t("settings.show")}
            </button>
            <button className="btn" onClick={exportLog}>
              {t("settings.export")}
            </button>
            <button
              className="btn"
              onClick={() => {
                clearLog()
                setLogText(null)
                setLogResult(t("settings.logCleared"))
              }}
            >
              {t("settings.clear")}
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
      <div id="settings-info" className="settings-section">
        <div className="section-label">{t("settings.info")}</div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.serverVersion")}</span>
          </div>
          <div className="settings-actions">
            <button className="btn" onClick={showVersion}>
              {t("settings.check")}
            </button>
            {version && <code className="small">{version}</code>}
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.platform")}</span>
          </div>
          <code className="small">{getPlatformName()}</code>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.appVersion")}</span>
          </div>
          <code className="small">{appVersion ? displayAppVersion(appVersion) : "…"}</code>
        </div>

        <p className="small">
          {t("settings.aboutNote")}
        </p>
      </div>
    </div>
  )
}
