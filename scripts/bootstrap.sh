#!/usr/bin/env bash
# Download a complete Notch source snapshot and run its user installer.
# Usage: curl -fsSL <raw-script-url> | bash -s -- --with-deps
# Override the downloaded ref with NOTCH_REF=<branch-tag-or-commit>.
set -euo pipefail

REF="${NOTCH_REF:-main}"
REPO='pavit12301611/notch'

if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
  cat <<'EOF'
Notch remote installer for Fedora 44 / GNOME Wayland.

Usage: bash bootstrap.sh [--with-deps] [--no-enable] [--user]
  --with-deps   Install Fedora dependencies using sudo/dnf.
  --no-enable   Install without enabling the extension or helper.
  --user        Install for the current user (the default).

Environment:
  NOTCH_REF     Branch name, refs/tags/<tag>, or commit SHA.
                Default: main

Example:
  curl -fsSL https://raw.githubusercontent.com/pavit12301611/notch/refs/heads/main/scripts/bootstrap.sh | bash -s -- --with-deps

After installation, log out and back in. Settings and shelf data are retained.
Do not run this script with sudo; the dependency step requests sudo itself.
EOF
  exit 0
fi

if [[ $EUID -eq 0 ]]; then
  echo 'Run the Notch installer as your desktop user, not root/sudo.' >&2
  exit 1
fi
if [[ ! $REF =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ || $REF == *'..'* || $REF == *'//'* || $REF == */ || $REF == *.lock ]]; then
  echo 'Invalid NOTCH_REF: use a branch, tag or commit name.' >&2
  exit 2
fi
for tool in curl tar mktemp; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required command: $tool" >&2; exit 1; }
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/notch-install.XXXXXXXX")"
cleanup() { rm -rf -- "$TMP"; }
trap cleanup EXIT
# Also clean up on terminal hangup or an interrupting signal.
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

ARCHIVE="$TMP/source.tar.gz"
SOURCE="$TMP/source"
mkdir -p "$SOURCE"
case "$REF" in
  refs/*) ARCHIVE_REF="$REF" ;;
  *)
    if [[ $REF =~ ^[0-9a-fA-F]{40}$ ]]; then
      ARCHIVE_REF="$REF"
    else
      ARCHIVE_REF="refs/heads/$REF"
    fi
    ;;
esac
printf 'Downloading Notch (%s) from GitHub…\n' "$REF"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
  -fL --retry 3 --connect-timeout 15 \
  "https://codeload.github.com/$REPO/tar.gz/$ARCHIVE_REF" -o "$ARCHIVE"

# GitHub source archives have one top-level directory. Never extract into $HOME.
tar --no-same-owner --no-same-permissions -xzf "$ARCHIVE" -C "$SOURCE" --strip-components=1
if [[ ! -f "$SOURCE/install.sh" || ! -f "$SOURCE/extension/metadata.json" ]]; then
  echo 'Downloaded archive does not contain the complete Notch project.' >&2
  exit 1
fi

printf '\nInstalling Notch for the current user. Dependencies may prompt for sudo.\n'
bash "$SOURCE/install.sh" "$@"
printf '\nDone. Log out and back in, then open Notch Settings or run notch-doctor.\n'
