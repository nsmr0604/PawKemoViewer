"""Run the adaptive UI matrix against a local Vite server with fixture IPC."""

import os

from playwright.sync_api import expect, sync_playwright


APP_URL = os.environ.get("PKV_UI_URL", "http://127.0.0.1:5181")
EXPECT_DIAGNOSTICS = os.environ.get("PKV_EXPECT_DEBUG_DIAG", "1") == "1"
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
      if (command === "list_secondary_locale_files") return {
        dir: "/storage/emulated/0/Android/data/com.nsmr0604.pawkemoviewer/files/Documents/Languages",
        files: [], invalid: []
      }
      if (command === "plugin:app|version") return "0.5.0"
      if (command === "login_request") return { ok: true, session: "fixture-session" }
      if (command === "plugin:app-icon|is_supported") return { value: /iPhone|iPad/.test(navigator.userAgent) }
      if (command === "plugin:app-icon|get_name") return { value: window.fixtureAlternateIcon || null }
      if (command === "plugin:app-icon|change") window.fixtureAlternateIcon = args.options.name
      if (command === "plugin:app-icon|reset") window.fixtureAlternateIcon = null
      if (command === "set_android_launcher_icon") window.fixtureLauncherLight = args.light
      if (command !== "api_request") return null
      if (args.path.endsWith("/revisions")) throw "STATUS=404 BODY=[]"
      if (args.path === "/patreon/user/42/post/123") return JSON.stringify(post)
      if (args.path.startsWith("/posts")) return JSON.stringify([post])
      return "[]"
    }
  }
})()
"""


def test_page(browser, *, width, mobile=False, init_script=None):
    mobile_options = {
        "has_touch": True,
        "is_mobile": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
    } if mobile else {}
    page = browser.new_page(viewport={"width": width, "height": 800}, **mobile_options)
    page.set_default_timeout(5000)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(f"{APP_URL}/") else route.abort())
    page.add_init_script(FIXTURE)
    if init_script:
        page.add_init_script(init_script)
    page.goto(APP_URL, wait_until="domcontentloaded")
    expect(page.get_by_text("UI Fixture Post", exact=True)).to_be_visible()
    return page


def desktop_matrix(browser):
    page = test_page(browser, width=1280)
    try:
        expect(page.locator(".nav-rail")).to_be_visible()
        expect(page.locator(".bottom-nav, .top-bar")).to_have_count(0)
        expect(page.locator(".nav-rail-brand img")).to_have_attribute("src", "/src-tauri/app-icons/pc.png")
        search = page.locator("input[type=search]")
        page.keyboard.press("/")
        expect(search).to_be_focused()
        search.fill("unfinished query")
        page.evaluate("window.previousSearch = document.activeElement")
        page.set_viewport_size({"width": 767, "height": 800})
        expect(page.locator(".bottom-nav")).to_be_visible()
        expect(page.locator(".top-bar")).to_be_visible()
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
        sections = page.locator(".settings-nav")
        expect(sections.get_by_role("button")).to_have_count(9 if EXPECT_DIAGNOSTICS else 8)
        expect(sections.locator("[aria-current=page]")).to_contain_text("表示")
        diagnostics = page.locator("#settings-diagnostics")
        diagnostics_link = sections.get_by_role("button", name="開発・診断")
        toggle = page.get_by_role("switch", name="開発・ログ項目を表示")
        if EXPECT_DIAGNOSTICS:
            expect(toggle).to_have_count(0)
            diagnostics_link.click()
            expect(diagnostics.get_by_text("詳細診断", exact=True)).to_be_visible()
        else:
            expect(diagnostics_link).to_have_count(0)
            expect(diagnostics).to_have_count(0)
            sections.get_by_role("button", name="情報", exact=True).click()
            expect(toggle).to_have_attribute("aria-checked", "false")
            toggle.click()
            diagnostics_link.click()
            expect(diagnostics.get_by_text("セッションキーの手動設定", exact=True)).to_be_visible()
            expect(diagnostics.get_by_text("ログ", exact=True)).to_be_visible()
            expect(diagnostics.get_by_text("詳細診断", exact=True)).to_have_count(0)
            page.reload(wait_until="domcontentloaded")
            expect(diagnostics_link).to_be_visible()
            sections.get_by_role("button", name="情報", exact=True).click()
            expect(toggle).to_have_attribute("aria-checked", "true")
            toggle.click()
            expect(diagnostics_link).to_have_count(0)
            expect(diagnostics).to_have_count(0)
        sections.get_by_role("button", name="表示", exact=True).click()
        expect(page.locator("#settings-display")).to_be_focused()
        page.get_by_role("button", name="📱 モバイル").click()
        expect(page.locator(".bottom-nav [aria-current=page]")).to_contain_text("設定")
        page.get_by_role("button", name="🖥️ デスクトップ").click()
        expect(page.locator(".nav-rail [aria-current=page]")).to_contain_text("設定")
        page.locator(".nav-rail-account").click()
        expect(page.locator(".desktop-back button")).to_be_visible()
        expect(page.locator(".nav-rail, .bottom-nav, .top-bar")).to_have_count(0)
        page.keyboard.press("Escape")
        expect(page.locator(".nav-rail [aria-current=page]")).to_contain_text("設定")
        page.locator(".nav-rail-brand").click()
        page.get_by_text("UI Fixture Post", exact=True).click()
        expect(page.locator(".nav-rail")).to_be_visible()
        expect(page.locator(".bottom-nav, .top-bar")).to_have_count(0)
        page.locator(".desktop-back button").click()
        expect(page.get_by_text("UI Fixture Post", exact=True)).to_be_visible()
        page.locator(".nav-rail").get_by_role("button", name="設定", exact=True).click()
        page.keyboard.press("Control+k")
        expect(search).to_be_focused()
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
        search.fill("ab")
        page.locator(".search-bar button").tap()
        expect(search).to_have_attribute("aria-invalid", "true")
        expect(page.get_by_role("alert")).to_contain_text("3文字以上")
        search.fill("x" * 320)
        expect(page.get_by_role("alert")).to_have_count(0)
        page.locator(".search-bar button").tap()
        expect(page.locator(".view-mode-bar .hint-row")).to_contain_text("x" * 320)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.get_by_text("UI Fixture Post", exact=True).tap()
        expect(page.locator(".detail-bar")).to_be_visible()
        expect(bottom).to_have_count(0)
        expect(page.get_by_text("UI Fixture Body", exact=True)).to_be_visible()
        page.wait_for_function("window.fixtureBack !== undefined")
        page.evaluate("window.fixtureBack.onmessage({ canGoBack: true })")
        expect(search).to_have_value("x" * 320)
        page.evaluate("window.fixtureBack.onmessage({ canGoBack: false })")
        page.wait_for_function("window.fixtureCalls.includes('plugin:app|exit')")
        page.set_viewport_size({"width": 900, "height": 800})
        expect(bottom).to_be_visible()
        expect(page.locator(".nav-rail")).to_have_count(0)
        bottom.get_by_role("button", name="設定", exact=True).tap()
        sections = page.locator(".settings-nav")
        expect(sections).to_be_visible()
        expect(page.locator("#settings-display")).to_be_hidden()
        sections.get_by_role("button", name="言語・翻訳ファイル", exact=True).tap()
        expect(sections).to_have_count(0)
        expect(page.locator("#settings-language")).to_be_visible()
        page.set_viewport_size({"width": 320, "height": 800})
        assert page.locator("#settings-language .setting-item").first.evaluate(
            '(row) => getComputedStyle(row).flexDirection === "column"'
        )
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        path = page.locator("#settings-language small").filter(has_text="com.nsmr0604.pawkemoviewer/files/Documents/Languages")
        expect(path).to_be_visible()
        assert path.evaluate("(label) => label.scrollWidth <= label.clientWidth")
        page.locator(".settings-back").tap()
        expect(sections).to_be_visible()
    finally:
        page.context.close()


def long_follow_list_matrix(browser):
    page = test_page(browser, width=390, mobile=True, init_script="""
        localStorage.setItem("pawkemo-follows", JSON.stringify(
            Array.from({length: 80}, (_, index) => ({
                id: String(index + 1), service: "patreon", name: "Follow " + (index + 1)
            }))
        ))
        const viewport = new EventTarget()
        Object.defineProperties(viewport, {
            height: { get: () => window.innerHeight - (window.testViewportInset || 0) },
            offsetTop: { value: 0 },
        })
        Object.defineProperty(window, "visualViewport", { value: viewport })
    """)
    try:
        bottom = page.locator(".bottom-nav")
        bottom.get_by_role("button", name="フォロー", exact=False).tap()
        expect(page.locator(".creator-row")).to_have_count(80)
        page.evaluate("window.scrollTo({top: document.body.scrollHeight, behavior: 'instant'})")
        assert page.evaluate("window.scrollY > innerHeight")
        pinned_to = """
            () => Math.abs(document.querySelector(".bottom-nav").getBoundingClientRect().bottom
                - innerHeight) < 1
        """
        page.wait_for_function(pinned_to)
        page.evaluate("window.testViewportInset = 180; visualViewport.dispatchEvent(new Event('resize'))")
        page.wait_for_function(pinned_to)
        page.evaluate("window.testViewportInset = 0; visualViewport.dispatchEvent(new Event('resize'))")
        page.wait_for_function(pinned_to)
        bottom.get_by_role("button", name="設定", exact=True).tap()
        expect(page.locator(".topbar-context")).to_have_text("設定")
        page.locator(".top-bar .btn-account").tap()
        expect(page.locator(".detail-bar")).to_be_visible()
        expect(bottom).to_have_count(0)
        page.locator(".detail-bar button").tap()
        expect(bottom).to_be_visible()
    finally:
        page.context.close()


def account_matrix(browser, *, mobile):
    page = test_page(browser, width=390 if mobile else 1280, mobile=mobile)
    account = page.locator(".btn-account" if mobile else ".nav-rail-account")
    try:
        account.click()
        page.locator('input[autocomplete="username"]').fill("test-account")
        page.locator('input[type="password"]').fill("fixture-password")
        page.locator(".login-submit").click()
        expect(account).to_contain_text("test-account")
        page.reload(wait_until="domcontentloaded")
        expect(account).to_contain_text("test-account")
        page.once("dialog", lambda dialog: dialog.dismiss())
        account.click()
        expect(account).to_contain_text("test-account")
        page.once("dialog", lambda dialog: dialog.accept())
        account.click()
        expect(account).to_contain_text("ログイン")
        assert page.evaluate("""() => {
            const settings = JSON.parse(localStorage.getItem('pawkemo-settings'));
            return !settings.sessionKey && !settings.accountId;
        }""")
    finally:
        page.context.close()


def launcher_icon_matrix(browser, *, ios):
    init_script = 'Object.defineProperty(navigator, "userAgent", { value: "iPad" })' if ios else None
    page = test_page(browser, width=390, mobile=True, init_script=init_script)
    try:
        page.locator(".bottom-nav").get_by_role("button", name="設定", exact=True).tap()
        page.locator(".settings-nav").get_by_role("button", name="表示", exact=True).tap()
        active_icon = "window.fixtureAlternateIcon" if ios else "window.fixtureLauncherLight"
        page.get_by_role("button", name="☀️ ライト", exact=True).tap()
        page.wait_for_function(f"expected => {active_icon} === expected", arg="AppIconLight" if ios else True)
        page.get_by_role("button", name="🌙 ダーク", exact=True).tap()
        page.wait_for_function(f"expected => {active_icon} === expected", arg=None if ios else False)
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
            long_follow_list_matrix(browser)
            account_matrix(browser, mobile=False)
            account_matrix(browser, mobile=True)
            launcher_icon_matrix(browser, ios=False)
            launcher_icon_matrix(browser, ios=True)
        finally:
            browser.close()
    print("PASS: desktop resize and focus, shell settings, keyboard, touch, long query, native Back fixed navigation on long follow lists and mobile launcher icon IPC")
