package org.pawkemoviewer.localepicker

import android.app.Activity
import android.content.Intent
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import app.tauri.plugin.JSObject
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

@InvokeArg
class LocaleExportArgs {
    lateinit var filename: String
    lateinit var json: String
}

@TauriPlugin
class LocalePickerPlugin(private val activity: Activity) : Plugin(activity) {
    private val maxBytes = 1024 * 1024

    @Command
    fun importLocale(invoke: Invoke) {
        launch(invoke, picker(Intent.ACTION_OPEN_DOCUMENT), "importResult")
    }

    @Command
    fun exportLocale(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(LocaleExportArgs::class.java)
            val intent = picker(Intent.ACTION_CREATE_DOCUMENT).putExtra(Intent.EXTRA_TITLE, args.filename)
            launch(invoke, intent, "exportResult")
        } catch (_: Exception) {
            invoke.reject("Invalid locale export arguments")
        }
    }

    @ActivityCallback
    fun importResult(invoke: Invoke, result: ActivityResult) = handle(invoke, result) { uri ->
        val resolver = activity.contentResolver
        val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: error("Missing document name")
        val bytes = ByteArrayOutputStream()
        resolver.openInputStream(uri)?.use { input ->
            val chunk = ByteArray(8192)
            while (true) {
                val count = input.read(chunk)
                if (count == -1) break
                check(count <= maxBytes - bytes.size()) { "Locale file exceeds 1 MiB" }
                bytes.write(chunk, 0, count)
            }
        } ?: error("Could not open document")
        val json = Charsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes.toByteArray())).toString()
        JSObject().put("kind", "selected").put("name", name).put("json", json)
    }

    @ActivityCallback
    fun exportResult(invoke: Invoke, result: ActivityResult) = handle(invoke, result) { uri ->
        val bytes = invoke.parseArgs(LocaleExportArgs::class.java).json.toByteArray(Charsets.UTF_8)
        check(bytes.size <= maxBytes)
        activity.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) }
            ?: error("Could not open document for export")
        JSObject().put("kind", "saved")
    }

    private fun picker(action: String) = Intent(action)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType("application/json")

    private fun launch(invoke: Invoke, intent: Intent, callback: String) {
        activity.runOnUiThread {
            try {
                startActivityForResult(invoke, intent, callback)
            } catch (_: Exception) {
                invoke.reject("Could not open the system file picker")
            }
        }
    }

    private fun handle(invoke: Invoke, result: ActivityResult, operation: (android.net.Uri) -> JSObject) {
        if (result.resultCode == Activity.RESULT_CANCELED) {
            invoke.resolve(JSObject().put("kind", "cancelled"))
            return
        }
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null || uri.scheme != "content") {
            invoke.reject("No provider document was selected")
            return
        }
        Thread {
            try {
                invoke.resolve(operation(uri))
            } catch (_: Exception) {
                invoke.reject("Could not read or write the selected JSON file")
            }
        }.start()
    }
}
