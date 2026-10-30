# Notch for GNOME

A Cyclop-inspired, expandable notch for **Fedora 44 Workstation / GNOME Wayland**: media controls, live system status, a file shelf, opt-in clipboard history, and GNOME quick actions.

**Version target:** Fedora 44 ships GNOME **50**, not GNOME 46/47. Fedora’s package listing is the reference for this correction. [1](https://packages.fedoraproject.org/pkgs/gnome-shell/gnome-shell/) The extension declares Shell 46–50 compatibility, but **GNOME 50 is the primary release target**; older versions need their own live desktop validation.

> Status: implementable project scaffold with working source, tests and packaging recipes. The repository was developed in a non-GNOME Linux sandbox. **A live Fedora 44/GNOME 50 session is still required for the acceptance checklist in [docs/TESTING.md](docs/TESTING.md). Do not interpret static checks as a live desktop certification.** See [docs/VALIDATION.md](docs/VALIDATION.md) for the exact local checks.

## Why this is a hybrid application

An ordinary GTK4 window cannot reliably position itself over GNOME’s top panel, remain above fullscreen windows, or reserve work-area space on Wayland. `gtk4-layer-shell` is not a solution on GNOME Mutter, which does not provide the required layer-shell protocol.

Notch therefore uses the same privileged desktop layer as GNOME’s own panel:

```text
┌──────────────────────── GNOME Shell / Mutter (Wayland) ────────────────────────┐
│ GJS + St/Clutter extension                                                    │
│   animated notch • MPRIS • CPU/RAM/network • UPower • quick toggles             │
│   opt-in RAM clipboard history • compositor-assisted external file drag        │
└───────────────┬───────────────────────────────────────┬───────────────────────┘
                │ session D-Bus                         │ session D-Bus
┌───────────────▼──────────────────┐   ┌────────────────▼───────────────────────┐
│ Python / GTK4 / Libadwaita        │   │ Python / Gio helper                    │
│ notch-settings                   │   │ notch-helper                           │
│ native preferences, on demand    │   │ GTK4 drop surface + file chooser       │
└──────────────────────────────────┘   │ atomic shelf-reference storage         │
                                       │ bus activation; exits after idle       │
                                       └────────────────────────────────────────┘
```

The notch itself is **not a GTK widget**: it uses GNOME Shell’s native St/Clutter toolkit so it looks and behaves like Shell chrome. The settings and actual file-drop surface use **GTK4**, and settings use **Libadwaita**. GJS is the supported language for Shell extensions; Python cannot run inside the Shell process.

Inspired by [akalikbergenov/cyclop](https://github.com/akalikbergenov/cyclop). No Cyclop Swift code, icons, or other assets are copied. This project is independent and is not affiliated with Cyclop or Apple.

## Features

| Area | Included behavior |
|---|---|
| Notifications | Ordinary GNOME banners become compact in-notch peeks with native actions; full Alerts page keeps unread count, calendar heading and dismiss-all. Critical alerts keep the native banner path. Routing respects GNOME DND/app policy and is reversible |
| Idle clock | Local time in the collapsed MacBook-style notch when no notification is active |
| Media | MPRIS player discovery/switching, title/artist/album, local/data/optional HTTP(S) album art, previous/play/pause/next, seek, player volume, system output volume/mute, raise player |
| System | CPU utilization, RAM used/total, UPower battery percentage/state/power, default-interface download/upload rates |
| Quick actions | Do Not Disturb, Night Light, Dark Mode; each can be hidden in settings |
| File shelf | Drag local files near the notch onto a GTK target, or choose files through GTK/portal; open, reveal, copy URI, remove reference, clear shelf |
| Clipboard | Optional plain-text history, bounded size, deduplication, restore, manual capture, clear; RAM-only and cleared on lock/disable |
| Appearance | MacBook top-edge silhouette with flared shoulders, adaptive corners, panel-height closed state, music wings, monitor-aware per-page sizing, label collapse, scrollable pages, scale, monitor, offset and opacity; optional legacy below-panel/floating modes |
| Behavior | Mac-style damped-spring opening from the top edge, hover dwell, click, keyboard shortcut, notification peeks, auto-hide, reduced-motion-aware animation, fullscreen/overview hiding, optional collapsed work-area reservation |
| Setup | User install script, systemd user service, D-Bus activation, RPM spec, doctor command, Fedora CI recipe |

### Important boundaries

- **No physical camera-cutout detection.** Configure the notch geometry for your display. The utility draws a notch-shaped overlay; it does not identify camera hardware.
- **The default MacBook mode replaces the centered top-bar clock.** The original clock is restored when the notch hides, on other monitors, or when `replace-panel-clock` is off. Legacy below-panel and floating modes remain optional; floating mode is the Dynamic-Island-like layout, not the default.
- **Notification routing is reversible.** Notch mirrors GNOME’s existing notification objects; GNOME still owns policy, sounds, actions and expiry. Native banners return for critical alerts and when routing is disabled, the notch is hidden by fullscreen/overview/lock policy, or the extension is disabled.
- **Adaptive layout is automatic.** The notch uses the actual monitor rectangle and text scale. Header labels collapse before truncating, pages scroll when vertical space is limited, and helper/action failures appear in a dismissible status bar with Retry where applicable.
- **Work-area reservation is experimental and opt-in.** It reserves the collapsed edge region, not the expanded panel, and Mutter may apply the inset as a top-edge work-area reduction. It is not a pixel-perfect window mask.
- **The shelf stores references, not copies.** Removing a shelf item never removes the original. Dragging files *out* of the Shell notch is not implemented; use Open, Reveal, or Copy URI.
- **Clipboard history is text-only and off by default.** Known password-manager hints and mixed-format offers are skipped, but a password manager that exposes plain text without a hint cannot be detected reliably. Keep history off when handling secrets.
- **MPRIS capabilities vary.** Seek requires a player exposing `CanSeek`, a track length, and a usable position/track ID. Firefox must have MPRIS/media-key integration enabled. A player that does not implement a capability cannot be forced to support it.
- Shell extensions use internal GNOME APIs. Test after every GNOME major upgrade; never bypass version checks by editing metadata blindly.

## Quick start on Fedora 44

### One command — no GitHub page or git clone needed

Run this in your Fedora desktop terminal (as your normal user, **not** with `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/pavit12301611/notch/refs/heads/arena/a8df1ad3-notch/scripts/bootstrap.sh | bash -s -- --with-deps
```

This downloads the complete source snapshot over HTTPS, installs Fedora dependencies, and installs Notch for your user. The dependency step prompts for your sudo password in the terminal. Temporary download files are removed afterwards. The command tracks the `arena/a8df1ad3-notch` branch; for a reproducible install, set `NOTCH_REF` to a full commit SHA.

If you prefer to inspect the bootstrap before running it:

```bash
curl -fsSL https://raw.githubusercontent.com/pavit12301611/notch/refs/heads/arena/a8df1ad3-notch/scripts/bootstrap.sh -o /tmp/notch-bootstrap.sh
less /tmp/notch-bootstrap.sh
bash /tmp/notch-bootstrap.sh --with-deps
```

### From a local checkout

From a GNOME Wayland session:

```bash
./install.sh --with-deps
```

`--with-deps` asks `sudo` to install Fedora packages. Then **log out and back in**. This is required on Wayland: `Alt`+`F2`, `r` is not a supported Shell restart mechanism there.

```bash
gnome-extensions enable notch@pavit12301611.github.io
notch-settings
notch-doctor
```

The default is a MacBook-style top-edge notch: idle time sits where the GNOME clock used to be, music grows small closed-state wings, and ordinary notifications appear as compact peeks. Click a peek or the Alerts tab for the full notification list. Click the notch, hover over it, or press **Super + `** (the key above Tab on a US keyboard). Press Escape or click outside to collapse it.

### Manual dependency installation

```bash
sudo dnf install \
  python3 python3-gobject gtk4 libadwaita glib2 glib2-devel \
  gobject-introspection gnome-shell gnome-extensions-app \
  upower libsoup3 adwaita-icon-theme hicolor-icon-theme \
  xdg-desktop-portal-gnome make

./install.sh
```

There is **no package named `mpris` to install**. MPRIS is a D-Bus specification implemented by media players. Notch talks to it through Gio. `gobject-introspection` and the GTK/Adwaita/Soup typelibs supply the language bindings; `python3-gobject` supplies PyGObject. There are no runtime PyPI dependencies.

### What the installer changes

Default user installation:

```text
~/.local/share/gnome-shell/extensions/notch@pavit12301611.github.io/
~/.local/share/notch/                         # application code/docs
~/.local/share/glib-2.0/schemas/              # compiled settings schema
~/.local/share/applications/                  # Notch settings launcher
~/.local/share/dbus-1/services/               # helper bus activation
~/.local/share/icons/hicolor/scalable/apps/   # application icon
~/.local/bin/{notch-settings,notch-helper,notch-doctor}
~/.config/systemd/user/notch-helper.service
```

It enables the extension and helper when a session bus is available. Use `./install.sh --no-enable` to install files without changing activation state. Settings and shelf references are retained across upgrades.

### systemd user service

The installer sets this up. To manage it explicitly:

```bash
systemctl --user daemon-reload
systemctl --user enable notch-helper.service
systemctl --user restart notch-helper.service
systemctl --user status notch-helper.service
```

The helper also has a D-Bus activation file. It does not open a window at login, imports GTK only when needed, and exits after five idle minutes. **Inactive after idle is normal**; the next shelf/drop request can reactivate it. The notch itself lives inside GNOME Shell and does not need a second permanent UI daemon.

### System-wide installation

```bash
sudo ./install.sh --system
# Log out/in, then enable the extension for each user:
gnome-extensions enable notch@pavit12301611.github.io
```

System files go under `/usr` and `/etc/systemd/user`. Extension activation and preferences remain per-user. Do not install both a user copy and a system copy: the user copy shadows the system extension and makes upgrades confusing.

## Project layout

```text
notch/
├── README.md
├── LICENSE                              # GPL-3.0-or-later
├── Makefile                             # stage/install/uninstall/check/dist/rpm
├── install.sh / uninstall.sh
├── scripts/bootstrap.sh                 # curl-based remote user installer
├── pyproject.toml                       # optional editable Python development install
├── package.json / package-lock.json     # development-only JS checks
├── eslint.config.js
├── .github/workflows/ci.yml             # Fedora 44 container checks + RPM build
├── extension/
│   ├── metadata.json                    # UUID, Shell versions, settings schema
│   ├── extension.js                     # enable/disable, keybinding, private D-Bus API
│   ├── prefs.js                         # inline Libadwaita preferences pages
│   ├── stylesheet.css                   # St/CSS notch styling and transitions
│   ├── schemas/
│   │   └── io.github.pavit12301611.Notch.gschema.xml
│   ├── dbus/                            # MPRIS, UPower and private helper interfaces
│   └── lib/
│       ├── view.js                      # chrome actor, spring animation, pages, peeks, drag positioning
│       ├── surface.js                   # Cairo top flares + St bottom-radius body
│       ├── spring.js                    # bounded damped-spring geometry integrator
│       ├── layout.js                    # monitor/text-aware content layout and breakpoints
│       ├── widgets.js                   # accessible St controls
│       ├── geometry.js                  # pure placement/clamping logic
│       ├── model.js                     # pure parsers, formatters, clipboard ring buffer
│       ├── notifications.js             # reversible GNOME banner routing into the notch
│       ├── media.js                     # event-driven MPRIS client
│       ├── audio.js                     # reuses Shell's Gvc mixer connection
│       ├── art.js                       # bounded/cancellable album-art loader
│       ├── diagnostics.js               # gated procfs sampling + UPower proxy
│       ├── actions.js                   # GNOME quick settings
│       ├── clipboard.js                 # opt-in Mutter selection transfers
│       ├── shelf.js                     # helper client
│       ├── dbus.js / launcher.js
├── app/notch_app/
│   ├── settings.py                      # GTK4 + Libadwaita preferences
│   ├── helper.py                        # GTK drop surface, file chooser, shelf D-Bus service
│   ├── storage.py                       # validated, atomic JSON reference store
│   ├── doctor.py                        # installation/session diagnostics
│   └── config.py / __init__.py / __main__.py
├── data/
│   ├── *.in                             # prefix-substituted launchers/desktop/service files
│   └── io.github.pavit12301611.Notch.svg
├── packaging/rpm/notch.spec
├── tests/
│   ├── js/model.test.js
│   ├── python/test_storage.py
│   ├── python/test_project.py
│   └── gjs_smoke.js
└── docs/
    ├── ARCHITECTURE.md
    ├── TESTING.md
    ├── SECURITY.md
    └── VALIDATION.md
```

## Configuration

Use **Notch Settings** for the supported UI. Equivalent examples:

```bash
SCHEMA=io.github.pavit12301611.Notch

gsettings set "$SCHEMA" placement 'panel'          # panel = MacBook top edge; top-center/floating are optional legacy modes
gsettings set "$SCHEMA" collapsed-width 185
gsettings set "$SCHEMA" collapsed-height 32
gsettings set "$SCHEMA" match-panel-height true
gsettings set "$SCHEMA" expanded-width 640
gsettings set "$SCHEMA" expanded-height 320
gsettings set "$SCHEMA" notch-scale 1.0
gsettings set "$SCHEMA" adaptive-corners true
gsettings set "$SCHEMA" closed-media true
gsettings set "$SCHEMA" opacity 1.0
gsettings set "$SCHEMA" replace-panel-clock true   # hide GNOME clock only while the notch is visible
gsettings set "$SCHEMA" idle-clock true            # show local time when idle
gsettings set "$SCHEMA" notifications-in-notch true
gsettings set "$SCHEMA" auto-open-notifications true   # compact notification peeks
gsettings set "$SCHEMA" peek-duration-ms 5000
gsettings set "$SCHEMA" animation-profile mac-spring # or smooth
gsettings set "$SCHEMA" open-animation-ms 420        # used by smooth profile
gsettings set "$SCHEMA" close-animation-ms 450
gsettings set "$SCHEMA" monitor-index -1           # primary monitor
gsettings set "$SCHEMA" hide-on-fullscreen true
gsettings set "$SCHEMA" clipboard-enabled false    # privacy-safe default
gsettings set "$SCHEMA" remote-art false           # no HTTP(S) art requests
gsettings set "$SCHEMA" toggle-notch "['<Super>n']"
gsettings set "$SCHEMA" toggle-notch "@as []"      # disable the shortcut
```

Changes are live through GSettings. The schema enforces ranges. For multi-monitor use, the selected index follows Mutter’s current monitor ordering; use `-1` if you want the primary display to follow hotplug changes.

## Performance model

- No separate polling media daemon. MPRIS names/properties/seek notifications and UPower property changes are event-driven.
- CPU/RAM/network sampling: one timer, **only while System is visible**.
- Media position refresh: one timer, **only while Media is visible**; playback controls themselves are signal-driven.
- Clipboard: automatic capture is off by default; when enabled, one bounded selection transfer per second while unlocked.
- Album art: optional remote fetches, 2 MiB limit, 10-second session timeout, cancellation, 12-entry cache.
- Helper: no visible window at startup, lazy GTK import, five-minute idle exit, bus activation on demand.
- No permanent frame loop. A Clutter frame timeline runs only while the notch spring/easing is moving; the closed music indicator ticks at ~4 Hz only while playback is visible. Both honor GNOME’s animation setting.
- Idle clock uses GnomeDesktop.WallClock signals; notification routing reuses GNOME’s message tray instead of polling a second notification store.

These are design budgets, **not measured performance claims**. Profile on your hardware with the checklist in `docs/TESTING.md` before publishing CPU/RAM numbers.

## RPM and COPR

A source-install script is the simplest development path. A noarch RPM recipe is also included:

```bash
sudo dnf install rpm-build make git-core glib2 desktop-file-utils systemd-rpm-macros
make rpm
sudo dnf install dist/rpmbuild/RPMS/noarch/notch-0.1.0-1.*.noarch.rpm
```

The SRPM is under `dist/rpmbuild/SRPMS/`. You can upload it to your own COPR project after reviewing the spec and testing the resulting RPM. **No COPR repository or Fedora package is published by this repository automatically.**

A Flatpak manifest is intentionally not the primary distribution: a sandboxed settings app cannot install or execute the required host Shell extension. Shipping only the preferences in Flatpak would not deliver the notch. Use the complete user installer or RPM.

## Development and checks

```bash
npm ci
make stage
make check

# Optional GJS smoke test on Fedora, with compiled schemas:
mkdir -p .generated/schemas
cp extension/schemas/*.xml .generated/schemas/
glib-compile-schemas .generated/schemas
GSETTINGS_SCHEMA_DIR="$PWD/.generated/schemas" \
  dbus-run-session -- gjs -m tests/gjs_smoke.js

# Optional editable Python entry points; extension/schema installation is still required:
python3 -m venv --system-site-packages .venv
. .venv/bin/activate
pip install -e .
```

Do not run the GTK helper under `sudo`. It is a per-user session service. Do not load GTK4 into GNOME Shell; keep GTK in the separate Python processes.

## Troubleshooting

```bash
notch-doctor
gnome-extensions info notch@pavit12301611.github.io
journalctl --user -b -t gnome-shell --no-pager | grep -i notch
journalctl --user -u notch-helper.service -b --no-pager
busctl --user list | grep -E 'Notch|mpris'
```

| Symptom | Check |
|---|---|
| Extension not listed after install | Log out/in; confirm the directory name exactly matches the UUID |
| Extension shows OUT_OF_DATE | Use the intended GNOME version; do not disable version validation as a fix |
| Settings reports missing schema | Re-run the installer; run `notch-doctor`; avoid mixing user/system copies |
| No media | Start playback and inspect `busctl --user list` for MPRIS names; Firefox may need media-key/MPRIS support enabled |
| No seek | The current player may not expose `CanSeek`, length or track ID |
| No album art | Enable remote art if the player supplies a URL; check that the URL is reachable and returns a supported image |
| Shelf helper offline | `systemctl --user restart notch-helper.service`; then `notch-doctor` |
| Drop target does not appear | Start the helper first, drag local files from Files toward the notch, and keep the pointer there briefly; use Add files as the portal-backed fallback |
| Want the original clock back | Turn off “Replace top-bar date & time”, or switch placement away from MacBook top edge |
| Need emergency disable | `gnome-extensions disable notch@pavit12301611.github.io`; from a TTY, `gsettings set org.gnome.shell disable-user-extensions true` disables all user extensions |

## Uninstall

```bash
./uninstall.sh                 # user installation
sudo ./uninstall.sh --system   # system installation
```

Then log out/in. Settings and shelf references are deliberately retained. The uninstaller prints explicit commands to remove them if desired.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). Review dependency licenses separately when distributing binary packages.
