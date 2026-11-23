import { useState } from "react"
import { buildBackup } from "../backup"
import { debugOpenLogFolder } from "../native-debug-log"
import { probePkvImage } from "../pkv-probe"
import { t } from "../i18n"
import { logInfo } from "../log"

export function DeveloperFullDiagnostics() {
  const [logResult, setLogResult] = useState<string | null>(null)
  const [probeResult, setProbeResult] = useState<string | null>(null)

  const dumpBackup = async () => {
    const { splitDebugLog } = await import("../debug-log")
    for (const part of splitDebugLog("DEBUG BACKUP DUMP:\n" + buildBackup())) logInfo(part)
    setLogResult(t("settings.dumped"))
  }

  // 外部ホストを元記事 Referer 付きで取得できるか (pkv プロキシの疎通確認)
  const probeExternal = async () => {
    setProbeResult(t("settings.testing"))
    const referer = "https://www.fanbox.cc/@pawkemoviewer-probe/posts/1"
    const target = "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png"
    const result = await probePkvImage(target, referer)
    setProbeResult(`pkv probe: ${result}`)
  }

  // 内部アドレスが拒否されることの確認
  const probeBlocked = async () => {
    setProbeResult(t("settings.testing"))
    const referer = "https://www.fanbox.cc/@pawkemoviewer-probe/posts/1"
    const result = await probePkvImage("http://127.0.0.1:1/", referer, 8000)
    setProbeResult(`pkv block probe: ${result}`)
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
      <div className="setting-item">
        <div className="setting-text">
          <span>{t("settings.pkvProbe")}</span>
          <small>{t("settings.pkvProbeDesc")}</small>
        </div>
        <div className="settings-actions">
          <button className="btn" onClick={() => void probeExternal()}>{t("settings.pkvProbeExternal")}</button>
          <button className="btn" onClick={() => void probeBlocked()}>{t("settings.pkvProbeBlocked")}</button>
        </div>
      </div>
      {probeResult && <span className="small" role="status">{probeResult}</span>}
      {logResult && <span className="small" role="status">{logResult}</span>}
    </>
  )
}
