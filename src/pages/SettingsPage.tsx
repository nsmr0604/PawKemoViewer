import { getApplication } from "../application/composition"
import { lazy, Suspense, useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { getSettings, updateSettings, api, apiStatus, SETTINGS_CHANGED_EVENT } from "../api"
import { getThumbnailCacheLimit, THUMBNAIL_CACHE_LIMITS, trimThumbnailCache } from "../post-thumbnail-cache"
import { clearCreatorCache, creatorCacheInfo, CreatorCacheInfo } from "../db"
import {
  getLogEntries,
  clearLog,
  formatLog,
  logInfo,
} from "../log"
import { DEBUG_DIAG } from "../build-flags"
import { navigate, goBack } from "../router"
import { activateAccount } from "../account-action"
import type { ResolvedLayout } from "../platform/environment"
import { Toggle } from "../components/Toggle"
import { BrowserLink } from "../components/BrowserLink"
import { privacyUrl, termsUrl } from "../legal"
import { getPlatformName, type LayoutMode } from "../platform/environment"
import { applyBackup, buildBackup, MAX_BACKUP_BYTES } from "../backup"
import { stripSessionFromBackup } from "../domain/backup-secrets"
import { clearIconCache, creatorIconInfo } from "../icons"
import {
  t,
  loadLocale,
  availableLocales,
  secondaryLocaleFolder,
  invalidLocaleFiles,
  type Locale,
  type LocaleInfo,
} from "../i18n"
import { displayAppVersion } from "../version"
import { getPlatformRuntime } from "../platform/runtime"
import { applyHttpUserAgent, type UserAgentMode } from "../http-user-agent"
const DeveloperLocaleDiagnostics = DEBUG_DIAG ? lazy(() => import("../components/DeveloperLocaleDiagnostics").then((module) => ({ default: module.DeveloperLocaleDiagnostics }))) : null
const DeveloperFullDiagnostics = DEBUG_DIAG ? lazy(() => import("../components/DeveloperFullDiagnostics").then((module) => ({ default: module.DeveloperFullDiagnostics }))) : null

const DeveloperSessionTools = lazy(() => import("../components/DeveloperDiagnostics").then((module) => ({ default: module.DeveloperDiagnostics })))
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

export function SettingsPage({ layout, section }: { layout: ResolvedLayout; section: string | null }) {
  const s = getSettings()
  const [thumbnailCacheLimit, setThumbnailCacheLimit] = useState(getThumbnailCacheLimit)
  const { descriptor: platform, services } = getPlatformRuntime()
  const appDirectory = services.userFiles?.appDirectory
  const mobileFolderLabel = t(platform.os === "ios" ? "settings.appFilesIos" : "settings.appFilesAndroid")
  const secondaryFolder = secondaryLocaleFolder()
  const folderLabel = secondaryFolder && platform.isNative && platform.os === "ios"
    ? t("settings.localeFolderIos")
    : secondaryFolder.replace(/^.*\/(Android\/data\/)/, "$1")

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
  const [loginStatus, setLoginStatus] = useState<"checking" | "loggedIn" | "loggedOut" | "unknown">(s.sessionKey ? "checking" : "loggedOut")
  const [developerToolsEnabled, setDeveloperToolsEnabled] = useState(s.developerToolsEnabled || false)
  const [version, setVersion] = useState<string>("")
  const [appVersion, setAppVersion] = useState<string>("")
  const [cache, setCache] = useState<CreatorCacheInfo | null>(null)
  const [logText, setLogText] = useState<string | null>(null)
  const [logResult, setLogResult] = useState<string | null>(null)
  const [timeoutSecs, setTimeoutSecsState] = useState<number>(s.timeoutSecs || 30)
  const [userAgentMode, setUserAgentModeState] = useState<UserAgentMode>(s.userAgentMode || "device")
  const [backupResult, setBackupResult] = useState<string | null>(null)
  const [backupPaste, setBackupPaste] = useState("")
  const [showBackupPaste, setShowBackupPaste] = useState(false)
  const [localeList, setLocaleList] = useState<LocaleInfo[]>(() => availableLocales())
  const [filePickerBusy, setFilePickerBusy] = useState(false)
  const [localeFolderResult, setLocaleFolderResult] = useState<string | null>(null)

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(t("settings.loadFailed")))
    creatorCacheInfo().then(setCache).catch(() => setCache(null))
    creatorIconInfo().then(setIconCache).catch(() => setIconCache(null))
  }, [])

  // 保存済みセッションを検証し、セッション変更後も表示を更新する。
  useEffect(() => {
    let active = true
    let lastSessionKey = getSettings().sessionKey
    const verifySession = (force = false) => {
      const sessionKey = getSettings().sessionKey
      if (!force && sessionKey === lastSessionKey) return
      lastSessionKey = sessionKey
      if (!sessionKey) {
        setLoginStatus("loggedOut")
        return
      }
      setLoginStatus("checking")
      api.accountFavorites("artist", sessionKey, false).then(() => {
        if (active && getSettings().sessionKey === sessionKey) setLoginStatus("loggedIn")
      }).catch((e) => {
        if (!active || getSettings().sessionKey !== sessionKey) return
        setLoginStatus(apiStatus(e) === 401 ? "loggedOut" : "unknown")
      })
    }
    verifySession(true)
    const onSettingsChanged = () => verifySession()
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged)
    return () => {
      active = false
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged)
    }
  }, [])

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
    await getApplication().refreshLocales()
    setLocaleList(availableLocales())
    // 外部の ja.json 等を反映させるため、現在の言語を読み直す
    await applyLocale(locale)
  }

  const syncLocaleFolder = async () => {
    if (filePickerBusy) return
    setFilePickerBusy(true)
    setLocaleFolderResult(null)
    try {
      let exported = false
      try {
        exported = await getApplication().exportLocaleToFolder(locale)
      } finally {
        await reloadLocales()
      }
      setLocaleFolderResult(t(exported ? "settings.localeFolderExported" : "settings.localeFolderUpdated"))
    } catch (error) {
      setLocaleFolderResult(t("settings.failedMsg", { msg: error instanceof Error ? error.message : String(error) }))
    } finally {
      setFilePickerBusy(false)
    }
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

  const applyUserAgentMode = (mode: UserAgentMode) => {
    setUserAgentModeState(mode)
    updateSettings({ userAgentMode: mode })
    void applyHttpUserAgent()
  }

  const describeExportPath = (path: string, inAppFolder: boolean) => {
    if (!inAppFolder) return path
    return platform.os === "ios" ? `${mobileFolderLabel} / ${path}` : path.replace(/^.*\/(Android\/data\/)/, "$1")
  }

  const saveUserFile = async (purpose: "backup" | "log", filename: string, text: string, chooseLocation: boolean) => {
    if (appDirectory && !chooseLocation) return appDirectory.save(purpose, filename, text)
    if (services.userFiles) return services.userFiles.save(purpose, filename, text)
    if (!services.files) throw new Error("File export service unavailable")
    return { kind: "saved" as const, path: await services.files.exportText(filename, text) }
  }

  const doExportBackup = async (chooseLocation = false) => {
    if (filePickerBusy) return
    setFilePickerBusy(true)
    setBackupResult(null)
    try {
      const json = await buildBackup()
      if (new TextEncoder().encode(json).length > MAX_BACKUP_BYTES) {
        throw new Error(t("settings.backupTooLarge"))
      }
      const result = await saveUserFile("backup", "pawkemoviewer-backup.json", json, chooseLocation)
      if (result.kind === "cancelled") return

      let clip = ""
      try {
        // sessionKey は資格情報なのでクリップボードへは渡さない
        if (await services.clipboard?.writeText(stripSessionFromBackup(json))) clip = t("settings.clipCopied")
      } catch {
        /* ファイル保存の結果を優先する */
      }
      setBackupResult(result.path
        ? t("settings.exported", { path: describeExportPath(result.path, Boolean(appDirectory && !chooseLocation)), clip })
        : t("settings.backupSaved", { clip }))
      logInfo("バックアップを書き出しました")
    } catch (e) {
      setBackupResult(t("settings.exportFailed", { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setFilePickerBusy(false)
    }
  }

  const doImportBackupFile = async (file?: File, fromAppFolder = false) => {
    if (filePickerBusy || (!file && !services.userFiles)) return
    setFilePickerBusy(true)
    setBackupResult(null)
    try {
      if (file) {
        if (file.size > MAX_BACKUP_BYTES) throw new Error(t("settings.backupTooLarge"))
        await doImport(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()))
      } else {
        const result = fromAppFolder ? await appDirectory?.openBackup() : await services.userFiles?.open("backup")
        if (result?.kind === "missing") setBackupResult(t("settings.backupMissing"))
        if (result?.kind === "selected") await doImport(result.json)
      }
    } catch (e) {
      setBackupResult(t("settings.importFailed", { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setFilePickerBusy(false)
    }
  }

  const doImportFromClipboard = async () => {
    const text = await getPlatformRuntime().services.clipboard?.readText()
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

  const doClearCache = async () => {
    await clearCreatorCache()
    setCache({ count: 0, bytes: 0, fetchedAt: undefined })
    logInfo("クリエイターキャッシュを消去しました")
  }

  const showLog = () => setLogText(formatLog() || t("settings.noLog"))

  const exportLog = async (chooseLocation = false) => {
    if (filePickerBusy) return
    setFilePickerBusy(true)
    setLogResult(null)
    try {
      const result = await saveUserFile("log", "pawkemoviewer-log.txt", formatLog(), chooseLocation)
      if (result.kind === "saved") {
        setLogResult(result.path
          ? t("settings.exported", { path: describeExportPath(result.path, Boolean(appDirectory && !chooseLocation)), clip: "" })
          : t("settings.logSaved"))
      }
    } catch (e) {
      setLogResult(t("settings.exportFailed", { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setFilePickerBusy(false)
    }
  }

  const showVersion = async () => {
    try {
      setVersion(await api.version())
    } catch {
      setVersion(t("settings.loadFailed"))
    }
  }

  const showDiagnostics = DEBUG_DIAG || developerToolsEnabled
  const logCount = showDiagnostics ? getLogEntries().length : 0

  const categories = [
    ["display", t("settings.displayTitle")],
    ["post", t("settings.postTitle")],
    ["language", t("settings.languageTitle")],
    ["connection", t("settings.navConnection")],
    ["data", t("settings.navBackup")],
    ["cache", t("settings.navStorage")],
    ["account", t("settings.accountTitle")],
    ["info", t("settings.info")],
    ...(showDiagnostics ? [["diagnostics", t("settings.diagnostics")]] : []),
  ]
  const mobile = layout === "mobile"
  const validSection = categories.some(([id]) => id === section) ? section : null
  const activeSection = validSection ?? (mobile ? null : "display")

  useEffect(() => {
    if (!validSection) return
    window.scrollTo(0, 0)
    document.getElementById(`settings-${validSection}`)?.focus({ preventScroll: true })
  }, [validSection, activeSection])

  return (
    <div className="page settings">
      <h1 className="page-title">{t("settings.title")}</h1>
      {mobile && activeSection && (
        <button className="btn btn-ghost settings-back" onClick={() => {
          goBack("/settings", "/settings")
          window.scrollTo(0, 0)
        }}>
          <span aria-hidden="true">←</span> {t("settings.sections")}
        </button>
      )}
      <div className="settings-layout">
        {(!mobile || !activeSection) && (
          <nav className="settings-nav" aria-label={t("settings.sections")}>
            {categories.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={activeSection === id ? "page" : undefined}
                onClick={() => navigate(`/settings?section=${id}`, !mobile && validSection !== null)}
              >
                {label}
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </nav>
        )}
        <div className="settings-panels" hidden={!activeSection}>
      {/* ------------------------------------------------ アカウント */}
      <div id="settings-account" className="settings-section" tabIndex={-1} hidden={activeSection !== "account"}>
        <h2 className="section-label">{t("settings.accountTitle")}</h2>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={() => activateAccount("/settings?section=account")}>
            {s.sessionKey ? s.accountId || t("nav.accountIdUnknown") : t("settings.loginButton")}
          </button>
          <small className="small">{t(s.sessionKey ? "nav.logoutHint" : "settings.loginHint")}</small>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.loginStatus")}</span>
            <small>{t("settings.loginStatusDesc")}</small>
          </div>
          <span className={loginStatus === "loggedIn" ? "ok" : "small"} role="status" aria-live="polite">
            {loginStatus === "checking" ? t("settings.loginStatus.checking") : loginStatus === "loggedIn" ? t("settings.loginStatus.loggedIn") : loginStatus === "loggedOut" ? t("settings.loginStatus.loggedOut") : t("settings.loginStatus.unknown")}
          </span>
        </div>

      </div>

      {/* ------------------------------------------------ 表示 */}
      <div id="settings-display" className="settings-section" tabIndex={-1} hidden={activeSection !== "display"}>
        <h2 className="section-label">{t("settings.displayTitle")}</h2>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.theme")}</span>
            <small>{t("settings.themeDesc")}</small>
          </div>
          <div className="segmented">
            <button
              className={`seg ${theme === "dark" ? "seg-active" : ""}`}
              aria-pressed={theme === "dark"}
              onClick={() => applyTheme("dark")}
            >
              {t("settings.themeDark")}
            </button>
            <button
              className={`seg ${theme === "light" ? "seg-active" : ""}`}
              aria-pressed={theme === "light"}
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
              aria-pressed={layoutMode === "auto"}
              onClick={() => applyLayoutMode("auto")}
            >
              {t("settings.layoutAuto")}
            </button>
            <button
              className={`seg ${layoutMode === "desktop" ? "seg-active" : ""}`}
              aria-pressed={layoutMode === "desktop"}
              onClick={() => applyLayoutMode("desktop")}
            >
              {t("settings.layoutDesktop")}
            </button>
            <button
              className={`seg ${layoutMode === "mobile" ? "seg-active" : ""}`}
              aria-pressed={layoutMode === "mobile"}
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
              aria-pressed={postViewMode === "grid"}
              onClick={() => applyPostViewMode("grid")}
            >
              {t("settings.gridBtn")}
            </button>
            <button
              className={`seg ${postViewMode === "list" ? "seg-active" : ""}`}
              aria-pressed={postViewMode === "list"}
              onClick={() => applyPostViewMode("list")}
            >
              {t("settings.listBtn")}
            </button>
          </div>
        </div>



      </div>

      <div id="settings-language" className="settings-section" tabIndex={-1} hidden={activeSection !== "language"}>
        <h2 className="section-label">{t("settings.languageTitle")}</h2>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.language")}</span>
            <small>{t("settings.languageDesc")}</small>
          </div>
          <select
            aria-label={t("settings.language")}
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
            <small>{folderLabel || t("settings.localeFolderUnavailable")}</small>
            {folderLabel && <small>{t("settings.localeFolderSyncDesc")}</small>}
            {invalidLocaleFiles().length > 0 && (
              <small>{t("settings.localeInvalid", { files: invalidLocaleFiles().join(", ") })}</small>
            )}
          </div>
          {folderLabel && (
            <button className="btn" disabled={filePickerBusy} onClick={() => void syncLocaleFolder()}>
              {t("settings.localeFolderSync")}
            </button>
          )}
        </div>
        {localeFolderResult && <span className="small" role="status">{localeFolderResult}</span>}
      </div>

      {/* ------------------------------------------------ 投稿表示 (省データ) */}
      <div id="settings-post" className="settings-section" tabIndex={-1} hidden={activeSection !== "post"}>
        <h2 className="section-label">{t("settings.postTitle")}</h2>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.fileList")}</span>
            <small>{t("settings.fileListDesc")}</small>
          </div>
          <Toggle
            checked={postFileListMode}
            onChange={togglePostFileListMode}
            label={t("settings.fileList")}
            onLabel={t("settings.fileListOn")}
            offLabel={t("settings.fileListOff")}
          />
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.excludeAiTitle")}</span>
            <small>{t("settings.excludeAiDesc")}</small>
          </div>
          <Toggle
            checked={excludeAiPosts}
            onChange={toggleExcludeAiPosts}
            label={t("settings.excludeAiTitle")}
            onLabel={t("settings.excludeAiOn")}
            offLabel={t("settings.excludeAiOff")}
          />
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.coverTitle")}</span>
            <small>{t("settings.coverDesc")}</small>
          </div>
          <Toggle
            checked={excludeFanboxCover}
            onChange={toggleExcludeFanboxCover}
            label={t("settings.coverTitle")}
            onLabel={t("settings.coverOn")}
            offLabel={t("settings.coverOff")}
          />
        </div>
      </div>

      {/* ------------------------------------------------ 接続 */}
      <div id="settings-connection" className="settings-section" tabIndex={-1} hidden={activeSection !== "connection"}>
        <h2 className="section-label">{t("settings.navConnection")}</h2>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.noImage")}</span>
            <small>{t("settings.noImageDesc")}</small>
          </div>
          <Toggle
            checked={noImageMode}
            onChange={toggleNoImageMode}
            label={t("settings.noImage")}
            onLabel={t("settings.noImageOn")}
            offLabel={t("settings.noImageOff")}
          />
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.proxy")}</span>
            <small>{t("settings.proxyDesc")}</small>
          </div>
          <Toggle
            checked={proxyImages}
            onChange={toggleProxyImages}
            label={t("settings.proxy")}
            onLabel={t("settings.proxyOn")}
            offLabel={t("settings.proxyOff")}
          />
        </div>


        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.userAgent")}</span>
            <small>{t("settings.userAgentDesc")}</small>
          </div>
          <div className="segmented">
            {(["device", "app", "desktop"] as const).map((mode) => (
              <button
                key={mode}
                className={`seg ${userAgentMode === mode ? "seg-active" : ""}`}
                onClick={() => applyUserAgentMode(mode)}
              >
                {t(`settings.userAgent_${mode}`)}
              </button>
            ))}
          </div>
        </div>

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
      <div id="settings-data" className="settings-section" tabIndex={-1} hidden={activeSection !== "data"}>
        <h2 className="section-label">{t("settings.backupSection")}</h2>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.exportTitle")}</span>
            <small>{appDirectory ? t("settings.backupDefaultDesc", { path: mobileFolderLabel }) : t("settings.exportDesc")}</small>
          </div>
          <div className="settings-actions">
            {appDirectory && (
              <button className="btn" disabled={filePickerBusy} onClick={() => void doExportBackup()}>
                {t("settings.backupDefaultSave")}
              </button>
            )}
            <button className="btn" disabled={filePickerBusy} onClick={() => void doExportBackup(true)}>
              {t(appDirectory ? "settings.chooseOtherDestination" : "settings.backupSave")}
            </button>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.importTitle")}</span>
            <small>{t("settings.importDesc")}</small>
          </div>
          <div className="settings-actions">
            {appDirectory && (
              <button className="btn" disabled={filePickerBusy} onClick={() => void doImportBackupFile(undefined, true)}>
                {t("settings.backupOpenDefault")}
              </button>
            )}
            {services.userFiles ? (
              <button className="btn" disabled={filePickerBusy} onClick={() => void doImportBackupFile()}>
                {t(appDirectory ? "settings.backupOpenOther" : "settings.backupOpen")}
              </button>
            ) : (
              <label className="field">
                <span>{t("settings.backupOpen")}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={filePickerBusy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ""
                    if (file) void doImportBackupFile(file)
                  }}
                />
              </label>
            )}
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
      <div id="settings-cache" className="settings-section" tabIndex={-1} hidden={activeSection !== "cache"}>
        <h2 className="section-label">{t("settings.storageTitle")}</h2>

        <label className="setting-item">
          <span className="setting-text">
            <span>{t("settings.thumbnailCacheLimit")}</span>
            <small>{t("settings.thumbnailCacheLimitDesc")}</small>
          </span>
          <select className="locale-select" value={thumbnailCacheLimit} onChange={(event) => {
            const limit = Number(event.target.value)
            updateSettings({ thumbnailCacheLimit: limit })
            setThumbnailCacheLimit(limit)
            void trimThumbnailCache()
          }}>
            {THUMBNAIL_CACHE_LIMITS.map((limit) =>
              <option key={limit} value={limit}>{limit.toLocaleString(locale)}</option>)}
          </select>
        </label>

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

      {/* ------------------------------------------------ 情報 */}
      <div id="settings-info" className="settings-section" tabIndex={-1} hidden={activeSection !== "info"}>
        <h2 className="section-label">{t("settings.info")}</h2>

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

        {!DEBUG_DIAG && (
          <div className="setting-item">
            <div className="setting-text">
              <span>{t("settings.developerTools")}</span>
              <small>{t("settings.developerToolsDesc")}</small>
            </div>
            <Toggle
              checked={developerToolsEnabled}
              onChange={(next) => {
                setDeveloperToolsEnabled(next)
                updateSettings({ developerToolsEnabled: next })
                if (!next) {
                  setLogText(null)
                  setLogResult(null)
                }
              }}
              label={t("settings.developerTools")}
              onLabel={t("settings.developerToolsOn")}
              offLabel={t("settings.developerToolsOff")}
            />
          </div>
        )}

        <p className="small">
          {t("settings.aboutNote")}
        </p>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("legal.section")}</span>
            <small>{t("legal.unofficial")}</small>
          </div>
          <div className="settings-actions">
            <BrowserLink className="btn" href={termsUrl()}>
              {t("legal.terms")}
            </BrowserLink>
            <BrowserLink className="btn" href={privacyUrl()}>
              {t("legal.privacy")}
            </BrowserLink>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("legal.age")}</span>
            <small>{t("legal.ageVerified")}</small>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => updateSettings({ ageVerified: false })}
          >
            {t("legal.resetAge")}
          </button>
        </div>
      </div>
      {showDiagnostics && (
        <div id="settings-diagnostics" className="settings-section" tabIndex={-1} hidden={activeSection !== "diagnostics"}>
          <h2 className="section-label">{t("settings.diagnostics")}</h2>

          <div className="setting-item">
            <div className="setting-text">
              <span>{t("settings.logTitle")}</span>
              <small>{t("settings.logDesc", { count: logCount })}</small>
              <small>{appDirectory ? t("settings.logDefaultDesc", { path: mobileFolderLabel }) : t("settings.logSaveDesc")}</small>
            </div>
            <div className="settings-actions">
              <button className="btn" onClick={showLog}>
                {t("settings.show")}
              </button>
              {appDirectory && (
                <button className="btn" disabled={filePickerBusy} onClick={() => void exportLog()}>
                  {t("settings.logDefaultSave")}
                </button>
              )}
              <button className="btn" disabled={filePickerBusy} onClick={() => void exportLog(true)}>
                {t(appDirectory ? "settings.chooseOtherDestination" : "settings.logSave")}
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

          <Suspense fallback={<span className="small">{t("common.loading")}</span>}>
            <DeveloperSessionTools />
          </Suspense>

          {DEBUG_DIAG && DeveloperFullDiagnostics && (
            <Suspense fallback={<span className="small">{t("common.loading")}</span>}>
              <DeveloperFullDiagnostics />
            </Suspense>
          )}
          {DEBUG_DIAG && DeveloperLocaleDiagnostics && activeSection === "diagnostics" && (
            <Suspense fallback={null}>
              <DeveloperLocaleDiagnostics {...{ locale, localeList, reloadLocales, filePickerBusy, setFilePickerBusy }} />
            </Suspense>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
