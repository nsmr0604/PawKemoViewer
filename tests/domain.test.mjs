import assert from "node:assert/strict"
import { isAbsolute, relative } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { isValidPostContext } from "../src/domain/post-identity.ts"
import { normalizeFanboxSlug, originalPostReferer } from "../src/domain/post-referer.ts"
import { accountIdFromSession } from "../src/domain/session-account.ts"
import { stripSessionFromBackup } from "../src/domain/backup-secrets.ts"
import { isSafeHttpUrl } from "../src/safe-url.ts"
import { isAllowedExternalPageUrl } from "../src/external-page-url.ts"

const context = { service: "fanbox", creatorId: "creator", postId: "post" }

test("external page URLs reject local and private destinations", () => {
  for (const allowed of [
    "https://www.fanbox.cc/@creator/posts/1",
    "http://192.0.2.10/page",
    "https://example.com/",
  ]) {
    assert.equal(isAllowedExternalPageUrl(allowed), true, allowed)
  }
  for (const blocked of [
    "http://localhost/",
    "http://app.localhost/",
    "http://printer.local/",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://172.16.5.4/",
    "http://192.168.0.10/",
    "http://169.254.169.254/latest/meta-data",
    "http://0.0.0.0/",
    "http://[::1]/",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "not a url",
  ]) {
    assert.equal(isAllowedExternalPageUrl(blocked), false, blocked)
  }
})

test("post identity accepts supported services without changing persisted or encoded IDs", () => {
  assert.equal(isValidPostContext(context), true)
  assert.equal(isValidPostContext({ service: "patreon", creatorId: "42", postId: "123" }), true)
  assert.equal(isValidPostContext({ ...context, postId: "%2F" }), true)
  assert.equal(isValidPostContext({ ...context, postId: " id " }), true)
})

test("post identity rejects unsupported services and incomplete or ambiguous identifiers", () => {
  for (const service of ["", "FANBOX", "youtube"]) {
    assert.equal(isValidPostContext({ ...context, service }), false)
  }
  for (const value of ["", " ", "undefined", "null", "a/b", undefined, null, 123]) {
    assert.equal(isValidPostContext({ ...context, creatorId: value }), false)
    assert.equal(isValidPostContext({ ...context, postId: value }), false)
  }
})

test("original post referer uses the creator slug for FANBOX and the bare ID for Patreon", () => {
  assert.equal(originalPostReferer("fanbox", "123", "tateha"), "https://www.fanbox.cc/@tateha/posts/123")
  assert.equal(originalPostReferer("fanbox", "123", "@Tateha"), "https://www.fanbox.cc/@tateha/posts/123")
  assert.equal(originalPostReferer("fanbox", "123"), "https://www.fanbox.cc/posts/123")
  assert.equal(originalPostReferer("fanbox", "123", "www"), "https://www.fanbox.cc/posts/123")
  assert.equal(originalPostReferer("patreon", "456"), "https://www.patreon.com/posts/456")
  assert.equal(originalPostReferer("fanbox", "a b"), "https://www.fanbox.cc/posts/a%20b")
  assert.equal(originalPostReferer("youtube", "789"), undefined)
})

test("fanbox slug normalization rejects values that cannot be a subdomain", () => {
  assert.equal(normalizeFanboxSlug(" tateha "), "tateha")
  assert.equal(normalizeFanboxSlug("@tateha"), "tateha")
  assert.equal(normalizeFanboxSlug("www"), "")
  assert.equal(normalizeFanboxSlug("tateha.fanbox.cc"), "")
  assert.equal(normalizeFanboxSlug("a/b"), "")
  assert.equal(normalizeFanboxSlug(undefined), "")
})

test("session account decodes the account_id embedded in the session cookie", () => {
  // {"_permanent":true,"account_id":558155}
  const token = "eyJfcGVybWFuZW50Ijp0cnVlLCJhY2NvdW50X2lkIjo1NTgxNTV9.av23Tw.1-signature"
  assert.equal(accountIdFromSession(token), "558155")
  assert.equal(accountIdFromSession("eyJhY2NvdW50X2lkIjoiIDQyICJ9.x.y"), "42")
  assert.equal(accountIdFromSession("eyJhY2NvdW50X2lkIjo3fQ"), "7")
})

test("session account returns null when the payload has no usable account_id", () => {
  for (const value of [
    "",
    "not-a-session",
    "e30.x.y", // {}
    "eyJhY2NvdW50X2lkIjoiIn0.x.y", // 遨ｺ譁・ｭ・
    "eyJhY2NvdW50X2lkIjpudWxsfQ.x.y", // null
    "!!!.x.y",
    "eyJfcGVybWFuZW50Ijp0cnVlfQ.x.y", // account_id 縺ｪ縺・
  ]) {
    assert.equal(accountIdFromSession(value), null)
  }
})

test("safe url accepts http and https and rejects other schemes", () => {
  assert.equal(isSafeHttpUrl("https://example.com/a.png"), true)
  assert.equal(isSafeHttpUrl("http://example.com/a.png"), true)
  assert.equal(isSafeHttpUrl("//example.com/a.png"), true)
  for (const value of [
    "javascript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "",
  ]) {
    assert.equal(isSafeHttpUrl(value), false, value)
  }
})

test("backup clipboard copy removes the session key only", () => {
  const json = JSON.stringify({ settings: { sessionKey: "secret", theme: "dark" }, follows: [] })
  const stripped = JSON.parse(stripSessionFromBackup(json))
  assert.equal(stripped.settings.sessionKey, undefined)
  assert.equal(stripped.settings.theme, "dark")
  assert.equal(stripSessionFromBackup("not json"), "not json")
  assert.equal(stripSessionFromBackup(JSON.stringify({ follows: [] })), JSON.stringify({ follows: [] }))
})

test("domain compiles with ES2022 alone and resolves only domain and standard library files", () => {
  const root = fileURLToPath(new URL("../src/domain/", import.meta.url))
  const sources = ts.sys.readDirectory(root, [".ts"])
  assert.ok(sources.length > 0)
  const program = ts.createProgram(sources, {
    lib: ["lib.es2022.d.ts"],
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }))
  for (const file of program.getSourceFiles()) {
    if (program.isSourceFileDefaultLibrary(file)) continue
    const path = relative(root, file.fileName)
    assert.ok(!isAbsolute(path) && path.split(/[\\/]/)[0] !== "..", file.fileName)
  }
})

