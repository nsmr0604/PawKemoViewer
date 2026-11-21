import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({
  configFile: false,
  mode: "test",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())

const { createLocaleUseCases } = await server.ssrLoadModule("/src/application/locales.ts")

test("locale CRUD validates input and sends private and shared writes to their own targets", async (t) => {
  const write = t.mock.fn(async () => {})
  const writeSecondary = t.mock.fn(async () => {})
  const remove = t.mock.fn(async () => true)
  const locales = createLocaleUseCases({ write, writeSecondary, delete: remove }, (value) => value === "{}")
  assert.deepEqual(await locales.addLocale("bad/code", "{}"), { kind: "invalid-code" })
  assert.deepEqual(await locales.addLocale("en", "invalid"), { kind: "invalid-json" })
  assert.deepEqual(await locales.addLocale(" en ", "{}"), { kind: "saved", code: "en" })
  const files = [
    { name: "en.json", size: 2, text: async () => "{}" },
    { name: "ja.json", size: 1024 * 1024 + 1, text: async () => assert.fail("oversized file read") },
    { name: "fr.json", size: 3, text: async () => "bad" },
    { name: "../de.json", size: 2, text: async () => assert.fail("invalid filename read") },
  ]
  assert.deepEqual(await locales.importLocaleFiles(files, "secondary"), {
    kind: "completed",
    imported: 1,
    failures: [{ name: "ja.json", reason: "size" }, { name: "fr.json", reason: "json" }, { name: "../de.json", reason: "code" }],
  })
  assert.equal(await locales.deleteLocale("en"), true)
  assert.deepEqual(write.mock.calls.map(({ arguments: args }) => args), [["en", "{}"]])
  assert.deepEqual(writeSecondary.mock.calls.map(({ arguments: args }) => args), [["en", "{}"]])
  assert.deepEqual(remove.mock.calls[0].arguments, ["en"])
})

test("locale import snapshots input and reports write failure without stopping the batch", async () => {
  const pending = Promise.withResolvers()
  const locales = createLocaleUseCases({
    async write(code) { if (code === "en") throw new Error("write failed") },
  }, () => true)
  const files = [
    { name: "en.json", size: 2, text: () => pending.promise },
    { name: "ja.json", size: 2, text: async () => "{}" },
  ]
  const importResult = locales.importLocaleFiles(files, "private")
  files.length = 0
  pending.resolve("{}")
  assert.deepEqual(await importResult, { kind: "completed", imported: 1, failures: [{ name: "en.json", reason: "write" }] })
  assert.deepEqual(await locales.importLocaleFiles([], "secondary"), { kind: "unavailable" })
})
