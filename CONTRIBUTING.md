# Contributing

Target Fedora 44 / GNOME 50 first. Keep the Shell overlay in GJS/St/Clutter and the companion UI in Python/GTK4/Libadwaita. Do not import GTK into GNOME Shell.

1. Install the complete project, not just the extension directory.
2. Run `npm ci`, `make stage`, `make check`.
3. Add pure model tests for parsing/bounds and Python storage tests for filesystem behavior.
4. Run the live checklist in `docs/TESTING.md` for changes to input, placement, media or lifecycle.
5. Verify disable/re-enable leaves no timers, signal handlers, bus names or actors behind.
6. Keep user-visible errors actionable and never log clipboard text or shelf URIs routinely.

Use four-space indentation in JavaScript and PEP 8 conventions in Python. Keep commit messages imperative. Do not add runtime npm/PyPI dependencies for functionality already provided by GNOME platform libraries.
