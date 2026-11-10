# Testing

## Automated checks

Run from the repository root:

```bash
npm ci
make stage
make check
```

`make check` runs Python compilation/unit tests, ESLint, Node model/layout tests, schema dry-run compilation, desktop-file validation when available, and `node --check` on every extension module.

Fedora CI additionally runs the GJS/GLib smoke test under `dbus-run-session`, `notch-doctor --offline` with a staged schema, and `make rpm`.

These checks do **not** start a real GNOME Shell compositor. A headless container cannot certify overlay input, animations or Wayland lifecycle.

## Live acceptance checklist (Fedora 45 / GNOME 51 Wayland)

### Install and discovery

- [ ] `./install.sh --with-deps` completes as the desktop user.
- [ ] After logout/login, `gnome-extensions enable notch@pavit12301611.github.io` succeeds.
- [ ] `notch-doctor` reports build 22 loaded and installed, and no legacy helper artifacts.
- [ ] Updating from build 17 removes `notch-helper`, `notch-shelf`, the Helper D-Bus service, `notch-helper.service` and old Python modules.
- [ ] Custom `XDG_DATA_HOME` installs/uninstalls extension, schemas, launcher and doctor paths consistently.
- [ ] Uninstall removes installed files but retains settings until explicitly purged.

### GNOME Shell 51 compatibility

- [ ] After upgrading Fedora 44 → 45, the installed build still reports `State: ACTIVE`; a pre-build-20 copy shows `OUT OF DATE` until it is reinstalled.
- [ ] `journalctl -b _COMM=gnome-shell --no-pager | grep -E 'No property|JS ERROR'` shows no `No property vertical on StBoxLayout`; every page, the notification list and the system action row lay out vertically where intended.
- [ ] `gnome-extensions info notch@pavit12301611.github.io` reports `Version: 22` after a logout/login.
- [ ] On GNOME 51, Settings → Accessibility → Seeing → Reduce Motion makes open/close snap without leaving the notch in a partial size.
- [ ] On a GNOME 48–50 machine the same build still opens, closes and lays out vertically through the `:vertical` fallback (or through `:orientation` on 48+).

### Closed notch and motion

- [ ] Closed notch sits flush with the top panel, replaces the centered clock, and shows idle time.
- [ ] Plugging in the charger shows the green charging badge once for under two seconds; already-charging startup, unplug and percentage-only updates do not show it.
- [ ] Click, hover and Super+` open/close the notch; Escape and outside click collapse it.
- [ ] Open/close springs finish and snap under reduced motion; no repeating timeline or relayout storm remains.

### Pages

- [ ] Home shows only a large clock and small date; it is never empty.
- [ ] Alerts count matches real cards; long bodies expand/collapse; native actions, dismiss and clear-all work; only Alerts scrolls.
- [ ] System shows 2×2 metric tiles and working DND/Night Light/Dark Mode toggles; sampling stops when the page is hidden.
- [ ] Header stays centered on every tab: labels at normal widths, icons when narrow; settings and close remain inside the notch; no tab text truncates.
- [ ] Expanded content is readable and keyboard-focusable at minimum and maximum sizes and at 100/125/150% text scaling.

### Notifications and lifecycle

- [ ] Ordinary banners become compact peeks; critical alerts keep the native banner path.
- [ ] DND/app policy is respected; turning routing off restores native banners.
- [ ] Overview, lock screen and unlock do not leave stale chrome.
- [ ] Disable/re-enable leaves no timers, signal handlers, bus names, injections or actors behind.

### Stability and performance

- [ ] Measure a 10-minute idle session and a visible System page. Compare Shell CPU before/after enabling Notch. Use `ps`, `pidstat`, `/proc/PID/smaps_rollup` and GNOME Looking Glass/perf as appropriate. Publish measured numbers with hardware, scaling and workload; do not copy a marketing number from this document.

## Reporting rule

Do not label the project “tested on Fedora 45” until the live checklist has been run and any failures are fixed or explicitly documented.
