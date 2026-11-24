import { useState, type Dispatch, type SetStateAction } from "react"
import { getApplication } from "../application/composition"
import { t, formatLocaleIssues, type Locale, type LocaleInfo } from "../i18n"
import { logInfo } from "../log"
import { getPlatformRuntime } from "../platform/runtime"

interface Props {
  locale: Locale
  localeList: LocaleInfo[]
  reloadLocales: () => Promise<void>
  filePickerBusy: boolean
  setFilePickerBusy: Dispatch<SetStateAction<boolean>>
}

export function DeveloperLocaleDiagnostics({ locale, localeList, reloadLocales, filePickerBusy, setFilePickerBusy }: Props) {
  const localeUseCases = getApplication().locales!
  const supportsSecondaryLocale = Boolean(getPlatformRuntime().services.locale?.writeSecondary)
  const canExportLocale = localeList.some((entry) => entry.code === locale && entry.external)
  const [localeMsg, setLocaleMsg] = useState<string | null>(null)
  const [localeChange, setLocaleChange] = useState<
    { kind: "replace"; code: string; json: string } | { kind: "delete"; code: string } | null
  >(null)
  const [localeAddCode, setLocaleAddCode] = useState("")
  const [localeAddJson, setLocaleAddJson] = useState("")

  const addLocale = async () => {
    let code: string
    try {
      const result = await localeUseCases.addLocale(localeAddCode, localeAddJson)
      if (result.kind !== "saved") {
        setLocaleMsg(result.kind === "invalid-code"
          ? t("settings.localeBadCode")
          : formatLocaleIssues(result.issues))
        return
      }
      code = result.code
    } catch (e) {
      setLocaleMsg(t("settings.failedMsg", { msg: e instanceof Error ? e.message : String(e) }))
      return
    }
    await reloadLocales()
    setLocaleAddCode("")
    setLocaleAddJson("")
    setLocaleMsg(t("settings.localeAdded", { code }))
  }

  const importLocaleFiles = async (files: FileList | null, target: "private" | "secondary" = "private") => {
    if (!files?.length) return
    const result = await localeUseCases.importLocaleFiles(files, target)
    if (result.kind === "unavailable") {
      setLocaleMsg(target === "secondary"
        ? t("settings.localeFolderUnavailable")
        : t("settings.failedMsg", { msg: "Locale service unavailable" }))
      return
    }
    const { imported, failures } = result
    const skipped = failures.map((failure) => {
      const detail = failure.reason === "json"
        ? formatLocaleIssues(failure.issues)
        : t(`settings.localeFailure.${failure.reason}`)
      return `${failure.name} (${detail})`
    }).join(", ")
    if (imported) await reloadLocales()
    setLocaleMsg(t(skipped ? "settings.localeImportPartial" : "settings.localeImportComplete", { imported, skipped }))
  }

  const useLocalePicker = async (operation: "import" | "export") => {
    if (filePickerBusy) return
    setFilePickerBusy(true)
    setLocaleMsg(null)
    try {
      if (operation === "import") {
        logInfo("Locale import: picker requested")
        const result = await localeUseCases.pickLocale()
        logInfo(`Locale import: ${result.kind}`)
        switch (result.kind) {
          case "cancelled": break
          case "invalid-code": setLocaleMsg(t("settings.localeBadCode")); break
          case "invalid-json": setLocaleMsg(formatLocaleIssues(result.issues)); break
          case "conflict": setLocaleChange({ kind: "replace", code: result.code, json: result.json }); break
          case "saved":
            await reloadLocales()
            setLocaleMsg(t("settings.localeAdded", { code: result.code }))
            break
        }
      } else {
        const result = await localeUseCases.exportPrivateLocale(locale)
        if (result.kind === "missing") setLocaleMsg(t("settings.localePickerMissing"))
        if (result.kind === "invalid-json") setLocaleMsg(formatLocaleIssues(result.issues))
        if (result.kind === "saved") {
          const path = result.path
          setLocaleMsg(path ? t("settings.localePickerSavedTo", { path }) : t("settings.localePickerSaved"))
        }
      }
    } catch (error) {
      if (operation === "import") logInfo("Locale import: failed")
      setLocaleMsg(t("settings.failedMsg", { msg: error instanceof Error ? error.message : String(error) }))
    } finally {
      setFilePickerBusy(false)
    }
  }

  const confirmLocaleChange = async () => {
    if (!localeChange || filePickerBusy) return
    const { code } = localeChange
    setFilePickerBusy(true)
    setLocaleChange(null)
    try {
      if (localeChange.kind === "replace") {
        const result = await localeUseCases.addLocale(code, localeChange.json)
        if (result.kind !== "saved") {
          setLocaleMsg(result.kind === "invalid-code" ? t("settings.localeBadCode") : formatLocaleIssues(result.issues))
          return
        }
        await reloadLocales()
        setLocaleMsg(t("settings.localeReplaced", { code }))
      } else {
        const deleted = await localeUseCases.deleteLocale(code)
        await reloadLocales()
        setLocaleMsg(t(deleted ? "settings.localeDeleted" : "settings.localeDeleteMissing", { code }))
      }
    } catch (e) {
      setLocaleMsg(t("settings.failedMsg", { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setFilePickerBusy(false)
    }
  }

  const localeChangeControls = localeChange && (
    <div className="settings-actions" role="group" aria-label={t(localeChange.kind === "replace" ? "settings.localeReplaceConfirm" : "settings.localeDeleteConfirm", { code: localeChange.code })}>
      <span>{t(localeChange.kind === "replace" ? "settings.localeReplaceConfirm" : "settings.localeDeleteConfirm", { code: localeChange.code })}</span>
      <button className="btn btn-ghost" onClick={() => setLocaleChange(null)}>{t("settings.localeCancel")}</button>
      <button className="btn" onClick={() => void confirmLocaleChange()}>{t(localeChange.kind === "replace" ? "settings.localeReplace" : "settings.localeDelete")}</button>
    </div>
  )

  return (
    <>
      <h3 className="section-label">{t("settings.localeDiagnosticsTitle")}</h3>
      <div className="setting-item">
        <div className="setting-text">
          <span>{t("settings.localeImportFile")}</span>
          <small>{localeUseCases.canPickLocale ? t("settings.localePickerImportDesc") : t("settings.localeImportFilesDesc")}</small>
        </div>
        {localeUseCases.canPickLocale ? (
          <button className="btn" disabled={filePickerBusy || !!localeChange} onClick={() => void useLocalePicker("import")}>
            {t("settings.localePickerOpen")}
          </button>
        ) : (
          <label className="btn">
            {t("settings.localeChooseFiles")}
            <input type="file" accept=".json,application/json" multiple hidden onChange={(e) => { void importLocaleFiles(e.target.files); e.currentTarget.value = "" }} />
          </label>
        )}
      </div>

      {localeChange?.kind === "replace" && localeChangeControls}
      {localeUseCases.canPickLocale && (
        <div className="setting-item">
          <div className="setting-text">
            <span>{t("settings.localePickerExport")}</span>
            <small>{t("settings.localePickerExportDesc")}</small>
          </div>
          <button className="btn" disabled={filePickerBusy || !canExportLocale} onClick={() => void useLocalePicker("export")}>
            {t("settings.localePickerSave")}
          </button>
        </div>
      )}

      <details className="setting-subsection">
        <summary>{t("settings.localeAdvanced")}</summary>
        {supportsSecondaryLocale && (
          <div className="setting-item">
            <div className="setting-text">
              <span>{t("settings.localeCopyToFolder")}</span>
              <small>{t("settings.localeCopyToFolderDesc")}</small>
            </div>
            <label className="btn">
              {t("settings.localeChooseFiles")}
              <input type="file" accept=".json,application/json" multiple hidden disabled={filePickerBusy} onChange={(e) => { void importLocaleFiles(e.target.files, "secondary"); e.currentTarget.value = "" }} />
            </label>
          </div>
        )}
        <p className="small">{t("settings.localeAddDesc")}</p>
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
      </details>

      {localeList.some((l) => l.external) && (
        <div className="setting-item">
          <div className="setting-text">
            {localeList
              .filter((l) => l.external)
              .map((l) => (
                <div key={l.code} className="settings-actions">
                  <span>{l.name} ({l.code})</span>
                  <button className="btn btn-ghost" disabled={filePickerBusy || !!localeChange} onClick={() => setLocaleChange({ kind: "delete", code: l.code })}>
                    {t("settings.localeDelete")}
                  </button>
                  {localeChange?.kind === "delete" && localeChange.code === l.code && localeChangeControls}
                </div>
              ))}
          </div>
        </div>
      )}

      {localeMsg && <span className="small" role="status">{localeMsg}</span>}
    </>
  )
}
