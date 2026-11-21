import assert from "node:assert/strict"
import { isAbsolute, relative } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { isValidPostContext } from "../src/domain/post-identity.ts"

const context = { service: "fanbox", creatorId: "creator", postId: "post" }

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
