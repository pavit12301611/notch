# Architecture and lifetime rules

## Process boundaries

1. **GNOME Shell extension (GJS/St/Clutter)** owns all always-visible chrome. It is loaded by Shell, not by systemd. `enable()` creates the actor, controllers, keybinding and a private session-bus object; `disable()` reverses those operations.
2. **Preferences** are shown inline by `extension/prefs.js` in the separate GNOME Extensions GTK4/Libadwaita process, bound directly to the extension GSettings schema. The optional **Python companion app** (`notch-settings`) runs only when opened and provides the same schema plus shelf/file-chooser/status tools; it calls the extension’s private bus name for state/history operations.
3. **Helper (Python/Gio, lazy GTK4)** owns file-drop input and shelf storage. It is session-bus activatable and systemd-user supervised. It exits cleanly after five minutes without interaction and no visible drop target/dialog.

Bus names are intentionally distinct:

- Settings application: `io.github.pavit12301611.Notch`
- Extension control endpoint: `io.github.pavit12301611.Notch.Extension`
- Helper: `io.github.pavit12301611.Notch.Helper`

This prevents the settings GApplication from stealing the extension’s control name. Private D-Bus methods are not a stable cross-project API.

## Why the file-drop helper exists

Shell’s XDND handler exposes drag position/enter/leave notifications, but its normal Shell drag target protocol does not hand an extension the dropped file URIs. Pretending that `acceptDrop()` on a St actor receives Nautilus files would be incorrect.

The implemented path is:

1. The extension observes Mutter’s drag-position events.
2. Near the notch, it requests a temporary GTK4 window from the helper.
3. The compositor moves that window below the collapsed notch using Mutter’s window APIs. The GTK client does not attempt forbidden Wayland self-positioning.
4. The helper’s `Gtk.DropTarget` accepts `Gdk.FileList`, validates local file URIs and stores references atomically.
5. A `ShelfChanged` D-Bus signal updates the Shell list. The helper hides when the drag ends.

This is the most compositor-sensitive part of the project and must be tested with native Wayland GTK apps, XWayland apps, fractional scaling and multiple monitors. The GTK file chooser remains a functional fallback if a particular drag source cannot target the temporary surface.

## Overlay and input

- `Main.layoutManager.addChrome()` registers the notch with Shell’s input-region tracking.
- The actor clips its expanding content. Clutter implicit animations change position/size/opacity; no frame clock callback is installed.
- A separate, invisible edge actor optionally reserves **collapsed** space. Expanded content never changes struts.
- Fullscreen and overview visibility are evaluated for the configured monitor. The extension does not fight Shell’s own `trackFullscreen` visibility binding.
- Escape/outside-click handling does not install a modal grab. Slider grabs postpone pointer-leave/auto-hide collapse.
- The helper window is placed only when its geometry/mapped state changes, not on every pointer-motion event.

## Media and audio

`MediaController` watches `NameOwnerChanged`, creates root/player proxies, and listens for property changes and `Seeked`. It selects a playing player initially and lets the user cycle between available players. Position is fetched only when needed because MPRIS does not generally emit position property changes.

Capabilities come from the player (`CanPlay`, `CanPause`, `CanSeek`, etc.). `SetPosition` is preferred when a valid track object path exists; `Seek` is the fallback. Errors are surfaced without logging media metadata.

System volume reuses `ui/status/volume.js:getMixerControl()`. Opening another `Gvc.MixerControl` would create another audio connection, so the helper module deliberately does not do that. The shared control is disconnected from this extension’s signals on disable, but never closed by this extension.

## Diagnostics

- CPU: aggregate `/proc/stat` deltas, excluding guest counters already included in user/nice.
- RAM: `MemTotal - MemAvailable`, not `MemFree`.
- Network: `/proc/net/dev` byte-counter deltas over monotonic elapsed time; default IPv4 route from `/proc/net/route`, with loopback/common virtual interfaces excluded when no default route exists.
- Battery: UPower DisplayDevice properties, not a polling shell command.

The first sample establishes a baseline. Counter resets/interface changes produce an em dash or ellipsis rather than a negative rate. This is a system monitor, not a per-process accounting tool.

## Clipboard

Mutter does not expose a public clipboard-owner-change signal through St. Automatic history therefore uses a one-second opt-in poll. Transfers are bounded to 64 KiB plus an overflow-detection byte, UTF-8 is validated, mixed/unknown MIME offers and known secrecy hints are skipped, and history is deduplicated and bounded.

History is never serialized. It is cleared on lock, disable and extension destruction. Restore uses St’s clipboard API. The feature is not a password vault; see SECURITY.md.

## Cleanup checklist for contributors

Any new controller must have an explicit `destroy()` that:

- removes every GLib timeout/idle source;
- cancels cancellable asynchronous work and checks a lifetime/generation token before touching actors;
- disconnects GObject signals and D-Bus subscriptions;
- unexports/unowns bus endpoints;
- removes chrome before destroying actors;
- clears clipboard buffers and cached file/art data where appropriate;
- leaves shared Shell services (Gvc, Mutter, Shell app system) alive.

Do not retain actors, settings, proxies or windows in module-level globals after `disable()`. Do not use `imports.ui...` legacy imports; use ESM `resource:///org/gnome/shell/...` and `gi://...` imports.

## Compatibility policy

Metadata currently declares GNOME 46–50. The primary release target is 50. A metadata entry is not a promise that internal APIs have been exercised on every release. Before claiming support for another major version, run the full live checklist and review at least:

- `LayoutManager.addChrome/removeChrome`
- `Meta.Backend.get_dnd()` signals
- `Meta.Selection.transfer_async()`
- `St.Clipboard`, `St.Slider`, `St.Icon`
- `ui/status/volume.js:getMixerControl()`
- extension `openPreferences()` behavior
- GTK4 window movement from the compositor

Never edit `shell-version` simply to suppress an incompatibility error.
