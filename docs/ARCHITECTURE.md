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
| `lib/view.js` | Actor tree, four base pages plus optional Calendar, closed/peek/open modes, animation, status footer, visibility and lifetime cleanup. |
| `lib/surface.js` | Cairo top flares + CSS body radius. |
| `lib/geometry.js`, `lib/layout.js` | Pure monitor/page geometry and adaptive layout decisions. |
| `lib/spring.js` | Damped spring / smooth easing geometry interpolation. |
| `lib/media.js` | MPRIS v2 client. Name/property/seek events do the work; only the visible Music page polls Position once per second. |
| `lib/features.js` | Opt-in feature definitions; pure calendar, notification policy and BlueZ models. |
| `lib/extras.js` | Optional overflow wrappers, reversible OSD dispatch and Bluetooth lifecycle. |
| `lib/calendar.js` | Dedicated local calendar page: month/date navigation, accessible keyboard grid, responsive card. No polling. |
| `lib/bluetooth.js` | Cancellable system-bus BlueZ ObjectManager; signals only, created on opt-in. |
| `lib/musicExtras.js` | Visible-only title timeline, direct player picker and cancellable local-art metadata checks. |
| `lib/notifications.js` | Reversible message-tray banner routing. |
| `lib/diagnostics.js` | procfs CPU/RAM/network sampling and UPower battery proxy. Sampling runs only while System is visible; battery state changes are always observed and emit a plug-in charging transition. |
| `lib/actions.js` | GSettings-backed Do Not Disturb / Night Light / Dark Mode toggles. |
| `lib/widgets.js`, `lib/icons.js` | St construction helpers and bundled monochrome chrome icons. |
| `lib/model.js` | Dependency-free parsers/formatters used by Node and GJS tests. |
| `lib/dbus.js` | Cancellable, never-auto-starting proxy helpers. |

## Page model

The open notch has four base pages: Home, Music, Alerts, System. Calendar is a
fifth page/tab only while `calendar-enabled` is true. Disabling the switch hides
the tab and its slot; if active, it returns to Home and transfers keyboard focus.
Programmatic selection of disabled Calendar is rejected too. Calendar is not
embedded in Home; Timer/Pomodoro and its schema/preferences have been removed.

Alerts always scrolls. Calendar uses an overflow wrapper; optional Music/System
content also enables vertical scrolling. Home stays a natural-height centered
clock/date. Page budgets grow within configured/monitor limits.

The centered header accepts a visible tab count. Five tabs use text-only labels
at normal widths; four retain icon+label tabs. Narrow/large-text layouts switch
to icons, with smaller slots/gutters at very narrow widths. Hidden Calendar slots
do not consume space. Settings/close remain in the fixed right gutter.

Calendar owns only actors and a key handler. Its local-noon date model supplies a
stable 42-day grid including adjacent-month dates. Date selection never accesses
accounts or events. A single selected-day tab stop plus arrow/Page Up/Page Down/
Home navigation avoids 42 keyboard tab stops; full accessible date labels and
selected/today states are provided. Large text increases row height and scrolls
vertically. The existing wall clock refreshes the today highlight at local day
changes; no additional clock source or background job is created.


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

## Optional feature lifetimes (build 21)

All eight switches default off in both preferences UIs. Timer/Pomodoro code,
controls and four schema keys from build 20 are removed. Old dconf values, if any,
are inert; other preferences and the existing calendar-enabled choice are retained.

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
