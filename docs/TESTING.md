# Validation and release checklist

## What is automated

- JavaScript syntax/lint, pure model/geometry/spring/notification-bridge tests, and strict St.Icon/BoxLayout widget-construction contract tests.
- Python compilation, shelf storage integrity/permissions/bounds, schema-key references and install-template substitution tests.
- GSettings schema compilation and a GJS/GLib smoke test in the Fedora CI recipe.
- Desktop-entry validation and a noarch RPM build in the Fedora CI recipe.

These checks do **not** start a real GNOME Shell compositor. A headless container cannot certify overlay input, animations, Wayland drag-and-drop or Shell lifetime cleanup.

## Local development checks

```bash
npm ci
make stage
make check
```

On Fedora, also run:

```bash
mkdir -p .generated/schemas
cp extension/schemas/*.xml .generated/schemas/
glib-compile-schemas .generated/schemas
GSETTINGS_SCHEMA_DIR="$PWD/.generated/schemas" \
  dbus-run-session -- gjs -m tests/gjs_smoke.js
```

## Live Fedora 44 / GNOME 50 acceptance run

Use a test user/session. Record GNOME Shell, Mutter, GTK4, Libadwaita and kernel versions. Start with:

```bash
gnome-shell --version
notch-doctor
journalctl --user -b -t gnome-shell -f
```

### Installation and lifetime

- [ ] Fresh user install succeeds without root except optional dependency installation.
- [ ] Logout/login discovers the extension; enable succeeds without OUT_OF_DATE.
- [ ] Settings launches from the app grid and from the extension’s preferences action.
- [ ] Helper is enabled for graphical login and can be bus-activated after idle exit.
- [ ] Disable/re-enable the extension 20 times: no duplicate actors, shortcuts, timers or bus names.
- [ ] Logout/login after upgrade loads the new module code; `notch-doctor` reports matching loaded/installed extension builds.
- [ ] Uninstall removes installed files but retains settings/shelf until explicitly purged.
- [ ] RPM install/upgrade/remove works without file conflicts or unpackaged schema artifacts.

### Geometry, input and animation

- [ ] Top-center, floating and panel modes place correctly at 100%, 125%, 150% and 200% scaling.
- [ ] Primary and secondary monitors; hotplug/unplug; monitor index out of range falls back safely.
- [ ] Expanded content is readable and keyboard-focusable at minimum and maximum sizes; pages scroll when vertical space is limited.
- [ ] Header labels collapse to active-only/icon-only on narrow widths instead of truncating every tab.
- [ ] 100%/125%/150%/200% display scaling and large text settings do not double-scale or clip the closed clock.
- [ ] Hover dwell, click, Super+grave, Escape and outside-click behave as documented.
- [ ] Slider dragging outside the notch does not collapse it mid-gesture.
- [ ] Fullscreen video/game hides the notch on its monitor and restores it afterward.
- [ ] Overview, lock screen and unlock do not leave stale chrome or expose clipboard history.
- [ ] GNOME Enable Animations off and Notch animations off both remove motion.
- [ ] Experimental reservation changes only the collapsed work-area inset and restores it on disable.

### MacBook notch, clock and notifications

- [ ] Default placement is the top edge; the centered GNOME clock is hidden only while the notch is visible on that monitor.
- [ ] Idle notch shows local time and respects 12/24-hour and timezone changes.
- [ ] Ordinary notifications appear as compact notch peeks instead of top-center banners; peek actions, Open and the full Alerts page work.
- [ ] Critical notifications still use the native banner path.
- [ ] DND/app banner settings still suppress normal previews; critical notifications still behave as GNOME intends.
- [ ] Disabling routing or the extension restores native banners, including an active banner.
- [ ] Fullscreen/overview/lock does not leave the clock hidden or expose notification content through the notch.
- [ ] Closed notch matches panel height, shows idle clock, and grows music wings only while a player is active.
- [ ] Open/close/page-resize spring animation is smooth, honors GNOME Enable Animations, and does not overshoot the monitor.
- [ ] Smooth motion profile honors the configured open/close durations.

### Media/audio

- [ ] Spotify, Rhythmbox, VLC and Firefox MPRIS appear and disappear cleanly.
- [ ] Switch players; previous/play/pause/next respect advertised capabilities.
- [ ] Seek a long track, change tracks while visible, pause, and seek from another client.
- [ ] Player volume and system output volume/mute stay synchronized with external changes.
- [ ] Local file art, data URI art and HTTPS art render; broken/oversized art falls back safely.
- [ ] Disabling remote art prevents HTTP(S) art requests.
- [ ] No position timer remains after leaving Media or collapsing the notch.

### Diagnostics and actions

- [ ] CPU/RAM values agree approximately with `top`/`free` over the same interval.
- [ ] Network rates agree approximately with a known download/upload on the default interface.
- [ ] Interface changes and counter resets do not produce negative rates.
- [ ] Battery percentage/state updates on AC plug/unplug; desktop without battery shows AC.
- [ ] DND, Night Light and Dark Mode reflect and change GNOME’s actual settings.
- [ ] Hiding a quick action removes it without breaking the others.
- [ ] Quick-action buttons show on/off state, survive repeated clicks, and report locked/failed settings writes.
- [ ] Shelf offline state shows Retry; Retry starts the helper and buttons stop silently no-oping.
- [ ] `notch-doctor` reports helper D-Bus service/systemd unit state and activation failures.
- [ ] No diagnostics timer remains after leaving System or collapsing the notch.

### Shelf and external drag (highest-risk integration)

- [ ] Drag one and multiple local files from native Wayland Files toward the notch.
- [ ] Repeat from an XWayland file manager.
- [ ] Repeat on secondary monitor and fractional scaling; target aligns with the collapsed notch.
- [ ] Dropping stores references, never moves/copies/deletes originals.
- [ ] Cancel/leave hides the GTK target and restores normal window behavior.
- [ ] Open, Reveal and Copy URI work; missing files produce an error without crashing Shell.
- [ ] Add files uses the GTK chooser/portal and updates the Shell list.
- [ ] Remove/Clear changes references only.
- [ ] Unicode names, 100-item bound and corrupt shelf JSON are handled safely.
- [ ] Helper idle exit and reactivation preserve the shelf.

### Clipboard/privacy

- [ ] Default install has clipboard history disabled.
- [ ] Enabling captures plain text once, deduplicates, restores and respects the entry limit.
- [ ] Oversized/non-text/mixed-format clips are skipped.
- [ ] KeePassXC/libsecret-style secrecy hints are skipped when supplied.
- [ ] Lock, logout, disable and uninstall do not leave history in memory or on disk.
- [ ] No clipboard text or shelf URI appears in routine journal logs.

### Resource measurements

Measure a 10-minute idle session, a visible System page, visible Media playback, and clipboard-enabled idle. Compare Shell CPU before/after enabling Notch, and helper RSS before/after GTK loads. Use `ps`, `pidstat`, `/proc/PID/smaps_rollup` and GNOME Looking Glass/perf as appropriate. Publish measured numbers with hardware, scaling and workload; do not copy a marketing number from this document.

## Release gate

Do not label the project “tested on Fedora 44” until the live checklist has been run and any failures are fixed or explicitly documented. In particular, compositor-assisted GTK drop positioning must pass on real Wayland hardware before being advertised as universally supported.
