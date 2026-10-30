# Changelog

## Unreleased

- MacBook-style top-edge notch defaults: replaces the centered top-bar clock, shows idle local time, and expands smoothly from the top edge with configurable open/close durations.
- GNOME notification banners are routed into an Alerts page with native actions, unread count, calendar shortcut and dismiss-all; routing is reversible and restores native banners on disable/hide.
- Added a MacBook preset in both Libadwaita settings UIs and a safe migration for untouched 0.1 defaults.

## 0.1.0 — 2026-10-29

- Initial hybrid GNOME Shell extension + GTK4/Libadwaita companion project.
- MPRIS media, gated system diagnostics, quick toggles, opt-in RAM clipboard history.
- GTK file-drop helper and atomic local-reference shelf.
- User installer, systemd/D-Bus activation, RPM recipe and Fedora CI recipe.
- Pure logic/storage tests and an explicit live Fedora acceptance checklist.

Primary target: Fedora 44 / GNOME 50. Live desktop validation is pending.
