# Security and privacy

## Trust model

GNOME Shell extensions execute with the user’s full Shell privileges. Installing an extension is equivalent to trusting its code, not installing a sandboxed app. Review updates before enabling them. The Python settings/doctor companions are normal user processes, not Flatpak sandboxes.

## Removed features

Build 18 removes clipboard history and the file shelf completely. Notch no longer reads the system clipboard, stores copied text, accepts file drops, keeps file references, or runs a helper daemon. The installer removes the old helper binary, CLI, D-Bus service, systemd unit and Python modules from older builds.

## Notifications

Notch intercepts ordinary GNOME banners only after GNOME has applied DND, fullscreen and per-app policy. Notification bodies are rendered as plain text in the notch and remain in GNOME’s own message list. Critical notifications keep the native banner path. Routine logs do not include notification bodies.

The optional privacy switch redacts notch peeks and Alerts, including accessible
text and native action labels; it never changes GNOME's original notification
objects/list or native (including critical) banners. App names remain visible.
It is a manual switch, not screen-sharing detection. Per-app filtering suppresses
only notch peeks; notifications remain stored, and GNOME DND/app policy is not
bypassed. This does not mute native notification sounds.

## Media and diagnostics

The Music page talks to local MPRIS players over the session bus. It does not download remote artwork or write volume. An independent, default-off
artwork switch permits local raster file artwork (regular files, no symlinks, no
URI authority, no SVG, at most 10 MiB); pending queries are cancelled when disabled.
As with other Shell content, image decoding is not sandboxed. Do not enable
untrusted media players. The volume/brightness indicators only observe native
OSD dispatch; they do not change system levels. System metrics are read from local procfs and UPower. Optional Bluetooth battery monitoring reads BlueZ device aliases/connection and battery state over the system bus, without polling or pairing. Turning it off cancels its client. There is no telemetry, update checker, account system or outbound network request in the extension.

## Session bus

The extension exports a private session-bus interface for the same user (`Toggle`, `SetExpanded`, `GetState`). It is an implementation API, not a hardened boundary between mutually untrusted applications running as the same UID. It accepts no shell command strings and no file paths.

## Reporting

Open a private security advisory on the project’s GitHub repository if enabled, or contact the maintainers through a private channel before publishing exploitable details. Do not include tokens, private notification bodies or private file paths in public bug reports.
