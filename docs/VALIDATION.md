# Validation log

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
