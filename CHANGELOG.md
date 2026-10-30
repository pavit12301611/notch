# Changelog

## Unreleased

### Adaptive layout and action reliability

- Fixed Fedora 44 / PyGObject helper startup crash: use `Gio.DBusConnection.register_object/unregister_object`, not nonexistent `*_object_path` methods.
- Fixed `notch-doctor` and companion settings status calls: PyGObject `Variant` results use `unpack()`, not GJS-style `deepUnpack()`.

- Replaced fixed content sizing with monitor-aware geometry and a pure adaptive layout resolver. Header labels collapse to active-only/icon-only before truncating; every page scrolls instead of clipping.
- Added a wrapping, dismissible status bar with actionable helper Retry, replacing clipped raw D-Bus errors.
- Quick actions now keep stable button actors, expose on/off/locked state, and report success/failure instead of silently rebuilding during clicks.
- Shelf helper client has explicit offline/starting/ready states, serialized activation, retry, and friendly activation errors; Copy URI uses a typed GObject value.
- Helper systemd unit no longer depends on a desktop-environment condition; installer resets failed units and imports session environment. `notch-doctor` checks helper service/unit state and can activate the helper.

### MacBook-native redesign v2

- Studied pinned native macOS sources from boring.notch, DynamicNotchKit and NotchDrop; recorded findings and licenses in `docs/DESIGN_STUDY.md`.
- Replaced the rounded-rectangle chrome with a Cairo-flared MacBook silhouette, adaptive 6/14 closed and 19/24 open corners, panel-height closed state and compact music wings.
- Added a top-anchored damped-spring open/close/resize animation with a smooth-easing fallback, per-page sizes and a compact Home page.
- Ordinary notifications now peek inside the notch with native actions instead of forcing the full Alerts page open; critical alerts keep the native banner path.
- Added notch scale, panel-height matching, adaptive corners, closed music wings, motion profile and peek duration settings; migrated untouched earlier presets.

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
