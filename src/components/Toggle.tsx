import { t } from "../i18n"

export function Toggle({
  checked,
  onChange,
  label,
  onLabel,
  offLabel,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
  onLabel?: string
  offLabel?: string
}) {
  const stateText = checked ? (onLabel ?? t("common.on")) : (offLabel ?? t("common.off"))
  return (
    <div className="toggle-wrap">
      <span className={`toggle-state ${checked ? "is-on" : "is-off"}`}>{stateText}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle-switch ${checked ? "is-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-switch-thumb" />
      </button>
    </div>
  )
}
