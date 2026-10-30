#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE=user
for arg in "$@"; do
  case "$arg" in
    --user) MODE=user ;;
    --system) MODE=system ;;
    -h|--help) echo "Usage: ./uninstall.sh [--user|--system]"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
if [[ $MODE == system ]]; then
  [[ $EUID -eq 0 ]] || { echo "Run sudo ./uninstall.sh --system" >&2; exit 1; }
  make -C "$ROOT" uninstall PREFIX=/usr SYSCONFDIR=/etc
else
  UUID='notch@pavit12301611.github.io'
  if command -v gnome-extensions >/dev/null; then gnome-extensions disable "$UUID" 2>/dev/null || true; fi
  systemctl --user disable --now notch-helper.service 2>/dev/null || true
  make -C "$ROOT" uninstall PREFIX="$HOME/.local" SYSCONFDIR="${XDG_CONFIG_HOME:-$HOME/.config}"
  systemctl --user daemon-reload 2>/dev/null || true
fi
cat <<'EOF'
Notch removed. Log out and back in to unload the Shell module completely.
Settings and shelf references were retained. To remove them explicitly:
  dconf reset -f /io/github/pavit12301611/Notch/
  rm -f "${XDG_STATE_HOME:-$HOME/.local/state}/notch/shelf.json"
EOF
