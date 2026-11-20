import { useState } from "react"
import { api, apiStatus, getSettings, updateSettings } from "../api"
import { buildBackup } from "../backup"
import { debugOpenLogFolder } from "../debug"
import { t } from "../i18n"
import { logInfo } from "../log"

export function DeveloperDiagnostics() {
  const [sessionKey, setSessionKey] = useState(getSettings().sessionKey)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [logResult, setLogResult] = useState<string | null>(null)

  const saveSession = () => {
    updateSettings({ sessionKey: sessionKey.trim() })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  const testSession = async () => {
    setTestResult(t("settings.testing"))
    try {
      await api.accountFavorites("artist", sessionKey.trim(), false)
      setTestResult(t("settings.testOk"))
    } catch (error) {
      const status = apiStatus(error)
      setTestResult(
        status === 401
          ? t("settings.testInvalid")
          : t("settings.testFail", {
              status: status !== null ? t("settings.httpStatus", { st: status }) : "",
              msg: error instanceof Error ? error.message : String(error),
            }),
      )
    }
  }

  const dumpBackup = async () => {
    const { splitDebugLog } = await import("../debug-log")
    for (const part of splitDebugLog("DEBUG BACKUP DUMP:\n" + buildBackup())) logInfo(part)
    setLogResult(t("settings.dumped"))
  }

  return (
    <>
      <div className="setting-subsection">
        <div className="section-label">{t("settings.developerSessionTitle")}</div>
        <p className="small">{t("settings.developerSessionDesc")}</p>
        <label className="field">
          <span>{t("settings.sessionLabel")}</span>
          <input type="password" value={sessionKey} onChange={(event) => setSessionKey(event.target.value)} placeholder={t("settings.sessionPlaceholder")} autoComplete="off" />
          <small>{t("settings.sessionHelp")}</small>
        </label>
        <div className="settings-actions">
          <button className="btn" onClick={() => void testSession()}>{t("settings.testSession")}</button>
          <button className="btn btn-primary" onClick={saveSession}>{t("settings.save")}</button>
          {saved && <span className="ok">{t("settings.saved")}</span>}
          {testResult && <span className="small" role="status">{testResult}</span>}
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-text">
          <span>{t("settings.logFolder")}</span>
          <small>{t("settings.logFolderDesc")}</small>
        </div>
        <button className="btn" onClick={() => void debugOpenLogFolder().then((path) => setLogResult(t("settings.folderResult", { path }))).catch((error) => setLogResult(t("settings.failedMsg", { msg: error instanceof Error ? error.message : String(error) })))}>{t("settings.open")}</button>
      </div>
      <div className="setting-item">
        <div className="setting-text">
          <span>{t("settings.backupDump")}</span>
          <small>{t("settings.backupDumpDesc")}</small>
        </div>
        <button className="btn" onClick={() => void dumpBackup()}>{t("settings.dump")}</button>
      </div>
      {logResult && <span className="small" role="status">{logResult}</span>}
    </>
  )
}
