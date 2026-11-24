package org.pawkemoviewer.externalview

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class OpenArgs {
    lateinit var url: String
    lateinit var referer: String
    var creatorName: String? = null
    var service: String? = null
    var creatorId: String? = null
    var postId: String? = null
}

@InvokeArg
class BrowserArgs {
    lateinit var url: String
}

@TauriPlugin
class ExternalViewPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun openBrowser(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(BrowserArgs::class.java)
            val intent = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse(args.url)
            }
            activity.startActivity(intent)
            invoke.resolve()
        } catch (_: Exception) {
            invoke.reject("Could not open the browser")
        }
    }

    @Command
    fun open(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(OpenArgs::class.java)
            val intent = Intent(activity, ExternalPageActivity::class.java)
                .putExtra(ExternalPageActivity.EXTRA_URL, args.url)
                .putExtra(ExternalPageActivity.EXTRA_REFERER, args.referer)
                .putExtra(ExternalPageActivity.EXTRA_CREATOR_NAME, args.creatorName)
                .putExtra(ExternalPageActivity.EXTRA_SERVICE, args.service)
                .putExtra(ExternalPageActivity.EXTRA_CREATOR_ID, args.creatorId)
                .putExtra(ExternalPageActivity.EXTRA_POST_ID, args.postId)
            activity.startActivity(intent)
            invoke.resolve()
        } catch (error: Exception) {
            Log.w("ExternalView", "Could not open the external page", error)
            invoke.reject("Could not open the external page")
        }
    }
}
