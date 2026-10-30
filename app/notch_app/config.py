from __future__ import annotations

import os
from pathlib import Path

APP_ID = "io.github.pavit12301611.Notch"
HELPER_ID = f"{APP_ID}.Helper"
EXTENSION_ID = f"{APP_ID}.Extension"
OBJECT_PATH = "/io/github/pavit12301611/Notch"
HELPER_PATH = f"{OBJECT_PATH}/Shelf"  # separate from the GApplication's own object path
UUID = "notch@pavit12301611.github.io"
DROP_TITLE = "Notch file drop target"
MAX_ITEMS = 100
MAX_URI_LENGTH = 8192


def extension_dir() -> Path:
    override = os.environ.get("NOTCH_EXTENSION_DIR")
    if override:
        return Path(override)
    data_home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    candidates = [data_home / "gnome-shell/extensions" / UUID]
    candidates += [
        Path(p) / "gnome-shell/extensions" / UUID
        for p in os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share").split(":")
        if p
    ]
    candidates.append(Path(__file__).resolve().parents[2] / "extension")
    return next((p for p in candidates if (p / "metadata.json").is_file()), candidates[0])


def interface_xml(filename: str) -> str:
    return (extension_dir() / "dbus" / filename).read_text(encoding="utf-8")


def state_dir() -> Path:
    root = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state"))
    return root / "notch"
