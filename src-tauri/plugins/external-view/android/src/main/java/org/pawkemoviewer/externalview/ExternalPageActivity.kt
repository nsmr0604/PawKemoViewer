package org.pawkemoviewer.externalview

import android.app.Activity
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Environment
import android.text.TextUtils
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File

/**
 * 実オリジンのまま外部ページを開く WebView。
 * Referer は初回リクエストにだけ必要 (以降は同一サイト内の遷移)。
 * reCAPTCHA などの JavaScript は実オリジンで動作する。
 *
 * ツールバーの「画像を保存」は、いま表示しているページから画像候補を集めて
 * チェック式の選択画面を重ね、選んだ画像だけを
 * Documents/.external-download.json に書き出す。
 * アプリは復帰時に一覧を読み、通常の一括保存と同じ処理で保存する。
 */
class ExternalPageActivity : Activity() {
    private var page: WebView? = null
    private var saveButton: Button? = null
    private var creatorName: String = ""
    private var service: String = ""
    private var creatorId: String = ""
    private var postId: String = ""
    private var referer: String = ""
    /** 選択画面に出した候補。ここに無い URL は保存させない。 */
    private var candidates: List<String> = emptyList()
    private var bridgeInstalled = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrEmpty()) {
            finish()
            return
        }
        referer = intent.getStringExtra(EXTRA_REFERER).orEmpty()
        creatorName = intent.getStringExtra(EXTRA_CREATOR_NAME).orEmpty()
        service = intent.getStringExtra(EXTRA_SERVICE).orEmpty()
        creatorId = intent.getStringExtra(EXTRA_CREATOR_ID).orEmpty()
        postId = intent.getStringExtra(EXTRA_POST_ID).orEmpty()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(28, 28, 28, 28)
            setBackgroundColor(0xFF1A1B1E.toInt())
        }
        val title = TextView(this).apply {
            text = url
            setTextColor(0xFFE8E9EB.toInt())
            textSize = 16f
            isSingleLine = true
            ellipsize = TextUtils.TruncateAt.END
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val save = Button(this).apply {
            text = "画像を保存"
            setOnClickListener { openPicker() }
        }
        saveButton = save
        val close = Button(this).apply {
            text = "閉じる"
            setOnClickListener { finish() }
        }
        bar.addView(title)
        bar.addView(save)
        bar.addView(close)

        val view = WebView(this)
        page = view
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        view.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                title.text = url
                // ページ遷移したら候補は作り直す
                candidates = emptyList()
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                title.text = url
            }
        }
        view.webChromeClient = WebChromeClient()
        CookieManager.getInstance().setAcceptCookie(true)

        root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        val headers = HashMap<String, String>()
        if (referer.isNotEmpty()) headers["Referer"] = referer
        view.loadUrl(url, headers)
    }

    /** 表示中ページの画像候補を集め、チェック式の選択画面を出す。 */
    private fun openPicker() {
        val view = page ?: return
        view.evaluateJavascript(COLLECT_SCRIPT) { result ->
            val urls = parseUrls(result)
            if (urls.isEmpty()) {
                Toast.makeText(this, "保存できる画像が見つかりませんでした", Toast.LENGTH_SHORT).show()
                return@evaluateJavascript
            }
            candidates = urls
            if (!bridgeInstalled) {
                view.addJavascriptInterface(SelectionBridge(), "PawkemoSaver")
                bridgeInstalled = true
            }
            val payload = JSONArray(urls).toString()
            val script = PICKER_SCRIPT.replace("__URLS__", payload)
            view.evaluateJavascript(script, null)
        }
    }

    private fun parseUrls(result: String?): List<String> {
        if (result.isNullOrEmpty() || result == "null") return emptyList()
        return try {
            // evaluateJavascript の結果は JSON 文字列 (二重エンコード) で返る
            val inner = JSONTokener(result).nextValue()
            val json = when (inner) {
                is String -> inner
                else -> JSONTokener(result).nextValue().toString()
            }
            val array = JSONArray(json)
            (0 until array.length()).mapNotNull { index ->
                array.optString(index).takeIf { it.isNotEmpty() }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /** 選択画面の「保存」から呼ばれる。候補に無い URL は無視する。 */
    private inner class SelectionBridge {
        @JavascriptInterface
        fun save(json: String) {
            val allowed = candidates.toSet()
            val array = try {
                JSONArray(json)
            } catch (_: Exception) {
                JSONArray()
            }
            val urls = (0 until array.length()).mapNotNull { index ->
                array.optString(index).takeIf { it.isNotEmpty() && allowed.contains(it) }
            }
            if (urls.isEmpty()) return
            runOnUiThread { writeAndFinish(urls) }
        }

        @JavascriptInterface
        fun cancel() {
            // 選択画面側で閉じるため、ネイティブでは何もしない
        }
    }

    private fun writeAndFinish(urls: List<String>) {
        try {
            val directory = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) ?: filesDir
            directory.mkdirs()
            val payload = JSONObject()
                .put("creatorName", creatorName)
                .put("service", service)
                .put("creatorId", creatorId)
                .put("postId", postId)
                .put("referer", referer)
                .put("pageUrl", page?.url.orEmpty())
                .put("images", JSONArray(urls))
            File(directory, QUEUE_FILE).writeText(payload.toString())
        } catch (_: Exception) {
            Toast.makeText(this, "保存を開始できませんでした", Toast.LENGTH_SHORT).show()
            return
        }
        Toast.makeText(this, "${urls.size} 枚を保存します", Toast.LENGTH_SHORT).show()
        finish()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val view = page
        if (view != null && view.canGoBack()) {
            view.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onPause() {
        page?.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        page?.onResume()
    }

    override fun onDestroy() {
        page?.destroy()
        page = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_REFERER = "referer"
        const val EXTRA_CREATOR_NAME = "creatorName"
        const val EXTRA_SERVICE = "service"
        const val EXTRA_CREATOR_ID = "creatorId"
        const val EXTRA_POST_ID = "postId"

        /** アプリ (Rust) が復帰時に読む受け渡しファイル */
        const val QUEUE_FILE = ".external-download.json"

        /** 表示中ページから保存対象の画像 URL を集める (アプリ側と同じ除外規則) */
        private const val COLLECT_SCRIPT = """
(function () {
  var out = [];
  var seen = {};
  function isAvatar(u) {
    var host = u.hostname;
    var path = u.pathname;
    if (host === 'pbs.twimg.com') {
      return path.indexOf('/profile_images/') === 0 || path.indexOf('/profile_banners/') === 0;
    }
    if (host === 'abs.twimg.com' || host === 'graph.facebook.com' ||
        host === 'platform-lookaside.fbsbx.com' || host === 'yt3.ggpht.com') {
      return true;
    }
    if (/(^|\.)gravatar\.com$/.test(host)) return path.indexOf('/avatar/') === 0;
    return false;
  }
  function push(raw) {
    if (!raw) return;
    var u;
    try { u = new URL(raw, location.href); } catch (e) { return; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    if (isAvatar(u)) return;
    if (/\.(mp4|webm|mov|m4v|m3u8|gifv)$/i.test(u.pathname)) return;
    if (seen[u.href]) return;
    seen[u.href] = 1;
    out.push(u.href);
  }
  var imgs = document.querySelectorAll('img');
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    if (img.closest && img.closest('header,nav,footer')) continue;
    push(img.currentSrc || img.src);
    push(img.getAttribute('data-src'));
    push(img.getAttribute('data-original'));
    push(img.getAttribute('data-lazy-src'));
    var set = img.getAttribute('srcset') || img.getAttribute('data-srcset');
    if (set) {
      var parts = set.split(',');
      var last = parts[parts.length - 1].trim().split(/\s+/)[0];
      push(last);
    }
  }
  var meta = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
  if (meta) push(meta.getAttribute('content'));
  return JSON.stringify(out.slice(0, 300));
})()
"""

        /**
         * チェック式の画像選択画面。__URLS__ に候補の JSON 配列を埋め込む。
         * CSP の影響を受けないよう、スタイルは cssText で与える。
         */
        private const val PICKER_SCRIPT = """
(function (urls) {
  if (window.__pawkemoPickerClose) window.__pawkemoPickerClose();
  var selected = [];
  for (var i = 0; i < urls.length; i++) selected.push(true);

  function make(tag, css, text) {
    var el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function button(label, extra) {
    var b = make('button', 'border:0;border-radius:10px;padding:10px 14px;font-size:15px;font-weight:600;background:#2a2c30;color:#e8e9eb;' + (extra || ''), label);
    b.type = 'button';
    return b;
  }

  var root = make('div', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:#0e0f11;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;');
  var header = make('div', 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:#1a1b1e;color:#e8e9eb;flex:0 0 auto;');
  var close = button('✕', 'width:44px;height:44px;padding:0;font-size:20px;');
  var titleWrap = make('div', 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;');
  var title = make('div', 'font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', '保存する画像を選択');
  var count = make('div', 'font-size:12px;color:#9aa0a6;', '');
  titleWrap.appendChild(title);
  titleWrap.appendChild(count);
  var all = button('すべて解除');
  var save = button('保存', 'background:#1a73e8;color:#fff;');
  header.appendChild(close);
  header.appendChild(titleWrap);
  header.appendChild(all);
  header.appendChild(save);

  var grid = make('div', 'flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:repeat(3,1fr);align-content:start;gap:2px;padding:2px;background:#0e0f11;');
  var marks = [];

  function updateCount() {
    var n = 0;
    for (var i = 0; i < selected.length; i++) if (selected[i]) n++;
    count.textContent = n + ' / ' + urls.length + ' 枚';
    save.textContent = n > 0 ? '保存 (' + n + ')' : '保存';
    all.textContent = n === urls.length ? 'すべて解除' : 'すべて選択';
  }

  for (var i = 0; i < urls.length; i++) {
    (function (index) {
      var tile = make('button', 'position:relative;display:flex;align-items:flex-start;justify-content:flex-start;padding:0;border:0;background:#1a1b1e;overflow:hidden;');
      tile.type = 'button';
      var img = make('img', 'width:100%;display:block;aspect-ratio:3/4;object-fit:cover;background:#1a1b1e;');
      img.src = urls[index];
      img.loading = 'lazy';
      img.alt = '';
      var mark = make('span', 'position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;border:2px solid #1a73e8;background:#1a73e8;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;', '✓');
      tile.appendChild(img);
      tile.appendChild(mark);
      tile.onclick = function () {
        selected[index] = !selected[index];
        mark.textContent = selected[index] ? '✓' : '';
        mark.style.background = selected[index] ? '#1a73e8' : 'rgba(0,0,0,0.25)';
        mark.style.borderColor = selected[index] ? '#1a73e8' : '#fff';
        updateCount();
      };
      grid.appendChild(tile);
      marks.push(mark);
    })(i);
  }

  all.onclick = function () {
    var n = 0;
    for (var i = 0; i < selected.length; i++) if (selected[i]) n++;
    var next = n !== selected.length;
    for (var j = 0; j < selected.length; j++) {
      selected[j] = next;
      marks[j].textContent = next ? '✓' : '';
      marks[j].style.background = next ? '#1a73e8' : 'rgba(0,0,0,0.25)';
      marks[j].style.borderColor = next ? '#1a73e8' : '#fff';
    }
    updateCount();
  };

  save.onclick = function () {
    var out = [];
    for (var k = 0; k < urls.length; k++) if (selected[k]) out.push(urls[k]);
    if (out.length === 0) return;
    if (window.PawkemoSaver && window.PawkemoSaver.save) {
      window.PawkemoSaver.save(JSON.stringify(out));
    }
  };

  close.onclick = function () {
    if (window.__pawkemoPickerClose) window.__pawkemoPickerClose();
  };

  root.appendChild(header);
  root.appendChild(grid);
  document.body.appendChild(root);
  window.__pawkemoPickerClose = function () {
    if (root.parentNode) root.parentNode.removeChild(root);
    window.__pawkemoPickerClose = null;
  };
  updateCount();
})(__URLS__);
"""
    }
}

