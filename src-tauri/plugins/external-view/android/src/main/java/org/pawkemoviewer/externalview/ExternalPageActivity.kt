package org.pawkemoviewer.externalview

import android.app.Activity
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Environment
import android.text.TextUtils
import android.view.ViewGroup
import android.webkit.CookieManager
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
 * ツールバーの「画像を保存」は、いま表示しているページの DOM から画像 URL を集め、
 * アプリ側 (Rust) が拾えるように Documents/.external-download.json へ書き出す。
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
            setOnClickListener { collectAndSave() }
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

    /** 表示中ページの画像 URL を集めて、アプリ側へ引き渡す。 */
    private fun collectAndSave() {
        val view = page ?: return
        val button = saveButton ?: return
        button.isEnabled = false
        button.text = "収集中…"
        view.evaluateJavascript(COLLECT_SCRIPT) { result ->
            button.isEnabled = true
            button.text = "画像を保存"
            val urls = parseUrls(result)
            if (urls.isEmpty()) {
                Toast.makeText(this, "保存できる画像が見つかりませんでした", Toast.LENGTH_SHORT).show()
                return@evaluateJavascript
            }
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
                Toast.makeText(this, "${urls.size} 枚を保存します", Toast.LENGTH_SHORT).show()
                finish()
            } catch (error: Exception) {
                Toast.makeText(this, "保存を開始できませんでした", Toast.LENGTH_SHORT).show()
            }
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
    }
}
