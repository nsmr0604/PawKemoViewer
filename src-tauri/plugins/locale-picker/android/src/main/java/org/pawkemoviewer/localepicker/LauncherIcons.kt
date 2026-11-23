package org.pawkemoviewer.localepicker

import android.app.Activity
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build

internal fun setLauncherIcon(activity: Activity, light: Boolean) {
    val packages = activity.packageManager
    val packageName = activity.packageName
    @Suppress("DEPRECATION")
    val activities = packages.getPackageInfo(
        packageName, PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS,
    ).activities.orEmpty()
    val aliases = activities.filter { it.targetActivity != null }
    val dark = aliases.singleOrNull { it.name.substringAfterLast('.') == "AppIconDefault" }
    val alternate = aliases.singleOrNull { it.name.substringAfterLast('.') == "AppIconLight" }

    // IDE builds may use the original launcher without generated aliases.
    if (dark == null || alternate == null) return
    val selected = if (light) alternate else dark
    val previous = if (light) dark else alternate
    val enabled = PackageManager.COMPONENT_ENABLED_STATE_ENABLED
    val disabled = PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    val flags = PackageManager.DONT_KILL_APP

    val changes = listOf(selected to enabled, previous to disabled).mapNotNull { (info, desired) ->
        val component = ComponentName(packageName, info.name)
        val state = packages.getComponentEnabledSetting(component)
        val isEnabled = state == enabled || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && info.enabled)
        if (isEnabled == (desired == enabled)) null else component to desired
    }

    if (changes.isEmpty()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packages.setComponentEnabledSettings(changes.map { (component, state) ->
            PackageManager.ComponentEnabledSetting(component, state, flags)
        })
    } else {
        // 古い Android では新しいランチャーを有効にしてから旧ランチャーを無効にする。
        for ((component, state) in changes) {
            packages.setComponentEnabledSetting(component, state, flags)
        }
    }
}
