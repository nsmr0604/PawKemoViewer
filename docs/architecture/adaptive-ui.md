# Adaptive presentation

## M6.1 — Layout selection and responsibilities

The user preference `layoutMode` selects desktop or mobile explicitly, or uses automatic mode. Automatic mode uses the desktop rail on a desktop-class user agent at 768 CSS pixels and above. Mobile-class user agents use the bottom navigation in automatic mode. Layout is independent of the Tauri runtime family, so a presentation preference does not change storage, API or lifecycle capabilities.

App owns route selection, settings listeners, shortcuts, and the native back subscription. A common shell keeps the header and screen outlet mounted across viewport changes. Its desktop rail and mobile navigation share the route groups and navigation actions. Login hides primary navigation, and post detail and login use the back header. Maintain the existing focus, history replacement, account routing and badge behavior.

Migrate Home first. The page continues to own the query, API-backed workflow, filters, history and view preferences. Keep one search/control tree for both presentations so resizing preserves focus, typed input and loaded results. Apply compact wrapping and touch-friendly view toggles to the mobile presentation. Retain desktop visual behavior and existing pagination/transport.
