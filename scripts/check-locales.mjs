import { readFileSync, readdirSync } from "node:fs"
import { validateLocale } from "../src/domain/locale-validation.ts"

const directory = new URL("../src/locales/", import.meta.url)
const read = (name) => readFileSync(new URL(name, directory), "utf8")
const reference = validateLocale(read("ja.json"))

function report(name, issues) {
  for (const issue of issues) console.error(`${name}: ${issue.kind}${"key" in issue ? ` (${issue.key})` : ""}`)
  if (issues.length) process.exitCode = 1
}

report("ja.json", reference.issues)
if (reference.dictionary) {
  for (const name of readdirSync(directory).sort()) {
    if (name === "ja.json" || !name.endsWith(".json")) continue
    report(name, validateLocale(read(name), reference.dictionary, true).issues)
  }
}
