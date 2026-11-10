# Validation log

## Build 22 — 2026-11-10

Scope: fix System page live telemetry (UPower system D-Bus, hex/VPN route parsing, 250 ms CPU/Network warmup, `Gio.File` procfs fallback, offline state).

### Executed in the development sandbox

- `npm run check` (ESLint + Node unit tests) and Python unit tests (`make check-python`).
- `bash -n` on `install.sh`, `uninstall.sh`, `scripts/bootstrap.sh`.
- `node --check` on every extension module; schema/D-Bus XML parse.
- `make stage PREFIX=/usr SYSCONFDIR=/etc` and `git diff --check`.

### Not executed here

- Live GNOME Shell 51 Wayland session checks in `docs/TESTING.md`.
- `glib-compile-schemas` binary compilation, `desktop-file-validate`, GJS smoke test, RPM build (verified in Fedora 45 CI).

## Build 21 — 2026-11-10

Scope: remove all Music / MPRIS functionality from frontend and backend.

### Executed in the development sandbox

- `npm run check` (ESLint + Node unit tests) and Python unit tests (`make check-python`).
- `bash -n` on `install.sh`, `uninstall.sh`, `scripts/bootstrap.sh`.
- `node --check` on every extension module; schema/D-Bus XML parse.
- `make stage PREFIX=/usr SYSCONFDIR=/etc` and `make install` / `make uninstall` with `DESTDIR` staging.
- `git diff --check`.

### Not executed here

- Live GNOME Shell 51 Wayland session checks in `docs/TESTING.md`.
- `glib-compile-schemas` binary compilation, `desktop-file-validate`, GJS smoke test, RPM build (run in Fedora 45 CI).

## Build 20 — 2026-11-06

Scope: Fedora 45 / GNOME Shell 51 compatibility; no design changes.

### Executed in the development sandbox

- `npm run check`: ESLint clean; Node model/layout/St-contract tests **23/23** pass,
  including a strict GNOME Shell 51 `St.BoxLayout` mock that rejects `:vertical`
  and a Shell 46/47 mock that exercises the `:vertical` fallback.
- Python unit tests: project contracts, doctor, atomic extension installer **37/37** pass.
- `bash -n` on `install.sh`, `uninstall.sh`, `scripts/bootstrap.sh`.
- `node --check` on every extension module; schema/D-Bus XML parse.
- `make stage PREFIX=/usr SYSCONFDIR=/etc`.
- `git diff --check`.
- Cross-checked the GNOME Shell 51.0 / Mutter 51.0 sources for the APIs this
  extension touches: `st-box-layout.c` exposes only `:orientation` (and GNOME
  Shell's own `panelBox` constructs it that way), `st-settings.c` keeps
  `enable-animations` and adds `reduced-motion`, `st-icon.c` keeps the same icon
  properties, and the `messageTray` (`_notificationQueue`, `_showNotification`,
  `Urgency`, `getSources`), `dateMenu.container`, `statusArea`, `addChrome`,
  `MonitorsChanged` and `in-fullscreen-changed` APIs used by the overlay are
  unchanged. This is source inspection, not execution.

### Not executed here

- Live GNOME Shell 51 Wayland overlay, input, animation, media, notification,
  charging and lifecycle tests. The reduced-motion path and the Shell 51
  orientation layout need the live acceptance checklist on the target machine.
- `glib-compile-schemas` binary compilation (DTD/XML validation is not a substitute).
- `desktop-file-validate`.
- GJS smoke test.
- RPM build/install.

The Fedora 45 CI recipe (`container: fedora:45`) is configured to run the
missing schema/desktop/GJS/RPM checks when the repository is pushed. The live
desktop acceptance checklist in `docs/TESTING.md` remains mandatory before a
“tested on Fedora 45” claim.

## Build 19 — 2026-11-01

Scope: replace the settings glyph; keep the expanded header inside the notch;
correct the left top flare; restore proportioned closed music wings; add a
sub-two-second plug-in charging cue.

### Executed in the development sandbox

- `npm run check`: ESLint clean; Node model/layout/St-contract tests **21/21** pass,
  including charging-transition and header-width budget regressions.
- Python unit tests: project contracts, doctor, atomic extension installer **36/36** pass.
- `ruff check` and `ruff format --check` on Python sources/tests/installer.
- `bash -n` on `install.sh`, `uninstall.sh`, `scripts/bootstrap.sh`.
- Schema/D-Bus XML parse and `node --check` on every extension module.
- `make stage PREFIX=/usr SYSCONFDIR=/etc`.
- `make install` / `make uninstall` with `DESTDIR` staging, including legacy helper
  cleanup and removal of the installer lock file.
- `git diff --check`.

### Not executed here

- Live GNOME 50 Wayland overlay, input, animation, media, notification, charging
  and lifecycle tests. In particular, the corrected flare, header containment and
  charging badge still need the live acceptance checklist on the target laptop.
- `glib-compile-schemas` binary compilation (DTD/XML validation is not a substitute).
- `desktop-file-validate`.
- GJS smoke test.
- RPM build/install.

The Fedora 44 CI recipe is configured to run the missing schema/desktop/GJS/RPM checks when the repository is pushed. The live desktop acceptance checklist in `docs/TESTING.md` remains mandatory before a “tested on Fedora 44” claim.

---

## Build 18 — 2026-11-01

Scope: remove clipboard history and Quick stash/file shelf from the root; four-page UI overhaul with typographic hierarchy and layered surfaces; retire the helper daemon/CLI/D-Bus/systemd artifacts; keep Home/Music/Alerts/System functional.

### Executed in the development sandbox

- `npm run check`: ESLint clean; Node model/layout/St-contract tests **19/19** pass.
- Python unit tests: project contracts, doctor, atomic extension installer **35/35** pass.
- `ruff check` and `ruff format --check` on Python sources/tests/installer.
- `bash -n` on `install.sh`, `uninstall.sh`, `scripts/bootstrap.sh`.
- Schema XML parse and key-reference checks.
- `make stage PREFIX=/usr SYSCONFDIR=/etc`.
- `make install` / `make uninstall` with `DESTDIR` staging, including legacy helper cleanup.
- `git diff --check`.

### Not executed here

- Live GNOME 50 Wayland overlay, input, animation, media, notification and lifecycle tests.
- `glib-compile-schemas` binary compilation (DTD/XML validation is not a substitute).
- `desktop-file-validate`.
- GJS smoke test.
- RPM build/install.

The Fedora 44 CI recipe is configured to run the missing schema/desktop/GJS/RPM checks when the repository is pushed. The live desktop acceptance checklist in `docs/TESTING.md` remains mandatory before a “tested on Fedora 44” claim.

### Historical notes

Earlier builds added and then removed album art, volume controls, pagination, clipboard history and the file shelf. Build 18 is the first release with no helper process and only four pages. The old design-review PPTX and generator were removed because they described the retired six-page UI.
