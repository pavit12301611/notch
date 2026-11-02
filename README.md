# Notch for GNOME

A Cyclop-inspired, expandable **MacBook-style top-edge notch** for **Fedora 44 Workstation / GNOME Wayland**: idle clock, in-notch notifications, MPRIS media controls, live system status and GNOME quick actions.

**Version target:** Fedora 44 ships GNOME **50**. The extension declares Shell 46–50 compatibility, but **GNOME 50 is the primary release target**; older versions need their own live desktop validation.

> Status: working source, tests and packaging recipes. The repository was developed in a non-GNOME Linux sandbox. **A live Fedora 44/GNOME 50 session is still required for the acceptance checklist in [docs/TESTING.md](docs/TESTING.md). Do not interpret static checks as a live desktop certification.** See [docs/VALIDATION.md](docs/VALIDATION.md) for the exact local checks.

## What changed in build 21

- Remove Timer / Pomodoro completely: no UI, countdown, preferences or schema keys.
- Move Calendar out of Home into its **own optional tab**. Home is clock/date only.
- Redesign Calendar with a layered card, prominent month/year, Today and previous/
  next controls, a six-week grid, muted adjacent-month dates, selected-date detail
  and distinct today/selected treatments. Click any date to browse it.
- Keyboard: arrows move by day/week, Page Up/Down by month, Home returns to today.
  The date grid uses one tab stop; Escape still closes the notch.
- The header budgets either four or five tabs; at normal five-tab widths labels
  are text-only, switching to icons when narrow/large-text. Calendar can scroll
  vertically without displacing the fixed header.

## Optional features

Six opt-in additions, with independent switches in **Notch Settings → Features**
(and the GNOME Extensions preferences). All switches default **off**, preserving
existing behavior. Calendar adds a fifth tab only when enabled; no background daemon.

| Addition | Behavior / switch |
|---|---|
| Volume & brightness | Separate switches. Read-only level + percentage in the notch; native OSD fallback when hidden/locked/peeking, on other monitors, or for unrecognized OSDs. No duplicate OSD on the notch monitor. |
| Notification privacy | Redacts titles, bodies and native action labels in notch peeks **and** Alerts, including accessible text. GNOME's own list, native/critical banners and source app names are unchanged. This is not automatic screen-share detection. |
| Bluetooth battery | System lists connected devices exposing BlueZ Battery1 data. Brief connection cue; unsupported/unavailable devices degrade gracefully. No polling or pairing controls. |
| Calendar tab | Independent Calendar tab with month navigation, Today, date selection, adjacent-month dates and keyboard navigation. Turning its switch off hides the tab and returns an active Calendar to Home. No events/accounts integration. |
| Per-app peeks | Installed-app switches plus a comma-separated app-ID/source-name list. Selected apps remain in Alerts without peeks; GNOME DND/per-app policy is never bypassed. Requires notch notification routing; native critical alerts remain native. |
| Music polish | Overflowing-title scrolling (visible Music page only, respects reduced motion) and direct player selection. **Local album artwork has its own additional switch**; HTTP artwork is never downloaded. |

Calendar and optional Music/System content can scroll when needed. Switching a
feature off stops its BlueZ watch, title animation, pending artwork load or OSD
hook as applicable. Timer/Pomodoro settings from build 20 are no longer used.

Install this checkout with `./install.sh`, or use the development-branch bootstrap
below, then log out/in.

## What changed in build 19

- Settings uses a sliders icon instead of the old sun-like glyph.
- The expanded header is budgeted: tabs, settings and close stay inside the notch at narrow widths and large text scaling.
- The left top flare was corrected, removing the stray rectangle outside the notch.
- Closed music wings are back with proportional, centered equalizer bars.
- Plugging in the charger shows a brief green “Charging · NN%” cue in the closed notch (under two seconds).

Build 18 removed Clipboard history and Quick stash / file shelf completely: no tabs, no background helper, no helper D-Bus service, no systemd unit, no CLI, no schema keys and no packaging payload. The installer also cleans up those artifacts from older builds. The base UI is built around four pages (plus the optional Calendar tab) with a clear typographic hierarchy and layered surfaces.

## Why this is a hybrid application

An ordinary GTK4 window cannot reliably position itself over GNOME’s top panel, remain above fullscreen windows, or reserve work-area space on Wayland. `gtk4-layer-shell` is not a solution on GNOME Mutter, which does not provide the required layer-shell protocol.

Notch therefore uses the same privileged desktop layer as GNOME’s own panel:

```text
┌──────────────────────── GNOME Shell / Mutter (Wayland) ────────────────────────┐
│ GJS + St/Clutter extension                                                    │
│   animated notch • idle clock • MPRIS • notifications • CPU/RAM/network        │
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
| Home | Large local clock and quiet date line. |
| Calendar (optional) | Dedicated month browser with date selection, Today, keyboard navigation and a responsive grid. |
| Music | MPRIS player discovery/switching, text-first title/artist, previous/play/pause/next and seek. No volume controls; optional local artwork and music polish. |
| Alerts | Ordinary GNOME banners become compact in-notch peeks with native actions; full Alerts page keeps a real card count, compact expandable bodies and dismiss-all. Critical alerts keep the native banner path. Routing respects GNOME DND/app policy and is reversible. |
| System | 2×2 metric tiles: CPU utilization, RAM used/total, UPower battery percentage/state, default-interface download/upload rates. Quick actions: Do Not Disturb, Night Light, Dark Mode. |

Closed notch: idle time sits where the GNOME clock used to be; music grows small closed-state wings with a rhythmic animated equalizer. Plugging in the charger briefly shows a green charging badge. Click a peek or the Alerts tab for the full notification list. Click the notch, hover over it, or press **Super + `** (the key above Tab on a US keyboard). Press Escape or click outside to collapse it.

## Design notes

- **MacBook notch, not a floating Dynamic Island.** The default placement is flush with the top panel, with small outward top flares and larger bottom corners.
- **Typographic hierarchy.** Primary values/titles are large; labels, timestamps and secondary details are smaller and muted. Decorative headings, source icons in empty states, album art, volume sliders, pagers and helper/status clutter were removed.
- **Depth without noise.** Layered dark cards, subtle borders, inset highlights and consistent radii separate content from the black notch body.
- **Adaptive layout is automatic.** The notch uses the actual monitor rectangle and text scale. Four base tabs plus an optional Calendar tab fit a budgeted header: text-only labels for five tabs at normal widths, icons when narrow. Alerts and Calendar scroll; optional Music/System content can overflow vertically. Home remains a simple centered clock/date.
- **Work-area reservation is experimental and opt-in.** It reserves the collapsed edge region, not the expanded panel.
- **MPRIS capabilities vary.** Seek requires a player exposing `CanSeek`, a track length, and a usable position/track ID. Firefox must have MPRIS/media-key integration enabled. A player that does not implement a capability cannot be forced to support it.
- Shell extensions use internal GNOME APIs. Test after every GNOME major upgrade; never bypass version checks by editing metadata blindly.

## Quick start on Fedora 44

### One command — no GitHub page or git clone needed

Run this in your Fedora desktop terminal (as your normal user, **not** with `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/pavit12301611/notch/refs/heads/arena/bf1fc204-notch/scripts/bootstrap.sh | NOTCH_REF=arena/bf1fc204-notch bash -s -- --with-deps
```

This downloads the complete source snapshot over HTTPS, installs Fedora dependencies, and installs Notch for your user. The dependency step prompts for your sudo password in the terminal. Temporary download files are removed afterwards. The command tracks the `arena/bf1fc204-notch` development branch (build 21). `NOTCH_REF` must be set on the `bash` side of the pipe, not only on `curl`. For a reproducible install, set it to a full commit SHA. After this branch is merged, the same command can use `main` on both sides.

If you prefer to inspect the bootstrap before running it:

```bash
curl -fsSL https://raw.githubusercontent.com/pavit12301611/notch/refs/heads/arena/bf1fc204-notch/scripts/bootstrap.sh -o /tmp/notch-bootstrap.sh
less /tmp/notch-bootstrap.sh
NOTCH_REF=arena/bf1fc204-notch bash /tmp/notch-bootstrap.sh --with-deps
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

There is **no package named `mpris` to install**. MPRIS is a D-Bus specification implemented by media players. Notch talks to it through Gio. `gobject-introspection` and the GTK/Adwaita typelibs supply the language bindings; `python3-gobject` supplies PyGObject. There are no runtime PyPI dependencies.

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

## Configuration

Open **Notch Settings** from the app grid, or run `notch-settings`. The extension’s own Preferences dialog (GNOME Extensions → Notch → Settings) exposes the same core schema inline.

| Group | Keys |
|---|---|
| Placement | `placement`, `monitor-index`, `horizontal-offset`, `floating-margin`, `reserve-space` |
| Shape | `collapsed-width`, `collapsed-height`, `expanded-width`, `expanded-height`, `corner-radius`, `adaptive-corners`, `match-panel-height`, `notch-scale`, `opacity` |
| Closed behavior | `replace-panel-clock`, `idle-clock`, `closed-media` |
| Notifications | `notifications-in-notch`, `auto-open-notifications`, `peek-duration-ms` |
| Motion | `animations`, `animation-profile`, `open-animation-ms`, `close-animation-ms` |
| Opening/hiding | `open-on-hover`, `hover-delay-ms`, `auto-hide-ms`, `hide-on-fullscreen`, `hide-in-overview` |
| Quick actions | `show-dnd`, `show-night-light`, `show-dark-mode` |
| Optional switches | `volume-indicator`, `brightness-indicator`, `notification-privacy`, `bluetooth-battery`, `calendar-enabled`, `per-app-peeks`, `music-polish`, `media-art` |
| Feature options | `peek-blocked-apps` |
| Shortcut | `toggle-notch` |

## Troubleshooting

```bash
notch-doctor
journalctl -b _COMM=gnome-shell --no-pager -n 300 | grep -E -i 'notch|JS ERROR'
```

- **Extension “does not exist” after install:** log out/in once. GNOME Shell discovers newly installed extensions at session start; enabling alone does not reload code on Wayland.
- **Old helper warnings:** re-run the build-18 installer. `notch-doctor` reports leftover `notch-helper`/`notch-shelf` artifacts.
- **Music controls disabled:** the player does not expose that MPRIS capability, or no player is connected.
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
