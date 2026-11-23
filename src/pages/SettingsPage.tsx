import { getApplication } from "../application/composition"
import { lazy, Suspense, useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { getSettings, updateSettings, api, apiStatus } from "../api"
import { clearCreatorCache, creatorCacheInfo, CreatorCacheInfo } from "../db"
import {
  getLogEntries,
  clearLog,
  formatLog,
  logInfo,
} from "../log"
import { DEBUG_DIAG } from "../build-flags"
import { navigate } from "../router"
import { Toggle } from "../components/Toggle"
import { getPlatformName, type LayoutMode } from "../platform/environment"
import { applyBackup, buildBackup, MAX_BACKUP_BYTES } from "../backup"
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

export function SettingsPage() {
  const s = getSettings()
  const localeUseCases = getApplication().locales
  const { descriptor: platform, services } = getPlatformRuntime()
  const supportsSecondaryLocale = platform.family === "desktop"
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
  const [backupResult, setBackupResult] = useState<string | null>(null)
  const [backupPaste, setBackupPaste] = useState("")
  const [showBackupPaste, setShowBackupPaste] = useState(false)
  const [localeList, setLocaleList] = useState<LocaleInfo[]>(() => availableLocales())
  const [jsonPickerBusy, setJsonPickerBusy] = useState(false)
  const [localeMsg, setLocaleMsg] = useState<string | null>(null)
  const [localeAddOpen, setLocaleAddOpen] = useState(false)
  const [localeAddCode, setLocaleAddCode] = useState("")
  const [localeAddJson, setLocaleAddJson] = useState("")

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
        if (active) setLoginStatus("loggedIn")
      }).catch((e) => {
        if (!active) return
        setLoginStatus(apiStatus(e) === 401 ? "loggedOut" : "unknown")
      })
    }
    verifySession(true)
    const onSettingsChanged = () => verifySession()
    window.addEventListener("pawkemo-settings-changed", onSettingsChanged)
    return () => {
      active = false
      window.removeEventListener("pawkemo-settings-changed", onSettingsChanged)
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

  const addLocale = async () => {
    let code: string
    try {
      const result = await getApplication().locales.addLocale(localeAddCode, localeAddJson)
      if (result.kind !== "saved") {
        setLocaleMsg(t(result.kind === "invalid-code" ? "settings.localeBadCode" : "settings.localeBadJson"))
        return
      }
      code = result.code
    } catch (e) {
      setLocaleMsg(t("settings.failedMsg", { msg: e instanceof Error ? e.message : String(e) }))
      return
    }
    await getApplication().refreshLocales()
    setLocaleList(availableLocales())
    setLocaleAddCode("")
    setLocaleAddJson("")
    setLocaleAddOpen(false)
    setLocaleMsg(t("settings.localeAdded", { code }))
    await applyLocale(locale)
  }

  const importLocaleFiles = async (files: FileList | null, target: "private" | "secondary" = "private") => {
    if (!files?.length) return
    const result = await getApplication().locales.importLocaleFiles(files, target)
    if (result.kind === "unavailable") {
      setLocaleMsg(target === "secondary"
        ? "共有領域への言語ファイル書き込みはこのプラットフォームでは未対応です"
        : t("settings.failedMsg", { msg: "Locale service unavailable" }))
      return
    }
    const { imported, failures } = result
    const suffix = { code: "", size: " (1 MiB超過)", json: " (JSON形式不正)", write: " (保存失敗)" }
    const skipped = failures.map(({ name, reason }) => name + suffix[reason]).join(", ")
    await getApplication().refreshLocales()
    setLocaleList(availableLocales())
    if (target === "secondary") {
      setLocaleMsg(failures.length ? `共有領域へ保存: ${imported}; スキップ: ${skipped}` : `共有領域へ ${imported} 件保存しました`)
    } else {
      setLocaleMsg(failures.length ? `インポート数: ${imported}; スキップ: ${skipped}` : `Imported ${imported} 件の言語ファイル`)
    }
    await applyLocale(locale)
  }

  const useLocalePicker = async (operation: "import" | "export" | "export-to-app") => {
    if (jsonPickerBusy) return
    setJsonPickerBusy(true)
    try {
      if (operation === "import") {
        const result = await localeUseCases.pickLocale()
        switch (result.kind) {
          case "cancelled": break
          case "invalid-code": setLocaleMsg(t("settings.localeBadCode")); break
          case "invalid-json": setLocaleMsg(t("settings.localeBadJson")); break
          case "conflict": setLocaleMsg(t("settings.localePickerConflict", { code: result.code })); break
          case "saved":
            await reloadLocales()
            setLocaleMsg(t("settings.localeAdded", { code: result.code }))
            break
        }
      } else {
        const result = await localeUseCases.exportPrivateLocale(locale, operation === "export-to-app" ? "app" : "picker")
        if (result.kind === "missing") setLocaleMsg(t("settings.localePickerMissing"))
        if (result.kind === "invalid-json") setLocaleMsg(t("settings.localeBadJson"))
        if (result.kind === "saved") {
          if (operation === "export-to-app") await reloadLocales()
          const path = result.path && operation === "export-to-app" && platform.os === "ios"
            ? `${t("settings.localeFolderIos")} / ${result.path}`
            : result.path
          setLocaleMsg(path ? t("settings.localePickerSavedTo", { path }) : t("settings.localePickerSaved"))
        }
      }
    } catch (error) {
      setLocaleMsg(t("settings.failedMsg", { msg: error instanceof Error ? error.message : String(error) }))
    } finally {
      setJsonPickerBusy(false)
    }
  }

  const deleteLocale = async (code: string) => {
    if (!window.confirm(t("settings.localeDeleteConfirm", { code }))) return
    try {
      await getApplication().locales.deleteLocale(code)
    } catch (e) {
      setLocaleMsg(t("settings.failedMsg", { msg: e instanceof Error ? e.message : String(e) }))
      return
    }
    await getApplication().refreshLocales()
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
    if (jsonPickerBusy) return
    setJsonPickerBusy(true)
    setBackupResult(null)
    try {
      const json = await buildBackup()
      if (new TextEncoder().encode(json).length > MAX_BACKUP_BYTES) {
        throw new Error(t("settings.backupTooLarge"))
      }
      const filename = "pawkemoviewer-backup.json"
      if (!services.jsonFiles && !services.files) throw new Error("File export service unavailable")
      const result = services.jsonFiles
        ? await services.jsonFiles.save("backup", filename, json)
        : { kind: "saved" as const, path: await services.files?.exportText(filename, json) }
      if (result.kind === "cancelled") return

      let clip = ""
      try {
        if (await services.clipboard?.writeText(json)) clip = t("settings.clipCopied")
      } catch {
        /* ファイル保存の結果を優先する */
      }
      setBackupResult(result.path
        ? t("settings.exported", { path: result.path, clip })
        : t("settings.backupSaved", { clip }))
      logInfo("バックアップを書き出しました")
    } catch (e) {
      setBackupResult(t("settings.exportFailed", { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setJsonPickerBusy(false)
    }
  }

  const doImportBackupFile = async (file?: File) => {
    if (jsonPickerBusy || (!file && !services.jsonFiles)) return
    setJsonPickerBusy(true)
    setBackupResult(null)
    try {
      if (file) {
        if (file.size > MAX_BACKUP_BYTES) throw new Error(t("settings.backupTooLarge"))
        await doImport(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()))
      } else {
        const result = await services.jsonFiles?.open("backup")
        if (result?.kind === "selected") await doImport(result.json)
      }
    } catch (e) {
      setBackupResult(t("settings.importFailed", { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setJsonPickerBusy(false)
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

  const exportLog = async () => {
    try {
      const files = getPlatformRuntime().services.files
      if (!files) throw new Error("File export service unavailable")
      const path = await files.exportText("pawchive-log.txt", formatLog())
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

  const showDiagnostics = DEBUG_DIAG || developerToolsEnabled
  const logCount = showDiagnostics ? getLogEntries().length : 0

  return (
    <div className="page settings">
      <h1 className="page-title">{t("settings.title")}</h1>
      <p className="settings-intro">{t("settings.intro")}</p>

      <nav className="settings-nav" aria-label={t("settings.sections")}>
        {[
          ["settings-account", t("settings.accountTitle")],
          ["settings-display", t("settings.displayTitle")],
          ["settings-post", t("settings.postTitle")],
          ["settings-connection", t("settings.navConnection")],
          ["settings-data", t("settings.navBackup")],
          ["settings-cache", t("settings.navStorage")],
          ["settings-info", t("settings.info")],
          ...(showDiagnostics ? [["settings-diagnostics", t("settings.diagnostics")]] : []),
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              const section = document.getElementById(id)
              section?.focus({ preventScroll: true })
              section?.scrollIntoView({ block: "start" })
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------ アカウント */}
      <div id="settings-account" className="settings-section" tabIndex={-1}>
        <h2 className="section-label">{t("settings.accountTitle")}</h2>

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
            {loginStatus === "checking" ? t("settings.loginStatus.checking") : loginStatus === "loggedIn" ? t("settings.loginStatus.loggedIn") : loginStatus === "loggedOut" ? t("settings.loginStatus.loggedOut") : t("settings.loginStatus.unknown")}
          </span>
        </div>

      </div>

      {/* ------------------------------------------------ 表示 */}
      <div id="settings-display" className="settings-section" tabIndex={-1}>
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
            <small>{folderLabel || "-"}</small>
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
        {supportsSecondaryLocale && (
          <div className="setting-item">
            <div className="setting-text">
              <span>共有領域へ言語JSONをインポート</span>
              <small>Desktop: Documents/Pawchive/languages に保存し、アプリ専用ファイルとは分離します。</small>
            </div>
            <label className="btn">
              共有ファイル選択
              <input type="file" accept=".json,application/json" multiple hidden onChange={(e) => { void importLocaleFiles(e.target.files, "secondary"); e.currentTarget.value = "" }} />
            </label>
          </div>
        )}

        <div className="setting-item">
          <div className="setting-text">
            <span>言語JSONファイルをインポート</span>
            <small>{localeUseCases.canPickLocale ? t("settings.localePickerImportDesc") : "端末からJSONファイルを複数選択できます。検証後、アプリ専用領域へコピーします。"}</small>
          </div>
          {localeUseCases.canPickLocale ? (
            <button className="btn" disabled={jsonPickerBusy} onClick={() => void useLocalePicker("import")}>
              {t("settings.localePickerOpen")}
            </button>
          ) : (
            <label className="btn">
              ファイル選択
              <input type="file" accept=".json,application/json" multiple hidden onChange={(e) => { void importLocaleFiles(e.target.files); e.currentTarget.value = "" }} />
            </label>
          )}
        </div>

        {localeUseCases.canPickLocale && (
          <div className="setting-item">
            <div className="setting-text">
              <span>{t("settings.localePickerExport")}</span>
              <small>{t("settings.localePickerExportDesc")}</small>
            </div>
            <button className="btn" disabled={jsonPickerBusy} onClick={() => void useLocalePicker("export")}>
              {t("settings.localePickerSave")}
            </button>
          </div>
        )}

        {localeUseCases.canSaveLocaleToAppDirectory && (
          <div className="setting-item">
            <div className="setting-text">
              <span>{t("settings.localePickerAppFolder")}</span>
              <small>{t(platform.os === "ios" ? "settings.localePickerAppFolderDescIos" : "settings.localePickerAppFolderDesc")}</small>
            </div>
            <button className="btn" disabled={jsonPickerBusy} onClick={() => void useLocalePicker("export-to-app")}>
              {t("settings.localePickerSave")}
            </button>
          </div>
        )}

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
      </div>

      {/* ------------------------------------------------ 投稿表示 (省データ) */}
      <div id="settings-post" className="settings-section" tabIndex={-1}>
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
      <div id="settings-connection" className="settings-section" tabIndex={-1}>
        <h2 className="section-label">{t("settings.navConnection")}</h2>

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
      <div id="settings-data" className="settings-section" tabIndex={-1}>
        <h2 className="section-label">{t("settings.backupSection")}</h2>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.exportTitle")}</span>
            <small>{t("settings.exportDesc")}</small>
          </div>
          <button className="btn" disabled={jsonPickerBusy} onClick={doExportBackup}>
            {t("settings.export")}
          </button>
        </div>

        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.importTitle")}</span>
            <small>{t("settings.importDesc")}</small>
          </div>
          <div className="settings-actions">
            {services.jsonFiles ? (
              <button className="btn" disabled={jsonPickerBusy} onClick={() => void doImportBackupFile()}>
                {t("settings.backupOpen")}
              </button>
            ) : (
              <label className="field">
                <span>{t("settings.backupOpen")}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={jsonPickerBusy}
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
      <div id="settings-cache" className="settings-section" tabIndex={-1}>
        <h2 className="section-label">{t("settings.storageTitle")}</h2>

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
      <div id="settings-info" className="settings-section" tabIndex={-1}>
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
      </div>
      {showDiagnostics && (
        <div id="settings-diagnostics" className="settings-section" tabIndex={-1}>
          <h2 className="section-label">{t("settings.diagnostics")}</h2>

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

          <Suspense fallback={<span className="small">{t("common.loading")}</span>}>
            <DeveloperSessionTools />
          </Suspense>

          {DEBUG_DIAG && DeveloperFullDiagnostics && (
            <Suspense fallback={<span className="small">{t("common.loading")}</span>}>
              <DeveloperFullDiagnostics />
            </Suspense>
          )}
        </div>
      )}
    </div>
  )
}
