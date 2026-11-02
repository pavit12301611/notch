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
| `lib/features.js` | Opt-in feature definitions; pure countdown, calendar, notification policy and BlueZ models. |
| `lib/extras.js` | Optional timer, calendar, overflow wrappers, reversible OSD dispatch and Bluetooth lifecycle. |
| `lib/bluetooth.js` | Cancellable system-bus BlueZ ObjectManager; signals only, created on opt-in. |
| `lib/musicExtras.js` | Visible-only title timeline, direct player picker and cancellable local-art metadata checks. |
| `lib/notifications.js` | Reversible message-tray banner routing. |
| `lib/diagnostics.js` | procfs CPU/RAM/network sampling and UPower battery proxy. Sampling runs only while System is visible; battery state changes are always observed and emit a plug-in charging transition. |
| `lib/actions.js` | GSettings-backed Do Not Disturb / Night Light / Dark Mode toggles. |
| `lib/widgets.js`, `lib/icons.js` | St construction helpers and bundled monochrome chrome icons. |
| `lib/model.js` | Dependency-free parsers/formatters used by Node and GJS tests. |
| `lib/dbus.js` | Cancellable, never-auto-starting proxy helpers. |

## Page model

The open notch has four fixed pages: Home, Music, Alerts, System. Alerts always owns a `St.ScrollView`. Other pages are natural-height centered blocks by default, inside non-scrolling wrappers; optional timer/calendar, Bluetooth or music content enables bounded vertical scrolling on those wrappers. Page budgets grow within the configured maximum and monitor limits; the four-tab header stays fixed.

The header is a centered four-tab rail between two expanding side gutters. Tab buttons sit in fixed unthemed slots so themed padding cannot inflate the rail. A pure header budget chooses labels/icons and keeps settings/close inside the right gutter. Active/inactive icons use opacity because bundled file icons cannot be recolored by CSS `color`.

## Notification routing

`NotificationBridge` overrides only `MessageTray._showNotification`, after GNOME has applied DND/fullscreen/per-app policy. Ordinary notifications are acknowledged, played and shown as a compact peek; they remain in GNOME’s own message list. Critical notifications keep the native banner path. Disabling the extension or turning routing off restores the original method.

## Media

MPRIS proxies are created with `DO_NOT_AUTO_START`. Property changes are coalesced to at most one UI update per 60 ms. Position is polled only while Music is open. Programmatic slider updates suppress `notify::value` feedback for 150 ms. The UI never writes volume or downloads album art. Opt-in artwork accepts local file URIs without an authority, checks regular-file type, raster MIME and a 10 MiB limit asynchronously, and cancels stale results on disable. SVG/HTTP(S)/resource artwork is not loaded.

## Diagnostics and quick actions

CPU/RAM/network are sampled from procfs once per second only while System is visible. Battery state comes from UPower’s DisplayDevice and is observed even while System is hidden. The first sample only initializes state; a later discharging/pending → charging transition shows a closed-notch charging badge for under two seconds. Quick actions write GSettings keys directly and respect writability locks.

## Lifetime rules

- Every timer, signal subscription, D-Bus proxy, injection and actor created in `enable()` must be removed in `disable()`.
- The message-tray override must be restored.
- The panel clock opacity/reactivity must be restored.
- The geometry timeline is single-shot with a watchdog; a relayout storm budget snaps geometry instead of spinning the main loop.
- The closed equalizer runs only while the notch is closed, visible, playing and animations are enabled.
- No clipboard text, file URI or notification body is written to routine logs.

## Optional feature lifetimes (build 20)

All nine switches default off in both preferences UIs. `Extras` owns one GLib
source only while a countdown is running; pause/reset/off/destroy removes it.
Countdown deadlines use monotonic time (not accumulated tick counts). Focus/Break
sessions alternate on completion but require an explicit start. No state persists
through extension reload. A completed countdown remains visible after unlock,
but it never opens an overlay over the lock screen or plays a sound.

BlueZ uses a cancellable `Gio.DBusObjectManagerClient` on the system bus with
`DO_NOT_AUTO_START`; manager/property signals replace polling. Existing connected
devices do not generate startup cues. Disabling disconnects signals and cancels
pending construction. Unsupported battery interfaces are omitted from battery rows.

OSD routing overrides only the per-monitor `_showOsdWindow` dispatcher, preserving
GNOME 46–50 public entry points. Recognized enabled levels route only to the notch
monitor; other monitors, unknown icons, unavailable notch or incompatible API use
native OSDs. Hook teardown uses a separate `InjectionManager` from notifications.

Notification app filtering affects peeks only, after native policy. Privacy text
is derived before constructing labels/accessibility strings and hides action
labels too; stored GNOME notifications are not modified. It does not claim to
redact native banners or detect screen sharing.

Music uses a single Clutter timeline only for an overflowing title on the visible
Music page with animations enabled. Closing, hiding, switching off, reduced motion
or disabling tears it down. Local artwork has a separate opt-in/cancellable.
