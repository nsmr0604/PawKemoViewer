import { relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = fileURLToPath(new URL("../src/", import.meta.url))
const configPath = fileURLToPath(new URL("../tsconfig.json", import.meta.url))
const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic(diagnostic) {
    throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
  },
})
if (!config || config.errors.length) {
  throw new Error(config?.errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n")
    ?? "TypeScript configuration unavailable")
}

const modulePath = (path) => relative(root, path).split(sep).join("/")
const composition = "application/composition.ts"
const isPresentation = (path) => /^(pages\/|components\/|App\.tsx$|main\.tsx$)/.test(path)

function allows(from, to) {
  if (from.startsWith("domain/")) return to.startsWith("domain/")
  if (from.startsWith("application/") && from !== composition) {
    return to.startsWith("domain/") ||
      (to.startsWith("application/") && to !== composition) ||
      to === "types.ts"
  }
  if (from.startsWith("infrastructure/")) {
    if (isPresentation(to)) return false
    if (to.startsWith("application/")) return /^application\/[^/]+-repository\.ts$/.test(to)
  }
  if (isPresentation(from) && to.startsWith("infrastructure/")) return false
  if (from.startsWith("platform/") && /^(application|infrastructure)\//.test(to)) return false
  return true
}

const errors = []
for (const source of config.fileNames) {
  const contents = ts.sys.readFile(source)
  if (contents === undefined) throw new Error(`Cannot read ${source}`)
  const from = modulePath(source)
  for (const entry of ts.preProcessFile(contents, true, true).importedFiles) {
    const name = entry.fileName
    const target = ts.resolveModuleName(name, source, config.options, ts.sys).resolvedModule
    const to = target ? modulePath(target.resolvedFileName) : name
    if (!allows(from, to)) errors.push(`${from} -> ${name} (${to})`)
  }
}

if (errors.length) {
  process.exitCode = 1
  console.error(`Invalid architecture imports:\n${errors.join("\n")}`)
} else {
  console.log("Architecture import boundaries passed")
}
