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
const { createLocaleRepository } = await server.ssrLoadModule("/src/infrastructure/locale-repository.ts")
const { createPostDetailUseCases } = await server.ssrLoadModule("/src/application/post-detail.ts")
const { createHomePostUseCase, createCreatorPostUseCase } = await server.ssrLoadModule("/src/application/post-pages.ts")
const { toCreatorIndexRows } = await server.ssrLoadModule("/src/infrastructure/creator-index-dto.ts")
const { createCreatorUseCases } = await server.ssrLoadModule("/src/application/creators.ts")
const validateFixture = (text) => text === "{}" ? [] : [{ kind: "json" }]

test("original post links support service URL variants without matching unrelated hosts or pages", async () => {
  const { parseOriginalPostLink } = await server.ssrLoadModule("/src/original-post-link.ts")
  const fanbox = { service: "fanbox", creatorSlug: "creator", postId: "123" }
  assert.deepEqual(parseOriginalPostLink("https://creator.fanbox.cc/posts/123?ref=example"), fanbox)
  assert.deepEqual(parseOriginalPostLink("//www.fanbox.cc/@Creator/posts/123"), fanbox)
  assert.deepEqual(parseOriginalPostLink("https://www.patreon.com/creator/posts/title-text-456"), {
    service: "patreon", creatorSlug: "creator", postId: "456", titleQuery: "title text",
  })
  assert.equal(parseOriginalPostLink("https://www.patreon.com/posts/456").postId, "456")
  assert.equal(parseOriginalPostLink("https://www.patreon.com/join/creator"), null)
  assert.equal(parseOriginalPostLink("https://www.patreon.com.example.net/posts/456"), null)
})

test("locale CRUD validates input and sends private and shared writes to their own targets", async (t) => {
  const write = t.mock.fn(async () => {})
  const writeSecondary = t.mock.fn(async () => {})
  const remove = t.mock.fn(async () => true)
  const locales = createLocaleUseCases({ writePrivate: write, writeSecondary, deletePrivate: remove }, validateFixture)
  assert.deepEqual(await locales.addLocale("bad/code", "{}"), { kind: "invalid-code" })
  assert.deepEqual(await locales.addLocale("en", "invalid"), { kind: "invalid-json", issues: [{ kind: "json" }] })
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
    failures: [{ name: "ja.json", reason: "size" }, { name: "fr.json", reason: "json", issues: [{ kind: "json" }] },
      { name: "../de.json", reason: "code" }],
  })
  assert.equal(await locales.deleteLocale("en"), true)
  assert.deepEqual(write.mock.calls.map(({ arguments: args }) => args), [["en", "{}"]])
  assert.deepEqual(writeSecondary.mock.calls.map(({ arguments: args }) => args), [["en", "{}"]])
  assert.deepEqual(remove.mock.calls[0].arguments, ["en"])
})

test("locale import snapshots input and reports write failure without stopping the batch", async () => {
  const pending = Promise.withResolvers()
  const locales = createLocaleUseCases({
    async writePrivate(code) { if (code === "en") throw new Error("write failed") },
  }, validateFixture)
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

const postContext = { service: "fanbox", creatorId: "creator", postId: "post" }
const post = { service: "fanbox", user: "creator", id: "post" }

test("post detail rejects invalid routes and sorts revisions without mutating the source", async (t) => {
  const revisions = [{ added: "bad" }, { added: "2024-01-01" }, { added: "2025-01-01" }]
  const fetchPost = t.mock.fn(async () => post)
  const detail = createPostDetailUseCases({
    post: fetchPost, postRevisions: async () => revisions,
    status: () => null, info() {}, warn() {}, error() {},
  })
  await assert.rejects(detail.loadPostDetail({ ...postContext, postId: "a/b" }), {
    name: "InvalidPostContextError", code: "invalid-post-context", message: /不正/,
  })
  assert.equal(fetchPost.mock.callCount(), 0)
  const result = await detail.loadPostDetail(postContext)
  assert.equal(result.post, post)
  assert.deepEqual(result.revisions, [revisions[2], revisions[1], revisions[0]])
  assert.equal(revisions[0].added, "bad")
})

test("post detail keeps the post on revision errors and cancels before starting revisions", async (t) => {
  const missing = new Error("missing")
  const failure = new Error("offline")
  const pending = Promise.withResolvers()
  const fetchRevisions = t.mock.fn(async () => { throw missing })
  const deps = {
    post: async () => post, postRevisions: fetchRevisions,
    postComments: async () => { throw failure },
    status: (error) => error === missing ? 404 : null, info() {}, warn() {}, error() {},
  }
  const detail = createPostDetailUseCases(deps)
  assert.deepEqual(await detail.loadPostDetail(postContext), { post, revisions: [], revisionsError: null })
  deps.postRevisions = async () => { throw failure }
  assert.deepEqual(await detail.loadPostDetail(postContext), { post, revisions: [], revisionsError: failure })
  assert.deepEqual(await detail.loadPostComments(postContext), [])
  const controller = new AbortController()
  deps.post = () => pending.promise
  deps.postRevisions = fetchRevisions
  const result = detail.loadPostDetail(postContext, controller.signal)
  controller.abort()
  pending.resolve(post)
  await assert.rejects(result, { name: "AbortError" })
  assert.equal(fetchRevisions.mock.callCount(), 1)
})

test("home posts preserve query and offset and stop on a short page", async (t) => {
  const posts = Array.from({ length: 50 }, (_, id) => ({ id }))
  const fetchPosts = t.mock.fn(async ({ o }) => o === 0 ? posts : posts.slice(0, 2))
  const loadHomePosts = createHomePostUseCase(fetchPosts)
  assert.deepEqual(await loadHomePosts({ query: "", offset: 0 }), { posts, done: false })
  assert.deepEqual(await loadHomePosts({ query: "keyword", offset: 50 }), { posts: posts.slice(0, 2), done: true })
  assert.deepEqual(fetchPosts.mock.calls.map(({ arguments: args }) => args[0]), [
    { q: undefined, o: 0 }, { q: "keyword", o: 50 },
  ])
})

test("creator paging forwards tags and leaves unfiltered requests unchanged", async (t) => {
  const fetchPosts = t.mock.fn(async () => [])
  const loadCreatorPosts = createCreatorPostUseCase(fetchPosts)
  assert.deepEqual(await loadCreatorPosts({ service: "fanbox", id: "42", tags: ["x", "y"], offset: 50 }), { posts: [], done: true })
  await loadCreatorPosts({ service: "fanbox", id: "42", tags: [], offset: 0 })
  assert.deepEqual(fetchPosts.mock.calls.map(({ arguments: args }) => args), [
    ["fanbox", "42", { tag: ["x", "y"], o: 50 }],
    ["fanbox", "42", { tag: undefined, o: 0 }],
  ])
})

test("creator index reuses eligible legacy rows and preserves direct post links", async (t) => {
  const row = { id: "42", name: "Example", service: "fanbox", publicIdLower: "example", updated: 0 }
  const save = t.mock.fn(async () => {})
  const resetIndex = t.mock.fn()
  const creators = createCreatorUseCases({
    isCurrent: async () => false, count: async () => 1,
    search: async () => ({ rows: [row], service: "fanbox", postId: "123" }),
    legacyRows: async () => [row], save, resetIndex,
    fetchRows: () => assert.fail("legacy migration should not download"),
  })
  assert.equal(await creators.needsCreatorIndexBuild(await creators.countCreators()), true)
  assert.equal(await creators.buildCreatorIndex(1), 1)
  assert.deepEqual(save.mock.calls[0].arguments, [[row]])
  assert.equal(resetIndex.mock.callCount(), 1)
  assert.deepEqual(await creators.searchCreatorIndex("query"), {
    rows: [row], postLink: { service: "fanbox", creatorId: "42", postId: "123", name: "Example" },
  })
})

test("creator refresh keeps cache clearing order, maps full rows and skips writes after cancellation", async () => {
  const calls = []
  const data = [{ service: "fanbox", id: "42", name: "Example", public_id: "Slug", updated: "2025-01-01" }]
  const deps = {
    isCurrent: async () => true,
    clearApiCache: () => calls.push("clear API"),
    resetIndex: () => calls.push("invalidate index"),
    fetchRows: async () => { calls.push("download"); return toCreatorIndexRows(data) },
    save: async (rows) => calls.push(rows),
  }
  const creators = createCreatorUseCases(deps)
  assert.equal(await creators.needsCreatorIndexBuild(1), false)
  assert.equal(await creators.refreshCreatorIndex(), 1)
  assert.deepEqual(calls, ["clear API", "invalidate index", "download", [{
    key: "fanbox:42", service: "fanbox", id: "42", name: "Example", nameLower: "example",
    publicId: "Slug", publicIdLower: "slug", updated: Date.parse("2025-01-01"),
  }]])

  const controller = new AbortController()
  const deferred = Promise.withResolvers()
  deps.fetchRows = () => deferred.promise
  deps.save = () => assert.fail("cancelled download was persisted")
  const result = creators.buildCreatorIndex(0, controller.signal)
  controller.abort()
  deferred.resolve(data)
  await assert.rejects(result, { name: "AbortError" })
})

test("locale repository preserves catalogue, capabilities and deletion results", async () => {
  const catalogue = { dir: "locales", files: [{ code: "en", json: "{}" }], invalid: ["bad.json"] }
  const failure = new Error("disk unavailable")
  const service = {
    catalogue,
    listExternal() { return Promise.resolve(this.catalogue) },
    async write() { throw failure },
    delete: async () => false,
  }
  assert.equal(createLocaleRepository(undefined), undefined)
  const repository = createLocaleRepository(service)
  assert.equal(await repository.listPrivate(), catalogue)
  assert.equal(repository.listSecondary, undefined)
  assert.equal(repository.writeSecondary, undefined)
  assert.equal(await repository.deletePrivate("en"), false)
  await assert.rejects(repository.writePrivate("en", "{}"), (error) => error === failure)
})

test("creator DTO normalization preserves missing fields and supported date representations", () => {
  const rows = toCreatorIndexRows([
    { service: "patreon", id: "1", name: "Legacy" },
    { service: "fanbox", id: "2", name: "Mixed", public_id: "Slug", updated: "1672531200", indexed: "invalid", favorited: 0 },
  ])
  assert.deepEqual(rows, [
    { key: "patreon:1", id: "1", service: "patreon", name: "Legacy", nameLower: "legacy" },
    { key: "fanbox:2", id: "2", service: "fanbox", name: "Mixed", nameLower: "mixed",
      publicId: "Slug", publicIdLower: "slug", updated: 1672531200, indexed: 0, favorited: 0 },
  ])
})

test("native locale import stages conflicts with the existing code and writes only new files", async (t) => {
  const writePrivate = t.mock.fn(async () => {})
  const picker = { open: async () => ({ kind: "cancelled" }) }
  const repository = {
    listPrivate: async () => ({ files: [{ code: "en", json: "{}" }], invalid: ["de.json"] }),
    writePrivate,
  }
  const locales = createLocaleUseCases(repository, validateFixture, picker)
  assert.deepEqual(await locales.pickLocale(), { kind: "cancelled" })
  for (const code of ["EN", "de"]) {
    picker.open = async () => ({ kind: "selected", name: code + ".json", json: "{}" })
    assert.deepEqual(await locales.pickLocale(), { kind: "conflict", code: code.toLowerCase(), json: "{}" })
  }
  picker.open = async () => ({ kind: "selected", name: "es.json", json: "bad" })
  assert.deepEqual(await locales.pickLocale(), { kind: "invalid-json", issues: [{ kind: "json" }] })
  assert.equal(writePrivate.mock.callCount(), 0)
  picker.open = async () => ({ kind: "selected", name: "es.json", json: "{}" })
  assert.deepEqual(await locales.pickLocale(), { kind: "saved", code: "es" })
  assert.deepEqual(writePrivate.mock.calls[0].arguments, ["es", "{}", false])
})

test("native locale export sends the selected private file and propagates cancel", async (t) => {
  const save = t.mock.fn(async () => ({ kind: "cancelled" }))
  const repository = { listPrivate: async () => ({ files: [{ code: "es", json: "{}" }], invalid: [] }) }
  const locales = createLocaleUseCases(repository, validateFixture, { save })
  assert.deepEqual(await locales.exportPrivateLocale("ja"), { kind: "missing" })
  assert.deepEqual(await locales.exportPrivateLocale("es"), { kind: "cancelled" })
  assert.deepEqual(save.mock.calls[0].arguments, ["es", "{}"])
})

test("app-folder locale export uses its own destination and returns the saved path", async (t) => {
  const save = t.mock.fn(async () => ({ kind: "cancelled" }))
  const saveToAppDirectory = t.mock.fn(async () => ({ kind: "saved", path: "/app/Documents/Languages/es.json" }))
  const repository = { listPrivate: async () => ({ files: [{ code: "es", json: "{}" }] }) }
  const locales = createLocaleUseCases(repository, validateFixture, { save, saveToAppDirectory })
  assert.equal(locales.canSaveLocaleToAppDirectory, true)
  assert.deepEqual(await locales.exportPrivateLocale("es", "app"), {
    kind: "saved", path: "/app/Documents/Languages/es.json",
  })
  assert.deepEqual(saveToAppDirectory.mock.calls[0].arguments, ["es", "{}"])
  assert.equal(save.mock.callCount(), 0)
  assert.equal(createLocaleUseCases(repository, validateFixture, { save }).canSaveLocaleToAppDirectory, false)
})

test("only the secondary locale path is exposed while both dictionaries are loaded", async () => {
  const { refreshLocales, secondaryLocaleFolder, invalidLocaleFiles, loadLocale, t } =
    await server.ssrLoadModule("/src/i18n.ts")
  const file = (label) => ({ code: "es", json: JSON.stringify({ "locale.name": "Español", "nav.home": label }) })
  const privateCatalogue = { dir: "/data/data/example/locales", invalid: [], files: [file("Private")] }
  const publicCatalogue = { dir: "/storage/emulated/0/Android/data/example/files/Documents/Languages", invalid: [], files: [file("Secondary")] }
  try {
    await refreshLocales({ listPrivate: async () => privateCatalogue, listSecondary: async () => publicCatalogue })
    assert.equal(secondaryLocaleFolder(), publicCatalogue.dir)
    assert.equal(await loadLocale("es"), "es")
    assert.equal(t("nav.home"), "Secondary")
    const invalidCatalogue = { ...publicCatalogue, files: [{
      code: "es", json: JSON.stringify({ "locale.name": "Español", "nav.home": "Bad {{extra}}" }),
    }] }
    await refreshLocales({ listPrivate: async () => privateCatalogue, listSecondary: async () => invalidCatalogue })
    assert.match(invalidLocaleFiles()[0], /secondary:es\.json.*nav\.home/)
    assert.equal(await loadLocale("es"), "es")
    assert.equal(t("nav.home"), "Private")
    assert.equal(t("nav.settings"), "設定")
    await refreshLocales({ listPrivate: async () => privateCatalogue })
    assert.equal(secondaryLocaleFolder(), "")
    assert.equal(await loadLocale("es"), "es")
    assert.equal(t("nav.home"), "Private")
  } finally {
    await refreshLocales(undefined)
    await loadLocale("ja")
  }
})

test("locale validation allows partial imports and checks the same keys and variables in complete dictionaries", async () => {
  const { validateLocale, MAX_LOCALE_BYTES } = await server.ssrLoadModule("/src/domain/locale-validation.ts")
  const reference = { "locale.name": "日本語", "nav.home": "ホーム", "items.summary": "{{count}} 件・{{name}}" }
  const partial = JSON.stringify({ "locale.name": "English", "items.summary": "{{name}}: {{ count }} items" })
  assert.deepEqual(validateLocale(partial, reference).issues, [])
  assert.deepEqual(validateLocale(partial, reference, true).issues, [{ kind: "missing", key: "nav.home" }])
  const invalid = JSON.stringify({
    "locale.name": "English", "nav.home": " ", "nav.setings": "Settings",
    "items.summary": "{{count}} items for {{typo}}",
  })
  const issues = [
    { kind: "value", key: "nav.home" }, { kind: "unknown", key: "nav.setings" },
    { kind: "variables", key: "items.summary" },
  ]
  assert.deepEqual(validateLocale(invalid, reference).issues, issues)
  assert.deepEqual(validateLocale(invalid, reference, true).issues, issues)
  assert.deepEqual(validateLocale("日本語".repeat(Math.ceil(MAX_LOCALE_BYTES / 9))).issues, [{ kind: "size" }])
  const locales = createLocaleUseCases({
    writePrivate: async () => assert.fail("invalid locale was saved"),
  }, (text) => validateLocale(text, reference).issues)
  assert.deepEqual(await locales.addLocale("en", invalid), { kind: "invalid-json", issues })
})
