import { t } from "../i18n"

export function Spinner({ label = t("common.loading") }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const raw = error instanceof Error ? error.message : String(error)
  // Rust 側は "STATUS=401 BODY=..." 形式で返す。実ステータスと本文を取り出す
  const sm = raw.match(/STATUS=(\d+) BODY=([\s\S]*)/)
  const status = sm ? Number(sm[1]) : null
  const body = sm ? sm[2].trim() : raw

  // 状況に応じた説明 (JHenTai の Sad Panda 型: 固有名詞 + 対処を伝える)
  let title = t("error.loadFailed")
  let hint = ""
  if (raw.includes("Fake site")) {
    title = t("error.blocked")
    hint = t("error.blockedHint")
  } else if (status === 401) {
    title = t("error.sessionInvalid")
    hint = t("error.sessionHint")
  } else if (status === 429) {
    title = t("error.tooManyRequests")
    hint = t("error.tooManyRequestsHint")
  } else if (status === 403) {
    title = t("error.forbidden")
    hint = t("error.forbiddenHint")
  } else if (status === 404) {
    title = t("error.notFound")
    hint = t("error.notFoundHint")
  } else if (status === 502 || /upstream|network|timed?\s?out/i.test(raw)) {
    title = t("error.serverUnavailable")
    hint = t("error.serverUnavailableHint")
  }

  return (
    <div className="error-box">
      <p className="error-title">⚠️ {title}</p>
      {hint && <p className="error-hint">{hint}</p>}
      {body && (
        <details className="error-detail">
          <summary>
            {t("error.detail", { info: status !== null ? `HTTP ${status}` : t("error.reasonUnknown") })}
          </summary>
          <pre className="mono small">{body.slice(0, 2000)}{body.length > 2000 ? "…" : ""}</pre>
        </details>
      )}
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  )
}

export function Empty({ text = t("common.noData") }: { text?: string }) {
  return <div className="empty">{text}</div>
}

/** 左右スイッチ型のオン/オフトグル。
 *  ラベル・状態テキストを明示してオンオフの意味を分かりやすくする。 */
