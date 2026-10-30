#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE=user
WITH_DEPS=false
ENABLE=true
for arg in "$@"; do
  case "$arg" in
    --user) MODE=user ;;
    --system) MODE=system ;;
    --with-deps) WITH_DEPS=true ;;
    --no-enable) ENABLE=false ;;
    -h|--help) echo "Usage: ./install.sh [--user|--system] [--with-deps] [--no-enable]"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
if [[ $MODE == system && $EUID -ne 0 ]]; then
  echo "--system must be run as root: sudo ./install.sh --system" >&2
  exit 1
fi
if $WITH_DEPS; then
  command -v dnf >/dev/null || { echo "Automatic dependency installation requires Fedora/dnf." >&2; exit 1; }
  SUDO=()
  [[ $EUID -ne 0 ]] && SUDO=(sudo)
  "${SUDO[@]}" dnf install -y python3 python3-gobject gtk4 libadwaita glib2 glib2-devel \
    gobject-introspection gnome-shell gnome-extensions-app upower libsoup3 \
    adwaita-icon-theme hicolor-icon-theme xdg-desktop-portal-gnome make
fi
for command in make glib-compile-schemas; do
  command -v "$command" >/dev/null || { echo "Missing $command. Run ./install.sh --with-deps on Fedora." >&2; exit 1; }
done
[[ -x /usr/bin/python3 ]] || { echo "Missing /usr/bin/python3 (python3 package)." >&2; exit 1; }
/usr/bin/python3 - <<'PY'
import gi
for namespace, version in [('Gio','2.0'), ('Gtk','4.0'), ('Adw','1'), ('Soup','3.0')]:
    try:
        gi.require_version(namespace, version)
    except (ValueError, ImportError) as exc:
        raise SystemExit(f'Missing {namespace} {version}. Run ./install.sh --with-deps on Fedora.\n{exc}')
PY
UUID='notch@pavit12301611.github.io'
if [[ $MODE == user ]]; then
  PREFIX="$HOME/.local"; SYSCONFDIR="${XDG_CONFIG_HOME:-$HOME/.config}"
  # Stop an old instance before replacing its files. Settings and shelf data are retained.
  if $ENABLE && command -v gnome-extensions >/dev/null && [[ -n ${DBUS_SESSION_BUS_ADDRESS:-} ]]; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
    systemctl --user stop notch-helper.service 2>/dev/null || true
  fi
  make -C "$ROOT" install PREFIX="$PREFIX" SYSCONFDIR="$SYSCONFDIR"
else
  PREFIX=/usr; SYSCONFDIR=/etc
  make -C "$ROOT" install PREFIX="$PREFIX" SYSCONFDIR="$SYSCONFDIR"
fi
if $ENABLE && [[ $MODE == user ]]; then
  if [[ -n ${DBUS_SESSION_BUS_ADDRESS:-} || -S ${XDG_RUNTIME_DIR:-/run/user/$UID}/bus ]]; then
    systemctl --user daemon-reload
    systemctl --user import-environment DISPLAY WAYLAND_DISPLAY XDG_CURRENT_DESKTOP XDG_SESSION_TYPE XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS 2>/dev/null || true
    systemctl --user reset-failed notch-helper.service 2>/dev/null || true
    systemctl --user enable notch-helper.service
    systemctl --user restart notch-helper.service || echo "Helper will start on first use; if Shelf stays offline run: journalctl --user -u notch-helper.service -b"
    gnome-extensions enable "$UUID" 2>/dev/null || echo "Extension will be discovered after you log out and back in."
  fi
fi
cat <<EOF

Notch files installed ($MODE).
IMPORTANT: log out and back in on Wayland to load/reload Shell extension code.
Then run: gnome-extensions enable $UUID
Open settings: $PREFIX/bin/notch-settings
Check installation: $PREFIX/bin/notch-doctor
Add files without drag-and-drop: $PREFIX/bin/notch-shelf add ~/Downloads/example.pdf
Toggle: Super + \` (or click the notch).
EOF
