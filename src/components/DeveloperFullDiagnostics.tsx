import { useState } from "react"
import { buildBackup } from "../backup"
import { debugOpenLogFolder } from "../debug"
import { t } from "../i18n"
import { logInfo } from "../log"

export function DeveloperFullDiagnostics() {
  const [logResult, setLogResult] = useState<string | null>(null)

  const dumpBackup = async () => {
    const { splitDebugLog } = await import("../debug-log")
    for (const part of splitDebugLog("DEBUG BACKUP DUMP:\n" + buildBackup())) logInfo(part)
    setLogResult(t("settings.dumped"))
  }

  return (
    <>
      <div className="setting-subsection">
        <div className="section-label">{t("settings.fullDiagnosticsTitle")}</div>
        <p className="small">{t("settings.fullDiagnosticsDesc")}</p>
        <p className="small">{t("settings.fullApiLogcatDesc")}</p>
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
