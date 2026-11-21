import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
})
after(() => server.close())

function mockGlobal(t, key, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, key)
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, key, original)
    else delete globalThis[key]
  })
}

const { createDesktopServices, createMobileServices, createWebServices } =
  await server.ssrLoadModule("/src/platform/families/index.ts")

test("all families open, upgrade, and resolve the same IndexedDB handle", async (t) => {
  const database = {}
  const request = { result: database }
  const open = t.mock.fn(() => request)
  mockGlobal(t, "indexedDB", { open })

  for (const createServices of [createDesktopServices, createMobileServices, createWebServices]) {
    const upgrade = t.mock.fn()
    const pending = createServices().indexedDatabase.open("records", 2, upgrade)
    request.onupgradeneeded()
    request.onsuccess()
    assert.deepEqual(open.mock.calls.at(-1).arguments, ["records", 2])
    assert.equal(upgrade.mock.calls[0].arguments[0], database)
    assert.equal(await pending, database)
  }
})

test("all families reject blocked, failed, and unavailable IndexedDB opens", async (t) => {
  const failure = new Error("request failed")
  const request = { error: failure }
  mockGlobal(t, "indexedDB", { open: () => request })

  for (const createServices of [createDesktopServices, createMobileServices, createWebServices]) {
    const { indexedDatabase } = createServices()
    const blocked = indexedDatabase.open("records", 2, () => {})
    request.onblocked()
    await assert.rejects(blocked, /IndexedDB upgrade blocked/)
    const failed = indexedDatabase.open("records", 2, () => {})
    request.onerror()
    await assert.rejects(failed, (error) => error === failure)
  }

  globalThis.indexedDB = undefined
  await assert.rejects(createWebServices().indexedDatabase.open("records", 2, () => {}), /IndexedDB unavailable/)
})

test("all families preserve clipboard text and handle denied access", async (t) => {
  let text = "  existing  "
  const clipboard = {
    readText: async () => text,
    writeText: async (value) => { text = value },
  }
  mockGlobal(t, "navigator", { clipboard })
  for (const createServices of [createDesktopServices, createMobileServices, createWebServices]) {
    globalThis.navigator = { clipboard }
    const service = createServices().clipboard
    assert.equal(await service.readText(), text)
    assert.equal(await service.writeText("new"), true)
    assert.equal(text, "new")
    globalThis.navigator = {
      clipboard: {
        readText: async () => { throw new Error("denied") },
        writeText: async () => { throw new Error("denied") },
      },
    }
    assert.equal(await service.readText(), null)
    assert.equal(await service.writeText("ignored"), false)
  }
})
