# Architecture and lifetime rules

## Process boundaries

1. **GNOME Shell extension (GJS/St/Clutter)** owns all always-visible chrome. It is loaded by Shell, not by systemd. `enable()` creates the actor, controllers, keybinding and a private session-bus object; `disable()` reverses those operations.
2. **Preferences** are shown inline by `extension/prefs.js` in the separate GNOME Extensions GTK4/Libadwaita process, bound directly to the extension GSettings schema. The optional **Python companion app** (`notch-settings`) runs only when opened and provides the same schema plus live extension status. It calls the extension’s private bus name for state only.
3. **Doctor** (`notch-doctor`) is an on-demand diagnostic CLI. It checks project files, schema, Shell registration, loaded build and leftover legacy helper artifacts. It does not run in the background.

There is no helper daemon, music player, clipboard manager, file shelf, drop target or systemd user service.

## Extension modules

| Module | Responsibility |
|---|---|
| `extension.js` | Enable/disable, preset migration, keybinding, private D-Bus export (`Toggle`, `SetExpanded`, `GetState`). |
| `lib/view.js` | Actor tree, three pages, closed/peek/open modes, animation, status footer, visibility and lifetime cleanup. |
| `lib/surface.js` | Cairo top flares + CSS body radius. |
| `lib/geometry.js`, `lib/layout.js` | Pure monitor/page geometry and adaptive layout decisions. |
| `lib/spring.js` | Damped spring / smooth easing geometry interpolation. |
| `lib/notifications.js` | Reversible message-tray banner routing. |
| `lib/diagnostics.js` | procfs CPU/RAM/network sampling and UPower battery proxy. Sampling runs only while System is visible; battery state changes are always observed and emit a plug-in charging transition. |
| `lib/actions.js` | GSettings-backed Do Not Disturb / Night Light / Dark Mode toggles. |
| `lib/widgets.js`, `lib/icons.js` | St construction helpers and bundled monochrome chrome icons. |
| `lib/model.js` | Dependency-free parsers/formatters used by Node and GJS tests. |
| `lib/dbus.js` | Cancellable, never-auto-starting proxy helpers. |

## Page model

The open notch has three fixed pages: Home, Alerts, System. Only Alerts owns a `St.ScrollView`. The other pages are natural-height centered blocks inside a `Clutter.BinLayout` page stack. Geometry reserves extra height for narrow/large-text layouts instead of introducing hidden overflow.

The header is a centered three-tab rail between two expanding side gutters. Tab buttons sit in fixed unthemed slots so themed padding cannot inflate the rail. A pure header budget chooses labels/icons and keeps settings/close inside the right gutter. Active/inactive icons use opacity because bundled file icons cannot be recolored by CSS `color`.

## Notification routing

`NotificationBridge` overrides only `MessageTray._showNotification`, after GNOME has applied DND/fullscreen/per-app policy. Ordinary notifications are acknowledged, played and shown as a compact peek; they remain in GNOME’s own message list. Critical notifications keep the native banner path. Disabling the extension or turning routing off restores the original method.

## Diagnostics and quick actions

CPU/RAM/network are sampled from procfs once per second only while System is visible. Battery state comes from UPower’s DisplayDevice and is observed even while System is hidden. The first sample only initializes state; a later discharging/pending → charging transition shows a closed-notch charging badge for under two seconds. Quick actions write GSettings keys directly and respect writability locks.

## Lifetime rules

- Every timer, signal subscription, D-Bus proxy, injection and actor created in `enable()` must be removed in `disable()`.
- The message-tray override must be restored.
- The panel clock opacity/reactivity must be restored.
- The geometry timeline is single-shot with a watchdog; a relayout storm budget snaps geometry instead of spinning the main loop.
- No clipboard text, file URI or notification body is written to routine logs.
