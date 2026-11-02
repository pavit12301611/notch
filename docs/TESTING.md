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

These checks do **not** start a real GNOME Shell compositor. A headless container cannot certify overlay input, animations, Wayland lifecycle or live MPRIS behavior.

## Live acceptance checklist (Fedora 44 / GNOME 50 Wayland)

### Install and discovery

- [ ] `./install.sh --with-deps` completes as the desktop user.
- [ ] After logout/login, `gnome-extensions enable notch@pavit12301611.github.io` succeeds.
- [ ] `notch-doctor` reports build 20 loaded and installed, and no legacy helper artifacts.
- [ ] Updating from build 17 removes `notch-helper`, `notch-shelf`, the Helper D-Bus service, `notch-helper.service` and old Python modules.
- [ ] Custom `XDG_DATA_HOME` installs/uninstalls extension, schemas, launcher and doctor paths consistently.
- [ ] Uninstall removes installed files but retains settings until explicitly purged.

### Closed notch and motion

- [ ] Closed notch sits flush with the top panel, replaces the centered clock, and shows idle time.
- [ ] Music wings appear only while a player is active; equalizer bars are centered/proportional, animate continuously and stop when hidden/paused/reduced-motion.
- [ ] Plugging in the charger shows the green charging badge once for under two seconds; already-charging startup, unplug and percentage-only updates do not show it.
- [ ] Click, hover and Super+` open/close the notch; Escape and outside click collapse it.
- [ ] Open/close springs finish and snap under reduced motion; no repeating timeline or relayout storm remains.

### Pages (all optional switches off)

- [ ] Home shows only a large clock and small date; it is never empty.
- [ ] Music shows title/artist, transport and seek only when supported; no player shows a clean empty state; no volume controls or album art appears.
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

- [ ] Opening Music while YouTube/Spotify plays does not freeze the Shell or stutter audio.
- [ ] Seek slider updates do not feed back into MPRIS commands.
- [ ] Measure a 10-minute idle session, a visible System page, and visible Music playback. Compare Shell CPU before/after enabling Notch. Use `ps`, `pidstat`, `/proc/PID/smaps_rollup` and GNOME Looking Glass/perf as appropriate. Publish measured numbers with hardware, scaling and workload; do not copy a marketing number from this document.

## Reporting rule

Do not label the project “tested on Fedora 44” until the live checklist has been run and any failures are fixed or explicitly documented.

### Optional features (build 20)

- [ ] Both preferences UIs show the same Features switches, initially off; settings
      persist on reopening, update each other live, and do not reset existing preferences.
- [ ] Timer: quick timer and Focus/Break duration preferences; Start/Pause/Resume/Reset;
      accurate delayed tick completion once; closed countdown also with idle clock off.
      Finish Focus → Next session starts Break, finish Break → Focus. Turning off,
      changing duration or reloading extension resets/stops the source.
- [ ] Completion cue animates only with motion enabled; no overlay/sound over lock
      screen; done state survives hiding/unlock until reset or next session.
- [ ] Volume/mute/brightness keys: level + percentage in closed notch and open
      footer. Each independent switch restores the native OSD immediately; no
      duplicates on the notch monitor. Test >100% volume, other monitors, unknown
      OSD icons, fullscreen, overview, lock screen and a live notification peek.
- [ ] Privacy: send an OTP-like title/body and action label; toggle while peeking
      and while Alerts is open. No private text in visual/accessibility labels.
      Turning off restores text/actions. Verify native critical banners remain native.
- [ ] App controls: disable an installed app's peek; its alert remains in Alerts
      with normal count/actions. Re-enable it; test a generic notify-send source
      name and custom desktop ID. Master switch off ignores stored exclusions.
      DND/native app policy still wins; native sounds are not muted by peek filtering.
- [ ] Bluetooth: connect a Battery1-capable headset/mouse, update/disconnect it;
      percentage and a single connection cue. Existing connections on startup do
      not peek. Test absent/stopped BlueZ, unsupported devices, disable during
      connection and repeated toggle cycles (no leftover signal handler/client).
- [ ] Calendar: date click, month/year rollover, leap February, Today, local
      timezone/midnight highlight and large text. Switch off closes it immediately.
- [ ] Music polish: long title smoothly scrolls, short title stays still; direct
      selection between two players; motion stops on hide/close/tab switch and
      reduced motion. Switching off restores wrapped titles and original cycling.
- [ ] Artwork: separately opt-in local raster image displays; HTTP/SVG/missing,
      oversized and symlink files do not. Toggle off or change track during load:
      stale results never appear and pending requests cancel. No network downloads.
- [ ] With all features enabled, verify Home/Music/System overflow is reachable by
      pointer and keyboard at small heights, narrow monitors and 100–200% text.
      Fixed header/close remain usable. No extra tabs or helper daemon.
- [ ] Repeat enable/disable ten times while playing media, with a running timer,
      Bluetooth connected and pending OSD/artwork events; no stale callbacks,
      persistent sources, duplicate native hooks or Shell journal errors.
