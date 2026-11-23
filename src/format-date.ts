export function formatDate(iso: string | undefined): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso.slice(0, 10)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  } catch {
    return iso
  }
}
