import assert from "node:assert/strict"
import { test } from "node:test"
import {
  collectExternalLinks,
  collectImageUrls,
  isInternalHost,
  isThumbnailUrl,
  resolveImageUrl,
} from "../src/post-image-urls.ts"

test("image URLs are resolved against the post URL", () => {
  assert.equal(
    resolveImageUrl("/images/abc.png", "https://www.pawchive.pw/posts/1"),
    "https://www.pawchive.pw/images/abc.png",
  )
  assert.equal(
    resolveImageUrl("https://example.com/a.jpg", "https://www.pawchive.pw/posts/1"),
    "https://example.com/a.jpg",
  )
})

test("thumbnails, videos, data and non-http URLs are excluded", () => {
  const base = "https://example.com/post"
  assert.equal(isThumbnailUrl(new URL("https://img.pawchive.pw/thumbnail/x.jpg")), true)
  assert.equal(resolveImageUrl("https://img.pawchive.pw/thumbnail/x.jpg", base), null)
  assert.equal(resolveImageUrl("https://img.pawchive.pw/images/x.jpg", base), "https://img.pawchive.pw/images/x.jpg")
  for (const source of [
    "",
    "   ",
    "data:image/png;base64,AAAA",
    "blob:https://example.com/1234",
    "javascript:alert(1)",
    "ftp://example.com/a.png",
    "https://example.com/movie.mp4",
    "https://example.com/clip.webm",
  ]) {
    assert.equal(resolveImageUrl(source, base), null, source)
  }
})

test("duplicate URLs are kept once and order is preserved", () => {
  const images = collectImageUrls(
    [
      "/a.png",
      "https://example.com/b.png",
      "/a.png",
      "https://example.com/b.png",
      "/c.png",
    ],
    "https://example.com/post",
  )
  assert.deepEqual(
    images.map((image) => image.url),
    ["https://example.com/a.png", "https://example.com/b.png", "https://example.com/c.png"],
  )
})

test("external links skip services, fragments and mail links", () => {
  assert.equal(isInternalHost("www.pawchive.pw"), true)
  assert.equal(isInternalHost("img.pawchive.pw"), true)
  assert.equal(isInternalHost("www.fanbox.cc"), true)
  assert.equal(isInternalHost("example.com"), false)
  assert.equal(isInternalHost("notpawchive.pw"), false)

  const links = collectExternalLinks(
    [
      "https://example.com/gallery",
      "/relative",
      "#section",
      "mailto:a@example.com",
      "https://www.pawchive.pw/posts/1",
      "https://example.com/gallery",
      "https://b.fanbox.cc/@a/posts/1",
      "https://example.org/other",
    ],
    "https://example.com/post/1",
  )
  assert.deepEqual(links, [
    "https://example.com/gallery",
    "https://example.com/relative",
    "https://example.org/other",
  ])
})

test("external link collection respects the limit", () => {
  const hrefs = Array.from({ length: 30 }, (_, index) => `https://example.com/${index}`)
  assert.equal(collectExternalLinks(hrefs).length, 10)
  assert.equal(collectExternalLinks(hrefs, undefined, 3).length, 3)
})
