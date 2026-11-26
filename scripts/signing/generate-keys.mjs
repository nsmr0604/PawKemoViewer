#!/usr/bin/env node
// Interactive signing-key generator for APK and Linux repositories.
//
// Usage:
//   node scripts/signing/generate-keys.mjs
//   SIGNING_PASSWORD=... node scripts/signing/generate-keys.mjs --out-dir .agent-work/signing
//
// Generate the Linux GPG key on Linux/WSL (or install GnuPG on Windows).
// Never commit the generated files.
import { execFileSync } from "node:child_process"
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i]
  if (!key.startsWith("--")) continue
  const value = process.argv[i + 1]?.startsWith("--") ? "true" : process.argv[i + 1]
  args.set(key.slice(2), value ?? "true")
  if (value !== undefined && !value.startsWith("--")) i += 1
}

if (args.has("help")) {
  console.log(`Usage: node scripts/signing/generate-keys.mjs [options]

Options:
  --out-dir <dir>        output directory (default: .agent-work/signing)
  --alias <name>         APK key alias (default: pawkemoviewer)
  --key-size <bits>      APK RSA key size (default: 4096)
  --validity-days <n>    APK certificate validity (default: 10950)
  --cn/--ou/--o/--l/--st/--c <value>
                         certificate subject fields
  --gpg-name <name>      GPG key name (default: PawKemoViewer Repository)
  --gpg-email <email>    GPG key email (default: nsmr0604@users.noreply.github.com)
  --gpg-expire <period>  GPG expiry (default: 10y)
  --skip-apk             do not generate the APK keystore
  --skip-gpg             do not generate the GPG key
  --force                overwrite existing output files
  --help                 show this help

Password:
  Set SIGNING_PASSWORD, or enter it at the prompt.
  The same password is used for the APK keystore and the GPG key.

Examples:
  node scripts/signing/generate-keys.mjs
  SIGNING_PASSWORD='...' node scripts/signing/generate-keys.mjs --out-dir .agent-work/signing2
  SIGNING_PASSWORD='...' node scripts/signing/generate-keys.mjs --cn 'PawKemoViewer' --c JP
`)
  process.exit(0)
}

const rl = createInterface({ input: stdin, output: stdout })
const tty = stdin.isTTY
async function ask(label, fallback) {
  if (!tty) return fallback
  const answer = (await rl.question(`${label} [${fallback}]: `)).trim()
  return answer || fallback
}
function fail(message) {
  console.error(message)
  process.exit(1)
}

const outDir = resolve(args.get("out-dir") ?? ".agent-work/signing")
const alias = await ask("APK key alias", args.get("alias") ?? "pawkemoviewer")
const password = process.env.SIGNING_PASSWORD ?? (await ask("Password (APK + GPG)", ""))
if (!password) fail("Set SIGNING_PASSWORD or enter a password.")

const keySize = await ask("APK key size", args.get("key-size") ?? "4096")
const validity = await ask("APK validity (days)", args.get("validity-days") ?? "10950")
const cn = await ask("Certificate CN", args.get("cn") ?? "PawKemoViewer")
const ou = await ask("Certificate OU", args.get("ou") ?? "Development")
const org = await ask("Certificate O", args.get("o") ?? "nsmr0604")
const city = await ask("Certificate L", args.get("l") ?? "Tokyo")
const state = await ask("Certificate ST", args.get("st") ?? "Tokyo")
const country = await ask("Certificate C", args.get("c") ?? "JP")
const gpgName = await ask("GPG name", args.get("gpg-name") ?? "PawKemoViewer Repository")
const gpgEmail = await ask("GPG email", args.get("gpg-email") ?? "nsmr0604@users.noreply.github.com")
const gpgExpire = await ask("GPG expiry", args.get("gpg-expire") ?? "10y")
rl.close()

const force = args.get("force") === "true"
const skipApk = args.get("skip-apk") === "true"
const skipGpg = args.get("skip-gpg") === "true"
mkdirSync(outDir, { recursive: true })
const apkPath = join(outDir, "pawkemo-release.p12")
const infoPath = join(outDir, "signing-info.json")

function ensureWritable(path) {
  if (existsSync(path) && !force) fail(`${path} already exists (use --force to overwrite).`)
}

if (!skipApk) {
  ensureWritable(apkPath)
  const dname = `CN=${cn}, OU=${ou}, O=${org}, L=${city}, ST=${state}, C=${country}`
  execFileSync(
    "keytool",
    [
      "-genkeypair", "-v", "-keystore", apkPath, "-storetype", "PKCS12",
      "-alias", alias, "-keyalg", "RSA", "-keysize", keySize,
      "-validity", validity, "-dname", dname,
      "-storepass", password, "-keypass", password,
    ],
    { stdio: "inherit" },
  )
  const list = execFileSync(
    "keytool",
    ["-list", "-v", "-keystore", apkPath, "-storepass", password],
    { encoding: "utf8" },
  )
  const sha256 = list.match(/SHA256:\s*([0-9A-F:]+)/i)?.[1] ?? ""
  writeFileSync(join(outDir, "android-keystore.b64"), readFileSync(apkPath).toString("base64"))
  writeFileSync(infoPath, JSON.stringify({
    apk: { path: apkPath, alias, sha256, keySize: Number(keySize), validityDays: Number(validity) },
  }, null, 2) + "\n")
  console.log(`APK keystore: ${apkPath}`)
  console.log(`APK SHA-256: ${sha256}`)
}

if (!skipGpg) {
  try {
    execFileSync("gpg", ["--version"], { stdio: "ignore" })
  } catch {
    console.warn("gpg was not found. Run this script on Linux/WSL, or install GnuPG.")
    process.exit(0)
  }
  const home = join(outDir, "gnupg")
  mkdirSync(home, { recursive: true })
  const env = { ...process.env, GNUPGHOME: home }
  const gpg = (gpgArgs, options = {}) =>
    execFileSync("gpg", ["--batch", "--pinentry-mode", "loopback", "--passphrase", password, ...gpgArgs], { env, ...options })
  const uid = `${gpgName} <${gpgEmail}>`
  gpg(["--quick-generate-key", uid, "rsa4096", "sign", gpgExpire], { stdio: "inherit" })
  const listing = gpg(["--list-secret-keys", "--with-colons"], { encoding: "utf8" })
  const fingerprint = listing.split("\n").find(line => line.startsWith("fpr:"))?.split(":")[9]
  if (!fingerprint) fail("Could not read the GPG fingerprint.")
  writeFileSync(join(outDir, "linux-repo-private.asc"), gpg(["--armor", "--export-secret-keys", fingerprint]))
  writeFileSync(join(outDir, "linux-repo-public.asc"), gpg(["--armor", "--export", fingerprint]))
  writeFileSync(join(outDir, "linux-repo-private.b64"), readFileSync(join(outDir, "linux-repo-private.asc")).toString("base64"))
  writeFileSync(join(outDir, "linux-repo-key-id.txt"), `${fingerprint}\n`)
  const current = existsSync(infoPath) ? JSON.parse(readFileSync(infoPath, "utf8")) : {}
  writeFileSync(infoPath, JSON.stringify({
    ...current,
    linuxRepo: { fingerprint, privateKey: join(outDir, "linux-repo-private.asc"), publicKey: join(outDir, "linux-repo-public.asc") },
  }, null, 2) + "\n")
  console.log(`GPG fingerprint: ${fingerprint}`)
}

console.log("\nGenerated files contain private keys. Back them up and keep them out of git.")
console.log("Set the GitHub Actions secrets:")
console.log("  ANDROID_KEYSTORE_BASE64     <- android-keystore.b64")
console.log("  ANDROID_KEYSTORE_PASSWORD   <- the password")
console.log("  ANDROID_KEY_ALIAS           <- " + alias)
console.log("  ANDROID_KEY_PASSWORD        <- the password")
console.log("  LINUX_REPO_GPG_PRIVATE_KEY  <- linux-repo-private.b64")
console.log("  LINUX_REPO_GPG_PASSPHRASE   <- the password")
