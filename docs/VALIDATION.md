# Validation record — 2026-10-29

## Environment used for repository development

- Debian 12 sandbox, Node.js 22, Python 3.11.
- No GNOME Shell, PyGObject, GTK4 runtime, GJS, `glib-compile-schemas`, `desktop-file-validate` or `rpmbuild` available in the sandbox.

## Checks executed successfully

- ESLint over extension and JavaScript tests.
- Node model/geometry suite: **7 passed**.
- Python compilation and unittest suite: **13 passed**.
- Ruff lint and formatting checks.
- GSettings XML validated against GNOME GLib’s `gschema.dtd`.
- Bash syntax checks for `install.sh`, `uninstall.sh` and `scripts/bootstrap.sh`.
- Remote bootstrap help and invalid-ref rejection checks (no network needed).
- Regression check for the separate GNOME Extensions prefs resource import path.
- Staged `make install` / `make uninstall` with `/usr` prefix, including the RPM user-unit directory override.
- Source distribution creation and archive listing.
- `git diff --check`.

## Not executed here

- Live GNOME 50 Wayland overlay, input, animation, media, drag-and-drop and lifecycle tests.
- `glib-compile-schemas` binary compilation (DTD validation is not a substitute).
- `desktop-file-validate`.
- GJS smoke test.
- RPM build/install.

The Fedora 44 CI recipe is configured to run the missing schema/desktop/GJS/RPM checks when the repository is pushed. The live desktop acceptance checklist remains mandatory before a “tested on Fedora 44” claim.
