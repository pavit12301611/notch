# Contributing

Target Fedora 45 / GNOME 51 first; the same build must keep working on GNOME Shell 46-51. Keep the Shell overlay in GJS/St/Clutter and the settings/doctor companions in Python/GTK4/Libadwaita. Do not import GTK into GNOME Shell.

1. Install the complete project, not just the extension directory.
2. Run `npm ci`, `make stage`, `make check`.
3. Add pure model tests for parsing/bounds and Python contract tests for installer/doctor behavior.
4. Run the live checklist in `docs/TESTING.md` for changes to input, placement, media, notifications or lifecycle.
5. Verify disable/re-enable leaves no timers, signal handlers, bus names, injections or actors behind.
6. Keep user-visible errors actionable and never log notification bodies or private file paths routinely.
7. Do not reintroduce clipboard history, a file shelf, a helper daemon or pagination. Build 18 removed them intentionally.

Use four-space indentation in JavaScript and PEP 8 conventions in Python. Keep commit messages imperative. Do not add runtime npm/PyPI dependencies for functionality already provided by GNOME platform libraries.
