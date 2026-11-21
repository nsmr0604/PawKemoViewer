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

const { getPlatformRuntime, initializePlatformRuntime, resetPlatformRuntimeForTests } =
  await server.ssrLoadModule("/src/platform/runtime.ts")

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

test("runtime requires initialization, preserves identity, and selects the right family after reset", (t) => {
  t.after(resetPlatformRuntimeForTests)
  mockGlobal(t, "navigator", { userAgent: "Linux Android" })
  mockGlobal(t, "window", {})

  assert.throws(getPlatformRuntime, /has not been initialized/)
  const web = initializePlatformRuntime()
  assert.deepEqual(web.descriptor, { os: "android", family: "web", isNative: false })
  assert.equal(web.services.network, undefined)

  globalThis.window = { __TAURI_INTERNALS__: {} }
  assert.equal(initializePlatformRuntime(), web)
  resetPlatformRuntimeForTests()
  const mobile = initializePlatformRuntime()
  assert.deepEqual(mobile.descriptor, { os: "android", family: "mobile", isNative: true })
  assert.equal(getPlatformRuntime(), mobile)
  assert.equal(typeof mobile.services.lifecycle.onBackRequested, "function")
  assert.equal(mobile.services.locale.listSecondary, undefined)

  resetPlatformRuntimeForTests()
  globalThis.navigator = { userAgent: "Windows" }
  const desktop = initializePlatformRuntime()
  assert.deepEqual(desktop.descriptor, { os: "windows", family: "desktop", isNative: true })
  assert.equal(desktop.services.lifecycle, undefined)
  assert.equal(typeof desktop.services.locale.listSecondary, "function")
})

test("native transport preserves command, camelCase arguments, response and error", async (t) => {
  const invoke = t.mock.fn(async () => '{"data":[]}')
  mockGlobal(t, "window", { __TAURI_INTERNALS__: { invoke } })
  const args = { path: "/posts", method: "GET", sessionKey: "fixture", timeoutSecs: 12 }

  for (const createServices of [createDesktopServices, createMobileServices]) {
    const { network } = createServices()
    assert.equal(await network.request(args), '{"data":[]}')
    assert.deepEqual(invoke.mock.calls.at(-1).arguments.slice(0, 2), ["api_request", args])
  }

  const failure = "STATUS=401 BODY=fixture"
  window.__TAURI_INTERNALS__.invoke = async () => { throw failure }
  await assert.rejects(createDesktopServices().network.request(args), (error) => error === failure)
})

test("all families adapt Web Storage methods and tolerate an inaccessible getter", (t) => {
  const data = new Map()
  mockGlobal(t, "localStorage", {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  })
  mockGlobal(t, "sessionStorage", undefined)
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() { throw new DOMException("access denied", "SecurityError") },
  })
  for (const createServices of [createDesktopServices, createMobileServices, createWebServices]) {
    const { storage, sessionStorage } = createServices()
    assert.equal(storage.get("key"), null)
    storage.set("key", "value")
    assert.equal(storage.get("key"), "value")
    storage.remove("key")
    assert.equal(storage.get("key"), null)
    assert.equal(sessionStorage, undefined)
  }
})

test("web locale and lifecycle preserve unsupported-operation results", async () => {
  const { locale, lifecycle } = createWebServices()
  assert.equal(await locale.listExternal(), null)
  assert.equal(await locale.delete("en"), false)
  await assert.rejects(locale.write("en", "{}"), /unavailable/)
  const unsubscribe = lifecycle.onBackRequested(() => assert.fail("unexpected back event"))
  unsubscribe()
  await assert.rejects(lifecycle.exit(), /not supported/)
})

test("mobile lifecycle unregisters even if cleanup precedes registration", { timeout: 1000 }, async (t) => {
  const registration = Promise.withResolvers()
  const unregistered = Promise.withResolvers()
  const invoke = t.mock.fn((command, args) => {
    if (command === "plugin:app|register_listener") return registration.promise
    unregistered.resolve([command, args])
    return Promise.resolve()
  })
  mockGlobal(t, "window", { __TAURI_INTERNALS__: { invoke, transformCallback: () => 17 } })
  const unsubscribe = createMobileServices().lifecycle.onBackRequested(() => {})
  unsubscribe()
  registration.resolve()

  assert.deepEqual(await unregistered.promise, [
    "plugin:app|remove_listener",
    { event: "back-button", channelId: 17 },
  ])
})

test("API still coalesces cached GETs and recovers native status in the consumer", async (t) => {
  const { api, apiStatus, clearApiCache } = await server.ssrLoadModule("/src/api.ts")
  t.after(() => {
    resetPlatformRuntimeForTests()
    clearApiCache()
  })
  const invoke = t.mock.fn(async () => '{"ok":true}')
  mockGlobal(t, "navigator", { userAgent: "Linux" })
  mockGlobal(t, "window", { __TAURI_INTERNALS__: { invoke } })
  initializePlatformRuntime()

  const [first, second] = await Promise.all([api.posts(), api.posts()])
  assert.deepEqual(first, { ok: true })
  assert.equal(second, first)
  assert.equal(invoke.mock.callCount(), 1)
  assert.deepEqual(invoke.mock.calls[0].arguments.slice(0, 2), [
    "api_request",
    { path: "/posts", method: "GET", sessionKey: null, timeoutSecs: 30 },
  ])

  window.__TAURI_INTERNALS__.invoke = async () => { throw "STATUS=401 BODY=fixture" }
  await assert.rejects(api.version(), (error) => apiStatus(error) === 401)
})

test("backup restore leaves IndexedDB untouched when follow storage is unavailable", async (t) => {
  const { applyBackup, BACKUP_TYPE } = await server.ssrLoadModule("/src/backup.ts")
  t.after(resetPlatformRuntimeForTests)
  const open = t.mock.fn(() => assert.fail("IndexedDB was opened"))
  mockGlobal(t, "window", {})
  mockGlobal(t, "navigator", { userAgent: "Linux" })
  mockGlobal(t, "localStorage", undefined)
  mockGlobal(t, "indexedDB", { open })
  initializePlatformRuntime()

  await assert.rejects(applyBackup(JSON.stringify({ type: BACKUP_TYPE })), /Follow storage unavailable/)
  assert.equal(open.mock.callCount(), 0)
})
