"""Run the adaptive UI matrix against a local Vite server with fixture IPC."""

import os

from playwright.sync_api import expect, sync_playwright


APP_URL = "http://127.0.0.1:5181"
FIXTURE = """
(() => {
  const post = {
    service: "patreon", user: "42", id: "123", title: "UI Fixture Post",
    content: "UI Fixture Body", published: "2025-01-01",
    file: {}, embed: {}, attachments: []
  }
  window.fixtureCalls = []
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => 1,
    invoke: async (command, args) => {
      window.fixtureCalls.push(command)
      if (command === "plugin:app|register_listener") window.fixtureBack = args.handler
      if (command === "list_locale_files") return { dir: "", files: [], invalid: [] }
      if (command === "plugin:app|version") return "0.5.0"
      if (command !== "api_request") return null
      if (args.path.endsWith("/revisions")) throw "STATUS=404 BODY=[]"
      if (args.path === "/patreon/user/42/post/123") return JSON.stringify(post)
      if (args.path.startsWith("/posts")) return JSON.stringify([post])
      return "[]"
    }
  }
})()
"""


def test_page(browser, *, width, mobile=False):
    mobile_options = {
        "has_touch": True,
        "is_mobile": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
    } if mobile else {}
    page = browser.new_page(viewport={"width": width, "height": 800}, **mobile_options)
    page.set_default_timeout(5000)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(f"{APP_URL}/") else route.abort())
    page.add_init_script(FIXTURE)
    page.goto(APP_URL, wait_until="domcontentloaded")
    expect(page.get_by_text("UI Fixture Post", exact=True)).to_be_visible()
    return page


def desktop_matrix(browser):
    page = test_page(browser, width=1280)
    try:
        expect(page.locator(".nav-rail")).to_be_visible()
        expect(page.locator(".bottom-nav")).to_have_count(0)
        search = page.locator("input[type=search]")
        page.keyboard.press("/")
        expect(search).to_be_focused()
        search.fill("unfinished query")
        page.evaluate("window.previousSearch = document.activeElement")
        page.set_viewport_size({"width": 767, "height": 800})
        expect(page.locator(".bottom-nav")).to_be_visible()
        expect(page.locator(".nav-rail")).to_have_count(0)
        assert page.evaluate("document.activeElement === window.previousSearch")
        expect(search).to_have_value("unfinished query")
        expect(page.get_by_text("UI Fixture Post", exact=True)).to_be_visible()
        page.set_viewport_size({"width": 768, "height": 800})
        expect(page.locator(".nav-rail")).to_be_visible()
        expect(search).to_be_focused()
        search.blur()
        page.keyboard.press("s")
        expect(page.locator(".nav-rail [aria-current=page]")).to_contain_text("設定")
        page.get_by_role("button", name="📱 モバイル").click()
        expect(page.locator(".bottom-nav [aria-current=page]")).to_contain_text("設定")
        page.get_by_role("button", name="🖥️ デスクトップ").click()
        expect(page.locator(".nav-rail [aria-current=page]")).to_contain_text("設定")
        page.locator(".top-bar .btn-account").click()
        expect(page.locator(".detail-bar")).to_be_visible()
        expect(page.locator(".nav-rail, .bottom-nav")).to_have_count(0)
        page.keyboard.press("Escape")
        expect(page.locator(".nav-rail [aria-current=page]")).to_contain_text("設定")
    finally:
        page.context.close()


def mobile_matrix(browser):
    page = test_page(browser, width=320, mobile=True)
    try:
        bottom = page.locator(".bottom-nav")
        expect(bottom).to_be_visible()
        expect(bottom.locator("[aria-current=page]")).to_contain_text("ホーム")
        list_toggle = page.get_by_title("リスト表示", exact=True)
        assert list_toggle.bounding_box()["height"] >= 44
        list_toggle.tap()
        expect(list_toggle).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".post-row-item")).to_be_visible()
        page.get_by_role("button", name="FANBOX", exact=True).tap()
        expect(page.get_by_text("UI Fixture Post", exact=True)).to_have_count(0)
        page.get_by_role("button", name="Patreon", exact=True).tap()
        expect(page.get_by_text("UI Fixture Post", exact=True)).to_be_visible()

        search = page.locator("input[type=search]")
        search.fill("x" * 320)
        page.locator(".search-bar button").tap()
        expect(page.locator(".view-mode-bar .hint-row")).to_contain_text("x" * 320)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.get_by_text("UI Fixture Post", exact=True).tap()
        expect(page.locator(".detail-bar")).to_be_visible()
        expect(page.get_by_text("UI Fixture Body", exact=True)).to_be_visible()
        page.wait_for_function("window.fixtureBack !== undefined")
        page.evaluate("window.fixtureBack.onmessage({ canGoBack: true })")
        expect(search).to_have_value("x" * 320)
        page.evaluate("window.fixtureBack.onmessage({ canGoBack: false })")
        page.wait_for_function("window.fixtureCalls.includes('plugin:app|exit')")
        page.set_viewport_size({"width": 900, "height": 800})
        expect(bottom).to_be_visible()
        expect(page.locator(".nav-rail")).to_have_count(0)
    finally:
        page.context.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get("CHROMIUM_BIN", "/usr/bin/chromium"),
            args=["--disable-dev-shm-usage", "--no-proxy-server"],
        )
        try:
            desktop_matrix(browser)
            mobile_matrix(browser)
        finally:
            browser.close()
    print("PASS: desktop resize and focus, shell settings, keyboard, touch, long query and native Back fixture")
