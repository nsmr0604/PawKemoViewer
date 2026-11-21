import assert from "node:assert/strict"
import { test } from "node:test"
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
