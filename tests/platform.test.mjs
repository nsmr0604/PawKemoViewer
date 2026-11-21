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

test("API scheduler spaces starts and enforces the concurrency limit", async (t) => {
  const { api, clearApiCache } = await server.ssrLoadModule("/src/api.ts")
  t.after(() => { resetPlatformRuntimeForTests(); clearApiCache() })
  const starts = []
  mockGlobal(t, "navigator", { userAgent: "Linux" })
  mockGlobal(t, "window", { __TAURI_INTERNALS__: { invoke: (command, { path }) => {
    assert.equal(command, "api_request")
    const pending = Promise.withResolvers()
    starts.push({ path, time: Date.now(), finish: pending.resolve })
    return pending.promise
  } } })
  initializePlatformRuntime()
  const now = Date.now() + 1000
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now })
  const requests = ["a", "b", "c", "d"].map((q) => api.posts({ q }))
  assert.equal(starts.length, 1)
  t.mock.timers.tick(249)
  assert.equal(starts.length, 1)
  t.mock.timers.tick(1)
  t.mock.timers.tick(250)
  assert.deepEqual(starts.map(({ time }) => time - now), [0, 250, 500])
  t.mock.timers.tick(500)
  assert.equal(starts.length, 3)
  starts[0].finish("[]")
  await requests[0]
  assert.equal(starts.at(-1).path, "/posts?q=d")
  assert.equal(starts.at(-1).time - now, 1000)
  starts.slice(1).forEach(({ finish }) => finish("[]"))
  await Promise.all(requests)
})

test("GET cache expiry, failure retry and session invalidation preserve transport behavior", async (t) => {
  const { api, clearApiCache, getSettings, updateSettings } = await server.ssrLoadModule("/src/api.ts")
  t.after(() => { updateSettings({ sessionKey: "" }); resetPlatformRuntimeForTests(); clearApiCache() })
  const starts = []
  mockGlobal(t, "navigator", { userAgent: "Linux" })
  mockGlobal(t, "window", { dispatchEvent() {}, __TAURI_INTERNALS__: { invoke: (_command, args) => {
    const pending = Promise.withResolvers()
    starts.push({ ...args, ...pending })
    return pending.promise
  } } })
  initializePlatformRuntime()
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() + 10000 })

  const old = api.accountFavorites("post")
  assert.equal(starts[0].sessionKey, null)
  updateSettings({ sessionKey: "fixture-session" })
  assert.equal(getSettings().sessionKey, "fixture-session")
  const current = api.accountFavorites("post")
  t.mock.timers.tick(250)
  assert.equal(starts[1].sessionKey, "fixture-session")
  starts[1].resolve('["current"]')
  assert.deepEqual(await current, ["current"])
  starts[0].resolve('["previous"]')
  assert.deepEqual(await old, ["previous"])
  assert.deepEqual(await api.accountFavorites("post"), ["current"])
  assert.equal(starts.length, 2)

  t.mock.timers.tick(60001)
  const expired = api.accountFavorites("post")
  assert.equal(starts.length, 3)
  starts[2].reject("STATUS=503 BODY=fixture")
  await assert.rejects(expired)
  const retry = api.accountFavorites("post")
  t.mock.timers.tick(250)
  assert.equal(starts.length, 4)
  starts[3].resolve('["retried"]')
  assert.deepEqual(await retry, ["retried"])
})

test("GET cache evicts the oldest inserted entry at its limit", async (t) => {
  const { api, clearApiCache } = await server.ssrLoadModule("/src/api.ts")
  t.after(() => { resetPlatformRuntimeForTests(); clearApiCache() })
  const requests = []
  mockGlobal(t, "navigator", { userAgent: "Linux" })
  mockGlobal(t, "window", { __TAURI_INTERNALS__: { invoke: async (_command, { path }) => {
    requests.push(path)
    return "[]"
  } } })
  initializePlatformRuntime()
  // Start after the earlier fake-clock test and stay within one TTL window.
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() + 120000 })
  for (let i = 0; i <= 150; i++) {
    await api.posts({ q: String(i) })
    t.mock.timers.tick(250)
  }
  await api.posts({ q: "1" })
  assert.equal(requests.length, 151)
  await api.posts({ q: "0" })
  assert.equal(requests.length, 152)
  assert.equal(requests.at(-1), "/posts?q=0")
})

test("revision requests preserve typed validation errors and encode valid arguments", async (t) => {
  const { api, clearApiCache } = await server.ssrLoadModule("/src/api.ts")
  t.after(() => { resetPlatformRuntimeForTests(); clearApiCache() })
  const invoke = t.mock.fn(async () => "[]")
  mockGlobal(t, "navigator", { userAgent: "Linux" })
  mockGlobal(t, "window", { __TAURI_INTERNALS__: { invoke } })
  initializePlatformRuntime()
  // The earlier cache test advances the fake clock across a full cache window.
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() + 200000 })
  await assert.rejects(api.postRevisions("fanbox", "42", "a/b"), {
    name: "InvalidPostContextError", code: "invalid-post-context",
    message: /Invalid post revision context/,
  })
  assert.equal(invoke.mock.callCount(), 0)
  assert.deepEqual(await api.postRevisions("fanbox", "42", "a b"), [])
  assert.equal(invoke.mock.calls[0].arguments[1].path, "/fanbox/user/42/post/a%20b/revisions")
})

test("mobile locale picker routes selected-file IO through native IPC", async (t) => {
  const { createMobileServices, createWebServices, createDesktopServices } =
    await server.ssrLoadModule("/src/platform/families/index.ts")
  const invoke = t.mock.fn(async (command) => command === "pick_locale_file"
    ? { kind: "selected", name: "es.json", json: "{}" }
    : { kind: "cancelled" })
  mockGlobal(t, "window", { __TAURI_INTERNALS__: { invoke } })
  const picker = createMobileServices().localePicker
  assert.deepEqual(await picker.open(), { kind: "selected", name: "es.json", json: "{}" })
  assert.deepEqual(await picker.save("es", "{}"), { kind: "cancelled" })
  assert.deepEqual(invoke.mock.calls.map(({ arguments: args }) => args.slice(0, 2)), [
    ["pick_locale_file", {}], ["save_locale_file", { code: "es", json: "{}" }],
  ])
  assert.equal(createWebServices().localePicker, undefined)
  assert.equal(createDesktopServices().localePicker, undefined)
})

test("app-specific language export is advertised on Android only", async (t) => {
  const { createMobileServices } = await server.ssrLoadModule("/src/platform/families/index.ts")
  const invoke = t.mock.fn(async () => ({ kind: "saved", path: "/app/Documents/Languages/es.json" }))
  mockGlobal(t, "window", { __TAURI_INTERNALS__: { invoke } })
  assert.equal(createMobileServices("ios").localePicker.saveToAppDirectory, undefined)
  const result = await createMobileServices("android").localePicker.saveToAppDirectory("es", "{}")
  assert.equal(result.path, "/app/Documents/Languages/es.json")
  assert.deepEqual(invoke.mock.calls[0].arguments.slice(0, 2), [
    "save_locale_file_to_app_directory", { code: "es", json: "{}" },
  ])
})
