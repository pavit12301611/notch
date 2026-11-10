# Security and privacy

## Trust model

GNOME Shell extensions execute with the user’s full Shell privileges. Installing an extension is equivalent to trusting its code, not installing a sandboxed app. Review updates before enabling them. The Python settings/doctor companions are normal user processes, not Flatpak sandboxes.

## Removed features

Build 18 removed clipboard history and the file shelf completely; build 21 removed all music and MPRIS media features. Notch no longer reads the system clipboard, stores copied text, accepts file drops, keeps file references, talks to MPRIS media players, or runs a helper daemon. The installer removes the old helper binary, CLI, D-Bus service, systemd unit and Python modules from older builds.

## Notifications

Notch intercepts ordinary GNOME banners only after GNOME has applied DND, fullscreen and per-app policy. Notification bodies are rendered as plain text in the notch and remain in GNOME’s own message list. Critical notifications keep the native banner path. Routine logs do not include notification bodies.

## Diagnostics

System metrics are read from local procfs and UPower. There is no telemetry, update checker, account system, MPRIS integration, or outbound network request in the extension.

## Session bus

The extension exports a private session-bus interface for the same user (`Toggle`, `SetExpanded`, `GetState`). It is an implementation API, not a hardened boundary between mutually untrusted applications running as the same UID. It accepts no shell command strings and no file paths.

## Reporting

Open a private security advisory on the project’s GitHub repository if enabled, or contact the maintainers through a private channel before publishing exploitable details. Do not include tokens, private notification bodies or private file paths in public bug reports.
