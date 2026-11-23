package org.pawkemoviewer.localepicker

import android.app.Activity
import android.content.Intent
import android.provider.OpenableColumns
import android.os.Environment
import android.util.AtomicFile
import android.util.Log
import java.io.File
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
class JsonReadArgs {
    var maxBytes: Int = 1024 * 1024
}

@InvokeArg
class LocaleExportArgs {
    lateinit var filename: String
    lateinit var json: String
    var extension: String = "json"
    var maxBytes: Int = 1024 * 1024
}

@InvokeArg
class LauncherIconArgs {
    var light: Boolean = false
}

@TauriPlugin
class LocalePickerPlugin(private val activity: Activity) : Plugin(activity) {
    private val maxBytes = 1024 * 1024

    init {
        try {
            languageDirectory()
        } catch (error: Exception) {
            Log.w("LocalePicker", "Could not prepare the app language folder", error)
        }
    }

    private fun languageDirectory(): File {
        val documents = activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)
            ?: error("App-specific external storage is unavailable")
        val folder = File(documents, "Languages")
        check(folder.mkdirs() || folder.isDirectory) { "Could not create the app language folder" }
        return folder
    }

    @Command
    fun setLauncherIcon(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(LauncherIconArgs::class.java)
            setLauncherIcon(activity, args.light)
            invoke.resolve()
        } catch (error: Exception) {
            Log.w("LauncherIcons", "Could not switch launcher icon", error)
            invoke.reject("Could not switch launcher icon")
        }
    }

    @Command
    fun exportToAppDirectory(invoke: Invoke) {
        Thread {
            try {
                val args = invoke.parseArgs(LocaleExportArgs::class.java)
                val bytes = args.json.toByteArray(Charsets.UTF_8)
                require(bytes.size <= maxBytes)
                require(File(args.filename).name == args.filename && args.filename.endsWith(".json"))
                val file = File(languageDirectory(), args.filename)
                val atomicFile = AtomicFile(file)
                val stream = atomicFile.startWrite()
                try {
                    stream.write(bytes)
                    atomicFile.finishWrite(stream)
                } catch (error: Exception) {
                    atomicFile.failWrite(stream)
                    throw error
                }
                invoke.resolve(JSObject().put("kind", "saved").put("path", file.absolutePath))
            } catch (_: Exception) {
                invoke.reject("Could not save to the app language folder")
            }
        }.start()
    }

    @Command
    fun pickJson(invoke: Invoke) {
        launch(invoke, picker(Intent.ACTION_OPEN_DOCUMENT), "importResult")
    }

    @Command
    fun saveDocument(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(LocaleExportArgs::class.java)
            val mimeType = if (args.extension == "txt") "text/plain" else "application/json"
            val intent = picker(Intent.ACTION_CREATE_DOCUMENT, mimeType).putExtra(Intent.EXTRA_TITLE, args.filename)
            launch(invoke, intent, "exportResult")
        } catch (_: Exception) {
            invoke.reject("Invalid JSON export arguments")
        }
    }

    @ActivityCallback
    fun importResult(invoke: Invoke, result: ActivityResult) = handle(invoke, result) { uri ->
        val maxBytes = invoke.parseArgs(JsonReadArgs::class.java).maxBytes
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
                check(count <= maxBytes - bytes.size()) { "JSON file exceeds the size limit" }
                bytes.write(chunk, 0, count)
            }
        } ?: error("Could not open document")
        val json = Charsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes.toByteArray())).toString()
        JSObject().put("kind", "selected").put("name", name).put("json", json)
    }

    @ActivityCallback
    fun exportResult(invoke: Invoke, result: ActivityResult) = handle(invoke, result) { uri ->
        val args = invoke.parseArgs(LocaleExportArgs::class.java)
        val bytes = args.json.toByteArray(Charsets.UTF_8)
        check(bytes.size <= args.maxBytes)
        activity.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) }
            ?: error("Could not open document for export")
        JSObject().put("kind", "saved")
    }

    private fun picker(action: String, mimeType: String = "application/json") = Intent(action)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType(mimeType)

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
