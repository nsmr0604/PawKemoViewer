# Adaptive presentation

## M6.1 — Layout selection and responsibilities

The user preference `layoutMode` selects desktop or mobile explicitly, or uses automatic mode. Automatic mode uses the desktop rail on a desktop-class user agent at 768 CSS pixels and above. Mobile-class user agents use the bottom navigation in automatic mode. Layout is independent of the Tauri runtime family, so a presentation preference does not change storage, API or lifecycle capabilities.

App owns route selection, settings listeners, shortcuts, and the native back subscription. A common shell keeps the header and screen outlet mounted across viewport changes. Its desktop rail and mobile navigation share the route groups and navigation actions. Login hides primary navigation, and post detail and login use the back header. Maintain the existing focus, history replacement, account routing and badge behavior.

Migrate Home first. The page continues to own the query, API-backed workflow, filters, history and view preferences. Keep one search/control tree for both presentations so resizing preserves focus, typed input and loaded results. Apply compact wrapping and touch-friendly view toggles to the mobile presentation. Retain desktop visual behavior and existing pagination/transport.

## M6.4 — Layout and interaction matrix

The browser smoke test uses Chromium with fixture Tauri IPC and blocks external requests. It exercises the live Vite frontend.

| Context | Observed result |
|---|---|
| Desktop UA at 1280, 767 and 768 px | The rail gives way to bottom navigation below 768 px. Home retains its search element, focus, unsent input and loaded results across both switches. |
| Desktop keyboard and layout preferences | Slash focuses search. S opens Settings. Explicit mobile and desktop selections switch the shell while Settings remains active. Login hides primary navigation, and Escape returns to Settings. |
| Android UA and touch at 320 px | The bottom navigation shows the active route. The Home list toggle is at least 44 px high and responds to tap. Service chips filter fixture results. A 320-character query wraps without horizontal overflow. |
| Post and simulated native Android Back | The detail header and post with missing revisions load. A Back event with WebView history returns to the query, and a Back event without history invokes the app exit command. The simulated Android UA keeps bottom navigation at 900 px in auto mode. |
| Native desktop/mobile and safe areas | Device insets, real WebView key handling, physical Back/gestures and iOS landscape were not exercised. |

Run the Vite server and the smoke test in separate shells. The smoke test expects Python Playwright and Chromium. Set `CHROMIUM_BIN` if Chromium is installed elsewhere. On hosts with an unwritable user directory, point `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` at a writable test directory.

```bash
npm run dev -- --host 127.0.0.1 --port 5181 --strictPort
python tests/ui_layout_smoke.py
```
