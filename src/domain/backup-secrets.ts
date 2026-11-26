/**
 * バックアップ JSON をクリップボードへ渡すときの整形。
 *
 * バックアップには `settings.sessionKey`(pawchive の session Cookie 値)が含まれる。
 * OS のクリップボードは他アプリ・履歴・クラウド同期から読めるため、
 * クリップボードへは sessionKey を除いた JSON を渡す。
 */

export function stripSessionFromBackup(json: string): string {
  try {
    const value: unknown = JSON.parse(json)
    if (!value || typeof value !== "object") return json
    const settings = (value as { settings?: unknown }).settings
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) return json
    delete (settings as Record<string, unknown>).sessionKey
    return JSON.stringify(value)
  } catch {
    return json
  }
}
