# Architecture and lifetime rules

## Process boundaries

1. **GNOME Shell extension (GJS/St/Clutter)** owns all always-visible chrome. It is loaded by Shell, not by systemd. `enable()` creates the actor, controllers, keybinding and a private session-bus object; `disable()` reverses those operations.
2. **Preferences** are shown inline by `extension/prefs.js` in the separate GNOME Extensions GTK4/Libadwaita process, bound directly to the extension GSettings schema. The optional **Python companion app** (`notch-settings`) runs only when opened and provides the same schema plus live extension status. It calls the extension’s private bus name for state only.
3. **Doctor** (`notch-doctor`) is an on-demand diagnostic CLI. It checks project files, schema, Shell registration, loaded build, MPRIS players and leftover legacy helper artifacts. It does not run in the background.

There is no helper daemon, clipboard manager, file shelf, drop target or systemd user service in build 18+.

## Extension modules

| Module | Responsibility |
|---|---|
| `extension.js` | Enable/disable, preset migration, keybinding, private D-Bus export (`Toggle`, `SetExpanded`, `GetState`). |
| `lib/view.js` | Actor tree, four pages, closed/peek/open modes, animation, status footer, visibility and lifetime cleanup. |
| `lib/surface.js` | Cairo top flares + CSS body radius. |
| `lib/geometry.js`, `lib/layout.js` | Pure monitor/page geometry and adaptive layout decisions. |
| `lib/spring.js` | Damped spring / smooth easing geometry interpolation. |
| `lib/media.js` | MPRIS v2 client. Name/property/seek events do the work; only the visible Music page polls Position once per second. |
| `lib/notifications.js` | Reversible message-tray banner routing. |
| `lib/diagnostics.js` | procfs CPU/RAM/network sampling and UPower battery proxy. Sampling runs only while System is visible. |
| `lib/actions.js` | GSettings-backed Do Not Disturb / Night Light / Dark Mode toggles. |
| `lib/widgets.js`, `lib/icons.js` | St construction helpers and bundled monochrome chrome icons. |
| `lib/model.js` | Dependency-free parsers/formatters used by Node and GJS tests. |
| `lib/dbus.js` | Cancellable, never-auto-starting proxy helpers. |

## Page model

The open notch has four fixed pages: Home, Music, Alerts, System. Only Alerts owns a `St.ScrollView`. The other pages are natural-height centered blocks inside a `Clutter.BinLayout` page stack. Geometry reserves extra height for narrow/large-text layouts instead of introducing hidden overflow.

The header is a centered four-tab rail with equal fixed side gutters. At the default 640 px width the tabs show labels; narrow/large-text layouts collapse to icons. Active/inactive icons use opacity because bundled file icons cannot be recolored by CSS `color`.

## Notification routing

`NotificationBridge` overrides only `MessageTray._showNotification`, after GNOME has applied DND/fullscreen/per-app policy. Ordinary notifications are acknowledged, played and shown as a compact peek; they remain in GNOME’s own message list. Critical notifications keep the native banner path. Disabling the extension or turning routing off restores the original method.

## Media

MPRIS proxies are created with `DO_NOT_AUTO_START`. Property changes are coalesced to at most one UI update per 60 ms. Position is polled only while Music is open. Programmatic slider updates suppress `notify::value` feedback for 150 ms. The UI never writes volume and never downloads album art.

## Diagnostics and quick actions

CPU/RAM/network are sampled from procfs once per second only while System is visible. Battery state comes from UPower’s DisplayDevice. Quick actions write GSettings keys directly and respect writability locks.

## Lifetime rules

- Every timer, signal subscription, D-Bus proxy, injection and actor created in `enable()` must be removed in `disable()`.
- The message-tray override must be restored.
- The panel clock opacity/reactivity must be restored.
- The geometry timeline is single-shot with a watchdog; a relayout storm budget snaps geometry instead of spinning the main loop.
- The closed equalizer runs only while the notch is closed, visible, playing and animations are enabled.
- No clipboard text, file URI or notification body is written to routine logs.
