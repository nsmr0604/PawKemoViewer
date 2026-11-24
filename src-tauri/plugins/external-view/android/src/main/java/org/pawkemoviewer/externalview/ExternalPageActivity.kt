package org.pawkemoviewer.externalview

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * 実オリジンのまま外部ページを開く WebView。
 * Referer は初回リクエストにだけ必要 (以降は同一サイト内の遷移)。
 * reCAPTCHA などの JavaScript は実オリジンで動作する。
 */
class ExternalPageActivity : Activity() {
    private var page: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrEmpty()) {
            finish()
            return
        }
        val referer = intent.getStringExtra(EXTRA_REFERER).orEmpty()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(28, 28, 28, 28)
            setBackgroundColor(0xFF1A1B1E.toInt())
        }
        val title = TextView(this).apply {
            text = "外部ページ"
            setTextColor(0xFFE8E9EB.toInt())
            textSize = 16f
            isSingleLine = true
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val close = Button(this).apply {
            text = "閉じる"
            setOnClickListener { finish() }
        }
        bar.addView(title)
        bar.addView(close)

        val view = WebView(this)
        page = view
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        view.webViewClient = WebViewClient()
        view.webChromeClient = WebChromeClient()

        root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        val headers = HashMap<String, String>()
        if (referer.isNotEmpty()) headers["Referer"] = referer
        view.loadUrl(url, headers)
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
    }
}
