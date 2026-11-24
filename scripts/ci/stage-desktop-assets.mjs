import { copyFileSync, mkdirSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"

const [platform, mode, source, destination] = process.argv.slice(2)
const names = {
  desktop: { exe: "exe", msi: "msi", deb: "deb", rpm: "rpm", AppImage: "AppImage" },
  macos: { dmg: "dmg" },
}[platform]
if (!names || !["release", "debug"].includes(mode) || !source || !destination) {
  throw new Error("Usage: stage-desktop-assets.mjs <desktop|macos> <release|debug> <source> <destination>")
}
const files = readdirSync(source, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && Object.hasOwn(names, entry.name.split(".").at(-1)))
if (!files.length) throw new Error("No desktop packages found")

mkdirSync(destination, { recursive: true })
const staged = new Set()
for (const file of files) {
  const extension = file.name.split(".").at(-1)
  const name = mode === "release" ? `PawKemoViewer.${names[extension]}` : basename(file.name)
  if (staged.has(name)) throw new Error(`Multiple packages map to ${name}`)
  staged.add(name)
  copyFileSync(join(file.parentPath, file.name), join(destination, name))
}
