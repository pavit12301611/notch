# Security and privacy notes

## Trust model

GNOME Shell extensions execute with the user’s full Shell privileges. Installing an extension is equivalent to trusting its code, not installing a sandboxed app. Review updates before enabling them. The Python helper is also a normal user process, not a Flatpak sandbox.

## Clipboard

- History is disabled by default.
- Only plain-text offers are considered; unknown/mixed MIME offers are skipped.
- Known password/concealment/privacy hints cause the offer to be skipped.
- Transfers are bounded to 64 KiB plus an overflow-detection byte; history is limited to 5–50 entries.
- History is RAM-only and cleared on lock, disable and destruction.
- Routine logs never include clipboard content.

**Limitation:** a source can expose a secret as ordinary text without a hint. No clipboard manager can reliably infer that it is a password. Keep history off for sensitive work. Clearing history does not erase the current system clipboard or data already pasted elsewhere.

## File shelf

- Stores local `file://` references and display names in `${XDG_STATE_HOME:-~/.local/state}/notch/shelf.json`.
- Directory creation uses mode 0700; atomic replacement files use 0600.
- Does not scan the filesystem, copy contents, move originals or delete originals.
- Remote URIs, command strings and non-file schemes are rejected.
- Open/Reveal/Copy/Remove operate only on a URI already present in the shelf.
- A corrupt or unsupported store is not silently overwritten.
- The file chooser uses GTK/desktop portals where available.

Reference paths can themselves be sensitive. Protect the user account and backups accordingly. Uninstall retains the reference list by default.

## Network

The only intentional outbound requests are album-art HTTP(S) URLs supplied by the active MPRIS player, when remote art is enabled. Art responses are limited to 2 MiB, raster image content types and a 10-second session timeout. Redirects are disabled to avoid silently following an art URL to another host. There is no telemetry, update checker, account system or clipboard upload.

A malicious local MPRIS player can supply an art URL pointing at a private network address. Disable remote art if you do not trust local media clients. The extension does not forward cookies or authorization headers.

## D-Bus

The extension and helper export session-bus interfaces for the same user. They are private implementation APIs, not hardened boundaries between mutually untrusted applications running as the same UID. The helper never accepts shell command strings; arguments are typed URIs/coordinates and URIs must already belong to the shelf for open/reveal/copy/remove operations.

## Reporting issues

Open a private security advisory on the project’s GitHub repository if enabled, or contact the maintainers through a private channel before publishing exploitable details. Do not include real clipboard histories, shelf lists, tokens or private file paths in public bug reports.
