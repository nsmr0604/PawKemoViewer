package org.pawkemoviewer.downloadsstore

import android.app.Activity
import android.content.ContentValues
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

/**
 * アプリのキャッシュに書いた画像を、端末の共有 Downloads (`Download/`) へ移す。
 *
 * Android 10 以降はスコープドストレージのため、共有領域へは MediaStore 経由でしか
 * 書き込めない。Android 9 以下ではこの経路を使わず、Rust 側がアプリ専用領域へ保存する。
 */
@InvokeArg
class SaveArgs {
    lateinit var path: String
    lateinit var fileName: String
    lateinit var relativeDir: String
    var mimeType: String = "application/octet-stream"
}

@TauriPlugin
class DownloadsStorePlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun isSupported(invoke: Invoke) {
        val result = JSObject()
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
        invoke.resolve(result)
    }

    @Command
    fun saveToDownloads(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SaveArgs::class.java)
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                invoke.reject("Shared Downloads requires Android 10 or later")
                return
            }
            val source = File(args.path)
            check(source.isFile) { "The staged file is missing" }
            // アプリのキャッシュ配下のファイルだけを受け付ける
            val cacheRoot = activity.cacheDir.canonicalFile
            val canonical = source.canonicalFile
            check(canonical.path.startsWith(cacheRoot.path + File.separator)) {
                "The staged file is outside the app cache"
            }
            check(args.mimeType.startsWith("image/") || args.mimeType.startsWith("video/")) {
                "Unsupported content type"
            }
            val relative = args.relativeDir.trim().trim('/').ifEmpty { "PawKemoViewer" }
            check(!relative.contains("..") && !relative.startsWith(".")) { "Invalid destination" }
            val displayName = uniqueDisplayName(relative, args.fileName.trim().ifEmpty { "image" })
            saveWithMediaStore(canonical, relative, displayName, args.mimeType)
            canonical.delete()
            val result = JSObject()
            result.put("path", "Download/$relative/$displayName")
            invoke.resolve(result)
        } catch (error: Exception) {
            Log.w("DownloadsStore", "Could not save the image", error)
            invoke.reject(error.message ?: "Could not save the image")
        }
    }

    /** 同じフォルダーに同名がある場合は -2, -3 … を付ける (MediaStore の自動リネームを避ける)。 */
    private fun uniqueDisplayName(relative: String, requested: String): String {
        val existing = HashSet<String>()
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val selection = "${MediaStore.MediaColumns.RELATIVE_PATH}=?"
        activity.contentResolver.query(
            collection,
            arrayOf(MediaStore.MediaColumns.DISPLAY_NAME),
            selection,
            arrayOf("Download/$relative/"),
            null,
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                existing.add(cursor.getString(0) ?: continue)
            }
        }
        if (!existing.contains(requested)) return requested
        val dot = requested.lastIndexOf('.')
        val stem = if (dot > 0) requested.substring(0, dot) else requested
        val extension = if (dot > 0) requested.substring(dot) else ""
        var index = 2
        while (index < 1000) {
            val candidate = "$stem-$index$extension"
            if (!existing.contains(candidate)) return candidate
            index += 1
        }
        return "$stem-${System.currentTimeMillis()}$extension"
    }

    private fun saveWithMediaStore(source: File, relative: String, displayName: String, mimeType: String) {
        val resolver = activity.contentResolver
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/$relative")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(collection, values) ?: error("Could not create the download entry")
        try {
            val output = resolver.openOutputStream(uri) ?: error("Could not open the download")
            output.use { out ->
                source.inputStream().use { input -> input.copyTo(out) }
            }
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            throw error
        }
        val finished = ContentValues().apply {
            put(MediaStore.MediaColumns.IS_PENDING, 0)
        }
        val updated = try {
            resolver.update(uri, finished, null, null)
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            throw error
        }
        if (updated <= 0) {
            resolver.delete(uri, null, null)
            error("Could not finalize the download")
        }
    }
}
