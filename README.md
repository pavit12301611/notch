# Notch for GNOME

A Cyclop-inspired, expandable **MacBook-style top-edge notch** for **Fedora 45 Workstation / GNOME Wayland**: idle clock, in-notch notifications, live system status and GNOME quick actions.

**Version target:** Fedora 45 ships GNOME **51**. The extension declares Shell 46–51 compatibility, but **GNOME 51 is the primary release target**; older versions need their own live desktop validation. Fedora 44 / GNOME 50 and Fedora 42–43 / GNOME 48–49 use the same build.

> Status: working source, tests and packaging recipes. The repository was developed in a non-GNOME Linux sandbox. **A live Fedora 45/GNOME 51 session is still required for the acceptance checklist in [docs/TESTING.md](docs/TESTING.md). Do not interpret static checks as a live desktop certification.** See [docs/VALIDATION.md](docs/VALIDATION.md) for the exact local checks.

## What changed in build 23

- **Fixed notch visibility after GNOME Activities Overview (`Main.overview`).** GNOME 51 starts in Overview and emits `hiding` before `Main.overview.visible` becomes `false`. Listening to `Main.overview` `'hidden'` in addition to `'hiding'` and checking `Main.overview.visibleTarget ?? Main.overview.visible` ensures the notch reappears immediately after leaving Overview so `allowed` / `visible` and System diagnostics activate properly. Also fixed `GLib.Variant("(s)", ...)` in `notch-doctor` for PyGObject 3.58.

Build 22 fixed System telemetry (UPower `DisplayDevice` on `Gio.DBus.system`, hex/VPN `/proc/net/route` parsing, 250 ms CPU/Network warmup, `Gio.File` `/proc` fallback, `MemFree+Buffers+Cached` fallback, and `Offline` state).

Build 21 removed Music / MPRIS completely (frontend and backend). Removed the Music tab, MPRIS D-Bus client (`media.js`) and XML interfaces, closed-notch music wings and equalizer, playback/slider widgets, bundled media SVG icons, the `closed-media` schema/preferences key, and the `notch-doctor` MPRIS check. The notch now has three focused pages: **Home**, **Alerts**, and **System**.

Build 20 added **Fedora 45 / GNOME Shell 51 support** (`:orientation` on `St.BoxLayout` with `:vertical` fallback for Shell 46/47, `St.ReducedMotion.REDUCE` support, and Shell 46–51 metadata).

Build 19 tightened the expanded header, corrected the left top flare and added the charging cue.

Build 18 removed Clipboard history and Quick stash / file shelf completely: no tabs, no background helper, no helper D-Bus service, no systemd unit, no CLI, no schema keys and no packaging payload. The installer also cleans up those artifacts from older builds. The remaining UI is built around three pages with a clear typographic hierarchy and layered surfaces.

## Why this is a hybrid application

An ordinary GTK4 window cannot reliably position itself over GNOME’s top panel, remain above fullscreen windows, or reserve work-area space on Wayland. `gtk4-layer-shell` is not a solution on GNOME Mutter, which does not provide the required layer-shell protocol.

Notch therefore uses the same privileged desktop layer as GNOME’s own panel:

```text
┌──────────────────────── GNOME Shell / Mutter (Wayland) ────────────────────────┐
│ GJS + St/Clutter extension                                                    │
│   animated notch • idle clock • notifications • CPU/RAM/network               │
│   UPower battery • Do Not Disturb / Night Light / Dark Mode                    │
└───────────────────────────────────────────────────────────────────────────────┘
                │ session D-Bus (state only)
┌───────────────▼──────────────────┐
│ Python / GTK4 / Libadwaita        │
│ notch-settings                   │
│ native preferences, on demand    │
└──────────────────────────────────┘
```

The notch itself is **not a GTK widget**: it uses GNOME Shell’s native St/Clutter toolkit so it looks and behaves like Shell chrome. Settings use **GTK4/Libadwaita** and run only when opened. There is no always-on Python daemon.

Inspired by [akalikbergenov/cyclop](https://github.com/akalikbergenov/cyclop). No Cyclop Swift code, icons, or other assets are copied. This project is independent and is not affiliated with Cyclop or Apple.

## Features

| Page | Included behavior |
|---|---|
| Home | Large local clock and a quiet date line. Nothing else. |
| Alerts | Ordinary GNOME banners become compact in-notch peeks with native actions; full Alerts page keeps a real card count, compact expandable bodies and dismiss-all. Critical alerts keep the native banner path. Routing respects GNOME DND/app policy and is reversible. |
| System | 2×2 metric tiles: CPU utilization, RAM used/total, UPower battery percentage/state, default-interface download/upload rates. Quick actions: Do Not Disturb, Night Light, Dark Mode. |

Closed notch: idle time sits where the GNOME clock used to be. Plugging in the charger briefly shows a green charging badge. Click a peek or the Alerts tab for the full notification list. Click the notch, hover over it, or press **Super + `** (the key above Tab on a US keyboard). Press Escape or click outside to collapse it.

## Design notes

- **MacBook notch, not a floating Dynamic Island.** The default placement is flush with the top panel, with small outward top flares and larger bottom corners.
- **Typographic hierarchy.** Primary values/titles are large; labels, timestamps and secondary details are smaller and muted. Decorative headings, source icons in empty states, pagers and helper/status clutter were removed.
- **Depth without noise.** Layered dark cards, subtle borders, inset highlights and consistent radii separate content from the black notch body.
- **Adaptive layout is automatic.** The notch uses the actual monitor rectangle and text scale. Three fixed-width tabs show labels at the default size and collapse to a centered icon rail when narrow. Only Alerts scrolls; Home/System are centered natural-height blocks.
- **Work-area reservation is experimental and opt-in.** It reserves the collapsed edge region, not the expanded panel.
- Shell extensions use internal GNOME APIs. Test after every GNOME major upgrade; never bypass version checks by editing metadata blindly.

## Quick start on Fedora 45

### One command — no GitHub page or git clone needed

Run this in your Fedora desktop terminal (as your normal user, **not** with `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/pavit12301611/notch/refs/heads/main/scripts/bootstrap.sh | bash -s -- --with-deps
```

This downloads the complete source snapshot over HTTPS, installs Fedora dependencies, and installs Notch for your user. The dependency step prompts for your sudo password in the terminal. Temporary download files are removed afterwards. By default `bootstrap.sh` tracks `main` (build 23 once merged). To target a specific tag, branch, or commit SHA, set `NOTCH_REF=<ref>` on the `bash` side of the pipe, not only on `curl`.

If you prefer to inspect the bootstrap before running it:

```bash
curl -fsSL https://raw.githubusercontent.com/pavit12301611/notch/refs/heads/main/scripts/bootstrap.sh -o /tmp/notch-bootstrap.sh
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

### Manual dependency installation

```bash
sudo dnf install \
  python3 python3-gobject gtk4 libadwaita glib2 glib2-devel \
  gobject-introspection gnome-shell gnome-extensions-app \
  upower adwaita-icon-theme hicolor-icon-theme make

./install.sh
```

There are no runtime PyPI dependencies (`gobject-introspection` and the GTK/Adwaita typelibs supply the language bindings, and `python3-gobject` supplies PyGObject).

### What the installer changes

Default user installation:

```text
~/.local/share/gnome-shell/extensions/notch@pavit12301611.github.io/
~/.local/share/notch/                         # application code/docs
~/.local/share/glib-2.0/schemas/              # Notch GSettings schema
~/.local/share/applications/                  # Notch Settings desktop entry
~/.local/bin/notch-settings
~/.local/bin/notch-doctor
```

The installer also removes retired build-17-and-older artifacts: `notch-helper`, `notch-shelf`, the Helper D-Bus service, `notch-helper.service`, and the old `helper.py`/`storage.py`/`shelf_cli.py` modules. Existing Notch settings are retained.

### RPM / COPR path

```bash
make rpm
```

The spec installs the extension, schema, settings app, doctor and desktop entry. It does not install a helper daemon, clipboard manager or file shelf. See [packaging/rpm/notch.spec](packaging/rpm/notch.spec).

### Upgrading from Fedora 44 (GNOME 50)

The extension is the same package; only the Shell compatibility range changed. After `dnf system-upgrade`:

```bash
curl -fsSL https://raw.githubusercontent.com/pavit12301611/notch/refs/heads/main/scripts/bootstrap.sh | bash -s --
```

Then log out and back in. `gnome-extensions info notch@pavit12301611.github.io` should report `State: ACTIVE`, not `OUT OF DATE`. Your existing Notch settings (GSettings/dconf) are retained.

## Configuration

Open **Notch Settings** from the app grid, or run `notch-settings`. The extension’s own Preferences dialog (GNOME Extensions → Notch → Settings) exposes the same core schema inline.

| Group | Keys |
|---|---|
| Placement | `placement`, `monitor-index`, `horizontal-offset`, `floating-margin`, `reserve-space` |
| Shape | `collapsed-width`, `collapsed-height`, `expanded-width`, `expanded-height`, `corner-radius`, `adaptive-corners`, `match-panel-height`, `notch-scale`, `opacity` |
| Closed behavior | `replace-panel-clock`, `idle-clock` |
| Notifications | `notifications-in-notch`, `auto-open-notifications`, `peek-duration-ms` |
| Motion | `animations`, `animation-profile`, `open-animation-ms`, `close-animation-ms` |
| Opening/hiding | `open-on-hover`, `hover-delay-ms`, `auto-hide-ms`, `hide-on-fullscreen`, `hide-in-overview` |
| Quick actions | `show-dnd`, `show-night-light`, `show-dark-mode` |
| Shortcut | `toggle-notch` |

## Troubleshooting

```bash
notch-doctor
journalctl -b _COMM=gnome-shell --no-pager -n 300 | grep -E -i 'notch|JS ERROR'
```

- **Extension “does not exist” after install:** log out/in once. GNOME Shell discovers newly installed extensions at session start; enabling alone does not reload code on Wayland.
- **Old helper warnings:** re-run the build-18+ installer. `notch-doctor` reports leftover `notch-helper`/`notch-shelf` artifacts.
- **`State: OUT OF DATE` after upgrading to Fedora 45:** your installed copy predates build 20 and does not declare GNOME Shell 51. Re-run the installer above; do not edit `shell-version` by hand or disable version validation. On Shell 51 a metadata-only spoof loads code that still calls the removed `St.BoxLayout:vertical` property.
- **`No property vertical on StBoxLayout` in the journal:** same cause; update to build 20+, which uses `St.BoxLayout:orientation` on Shell 48–51.
- **Freeze/stutter triage:** capture `pidstat -p "$(pgrep -x gnome-shell | head -n1)" 1` and the journal grep above. Do not assume a static test proves the live issue is fixed.

## Repository layout

```text
extension/            GJS/St Shell extension (overlay, controllers, prefs, schema, D-Bus, icons)
app/notch_app/        Python GTK4/Libadwaita settings + doctor
data/                 launcher/desktop templates
scripts/              remote bootstrap + atomic extension publisher
packaging/rpm/        Fedora RPM spec
tests/                Node model/layout tests, Python project/doctor/installer tests, GJS smoke
docs/                 architecture, security, testing, validation, design study
```

## Development

```bash
npm ci
make stage
make check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/TESTING.md](docs/TESTING.md).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
