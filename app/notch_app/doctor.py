from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess

from .config import APP_ID, EXTENSION_ID, HELPER_ID, HELPER_PATH, OBJECT_PATH, extension_dir


def inspect_project() -> list[tuple[str, str, str]]:
    results = []

    def check(level, name, detail):
        results.append((level, name, detail))

    try:
        release = platform.freedesktop_os_release()
        check(
            "PASS" if release.get("ID") == "fedora" else "WARN",
            "Operating system",
            release.get("PRETTY_NAME", "Unknown"),
        )
        if release.get("ID") == "fedora" and release.get("VERSION_ID") != "44":
            check("WARN", "Fedora release", "This release targets Fedora 44 / GNOME 50")
    except OSError:
        check("WARN", "Operating system", "No os-release file")
    session = os.environ.get("XDG_CURRENT_DESKTOP", "")
    session_type = os.environ.get("XDG_SESSION_TYPE", "")
    check(
        "PASS" if "GNOME" in session and session_type == "wayland" else "WARN",
        "Desktop session",
        f"{session or 'unknown'} / {session_type or 'unknown'} (target: GNOME Wayland)",
    )
    shell = shutil.which("gnome-shell")
    version = ""
    if shell:
        try:
            version = subprocess.run(
                [shell, "--version"], capture_output=True, text=True, timeout=5, check=False
            ).stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
    major = re.search(r"(\d+)(?:\.\d+)*\s*$", version)
    shell_ok = bool(major and int(major.group(1)) == 50)
    check(
        "PASS" if shell_ok else "WARN",
        "GNOME Shell",
        version or "Not installed; 46–50 metadata compatibility, primary target 50",
    )
    directory = extension_dir()
    metadata_file = directory / "metadata.json"
    try:
        metadata = json.loads(metadata_file.read_text())
        check("PASS", "Extension files", str(directory))
        check("PASS", "Extension UUID", metadata["uuid"])
    except (OSError, ValueError, KeyError) as exc:
        check("FAIL", "Extension files", f"{metadata_file}: {exc}")
    try:
        import gi

        check("PASS", "PyGObject", gi.__version__)
        for namespace, ver in [("Gio", "2.0"), ("Gtk", "4.0"), ("Adw", "1"), ("Soup", "3.0")]:
            try:
                gi.require_version(namespace, ver)
                check("PASS", f"Typelib {namespace}", ver)
            except (ValueError, ImportError) as exc:
                check("FAIL", f"Typelib {namespace}", str(exc))
    except ImportError:
        check("FAIL", "PyGObject", "Install python3-gobject")
    try:
        import gi

        gi.require_version("Gio", "2.0")
        from gi.repository import Gio

        source = Gio.SettingsSchemaSource.get_default()
        schema = source.lookup(APP_ID, True) if source else None
        check(
            "PASS" if schema else "FAIL", "GSettings schema", APP_ID if schema else "Run install.sh"
        )
    except (ImportError, ValueError):
        check("FAIL", "GSettings schema", "Gio unavailable")
    return results


def inspect_bus() -> list[tuple[str, str, str]]:
    results = []
    try:
        import gi

        gi.require_version("Gio", "2.0")
        gi.require_version("GLib", "2.0")
        from gi.repository import Gio, GLib

        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        for name, path, interface, method in [
            (EXTENSION_ID, OBJECT_PATH, APP_ID, "GetState"),
            (HELPER_ID, HELPER_PATH, HELPER_ID, "Ping"),
        ]:
            try:
                value = bus.call_sync(
                    name,
                    path,
                    interface,
                    method,
                    None,
                    None,
                    Gio.DBusCallFlags.NO_AUTO_START,
                    1500,
                    None,
                )
                results.append(("PASS", name, str(value.deepUnpack()[0])))
            except GLib.Error as exc:
                results.append(
                    ("WARN", name, f"Not running (the helper may be idle): {exc.message}")
                )
        value = bus.call_sync(
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus",
            "ListNames",
            None,
            None,
            Gio.DBusCallFlags.NONE,
            1000,
            None,
        )
        players = [n for n in value.deepUnpack()[0] if n.startswith("org.mpris.MediaPlayer2.")]
        results.append(
            (
                "PASS" if players else "WARN",
                "MPRIS players",
                ", ".join(players) or "None yet; start Spotify, Rhythmbox, Firefox media or VLC",
            )
        )
    except (ImportError, ValueError) as exc:
        results.append(("FAIL", "Session bus", str(exc)))
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Check the Notch installation without changing settings"
    )
    parser.add_argument("--offline", action="store_true", help="skip session-bus checks")
    args = parser.parse_args(argv)
    results = inspect_project()
    if not args.offline:
        results += inspect_bus()
    for level, name, detail in results:
        print(f"[{level}] {name}: {detail}")
    return 1 if any(level == "FAIL" for level, _, _ in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
