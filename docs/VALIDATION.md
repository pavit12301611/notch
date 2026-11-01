# Validation record — 2026-10-30

## Environment used for repository development

- Debian 12 sandbox, Node.js 22, Python 3.11.
- No GNOME Shell, PyGObject, GTK4 runtime, GJS, `glib-compile-schemas`, `desktop-file-validate` or `rpmbuild` available in the sandbox.

## Checks executed successfully

- ESLint over extension and JavaScript tests.
- Node model/geometry/layout/spring/notification-bridge/St-widget contract suite: **22 passed**.
- Python compilation and unittest suite: **50 passed**.
- Atomic extension publication tests: fresh install, upgrade/stale-file removal, invalid-source rollback, interrupted-transaction recovery and Makefile/installer wiring.
- Doctor Shell-registration tests: undiscovered extension, active build, D-Bus double build numbers, load errors and stale session registration.
- Ruff lint and formatting checks.
- GSettings XML validated against GNOME GLib’s `gschema.dtd`.
- Bash syntax checks for `install.sh`, `uninstall.sh` and `scripts/bootstrap.sh`.
- Remote bootstrap help and invalid-ref rejection checks (no network needed).
- Regression check for the separate GNOME Extensions prefs resource import path.
- Regression check that extension preferences are inline Libadwaita pages, not a launcher placeholder.
- Regression check that St.BoxLayout spacing uses St CSS, not a nonexistent GObject property.
- Strict St.Icon constructor/write tests against the GNOME 50.6 property contract, including artwork source switching.
- Doctor tests for loaded-vs-installed extension build detection.
- v9 drop-target geometry tests: closed-notch coverage, placement, HiDPI and monitor clamping.
- Helper drop tests with stubbed GIO/GTK contracts: file-list and URI-list drops, reference-only stash, completion/failure signals, target reset/clamping, window reuse and helper info.
- Doctor helper-build/storage checks and nested MPRIS variant/title tests.
- MacBook v2 default/schema checks, spring convergence/retargeting tests and reversible notification-bridge tests.
- GNOME 46/50 source compatibility check for `InjectionManager` and the message-tray banner queue path.
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
