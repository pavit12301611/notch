# Validation log

## Build 20 — 2026-11-02

Scope: opt-in timer/Pomodoro, volume and brightness OSD routing, notification
privacy, Bluetooth battery, mini calendar, per-app peeks and music polish with
separate local-art opt-in. All additions default off; no new tabs or daemon.

### Executed in the development sandbox

- `npm ci` and `npm run check`: ESLint clean; **38/38 Node tests pass**.
  Includes pure countdown/calendar/privacy/app-filter/BlueZ/geometry regressions
  and mocked controller tests for timer cleanup, OSD fallback/restoration,
  calendar opt-in, BlueZ startup/cancellation, visible-only music motion,
  direct player selection and local artwork rejection/cancellation.
- `make stage check-python`: Python compilation and **37/37 tests pass**, including
  schema/default-off switches and parity between both preference UIs.
- `ruff check app tests scripts` and `ruff format --check app tests scripts` pass.
- `node --check` on every extension module and `bash -n` on installer,
  uninstaller and bootstrap pass.
- Schema and D-Bus XML parse through Python project tests.
- `make install` / `make uninstall` with `DESTDIR` staging; verified all four
  optional-feature modules are included in the published extension payload.
- `git diff --check` passes.

### Not executed here

- No GNOME Shell/GJS compositor, Bluetooth hardware or live MPRIS players are
  available. **Mocked controller tests do not certify desktop behavior.** Follow
  the new build-20 checklist in `docs/TESTING.md` on Fedora 44/GNOME 50 Wayland.
- `glib-compile-schemas` and `desktop-file-validate` are unavailable. XML parsing
  is not schema bytecode compilation; the full `make check` target, GJS smoke
  and RPM validation remain for the Fedora environment/CI.
- No real visual/input/large-text/accessibility validation has been performed.
  Native GNOME internals used by OSD/banner routing still require live testing.

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
