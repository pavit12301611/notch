from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
from pathlib import Path

from .config import (
    APP_ID,
    EXTENSION_ID,
    HELPER_ID,
    HELPER_PATH,
    OBJECT_PATH,
    UUID,
    extension_dir,
    state_dir,
)


def _data_dirs() -> list[Path]:
    home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    dirs = [home]
    dirs += [
        Path(p)
        for p in os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share").split(":")
        if p
    ]
    return dirs


def helper_service_file() -> Path | None:
    name = f"{HELPER_ID}.service"
    return next(
        (
            d / "dbus-1/services" / name
            for d in _data_dirs()
            if (d / "dbus-1/services" / name).is_file()
        ),
        None,
    )


def inspect_helper_service() -> list[tuple[str, str, str]]:
    results = []
    service = helper_service_file()
    if service:
        results.append(("PASS", "Helper D-Bus service", str(service)))
    else:
        results.append(("FAIL", "Helper D-Bus service", "Missing; re-run install.sh"))
    try:
        output = subprocess.run(
            [
                "systemctl",
                "--user",
                "show",
                "notch-helper.service",
                "-p",
                "LoadState",
                "-p",
                "ActiveState",
                "-p",
                "UnitFileState",
                "-p",
                "Result",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        ).stdout
        state = dict(line.split("=", 1) for line in output.splitlines() if "=" in line)
        if not state:
            results.append(("WARN", "Helper systemd unit", "systemctl returned no unit state"))
        elif state.get("LoadState") == "not-found":
            results.append(
                ("FAIL", "Helper systemd unit", "Not loaded; re-run install.sh and daemon-reload")
            )
        elif state.get("ActiveState") == "failed" or state.get("Result") not in (None, "success"):
            results.append(
                (
                    "FAIL",
                    "Helper systemd unit",
                    "Failed; run: journalctl --user -u notch-helper.service -b",
                )
            )
        else:
            results.append(
                (
                    "PASS",
                    "Helper systemd unit",
                    f"{state.get('UnitFileState', 'unknown')} / {state.get('ActiveState', 'unknown')}",
                )
            )
    except (OSError, subprocess.TimeoutExpired) as exc:
        results.append(("WARN", "Helper systemd unit", str(exc)))
    return results


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
        check(
            "PASS", "Extension files", f"{directory} (build {metadata.get('version', 'unknown')})"
        )
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


def extension_registration_result(info: object, installed_version: object) -> tuple[str, str, str]:
    """Interpret org.gnome.Shell.Extensions.GetExtensionInfo for this UUID."""
    name = "Shell registration"
    if not isinstance(info, dict) or info.get("uuid") != UUID:
        return (
            "FAIL",
            name,
            "Files may be installed, but this GNOME session has not discovered the extension. "
            "Log out/in, then enable it; do not keep reinstalling.",
        )
    state = info.get("state")
    error = info.get("error") or ""
    if state == 3:
        return (
            "FAIL",
            name,
            f"Extension load error: {error or 'see journalctl -b _COMM=gnome-shell'}",
        )
    if state == 4:
        return ("FAIL", name, "Extension is OUT_OF_DATE for this GNOME Shell version")
    loaded = info.get("version")
    if installed_version is not None and loaded is not None:
        try:
            mismatch = float(loaded) != float(installed_version)
        except (TypeError, ValueError):
            mismatch = str(loaded) != str(installed_version)
        if mismatch:
            return (
                "WARN",
                name,
                f"Shell knows build {loaded}, installed build {installed_version}. Log out/in.",
            )
    if state == 1:
        return ("PASS", name, f"Discovered and active (build {loaded})")
    if state in (2, 6):
        return ("WARN", name, "Discovered but inactive; run gnome-extensions enable " + UUID)
    return ("WARN", name, f"Discovered, state={state}; {error}".strip())


def inspect_shell_registration() -> list[tuple[str, str, str]]:
    results = []
    try:
        installed_version = json.loads((extension_dir() / "metadata.json").read_text()).get(
            "version"
        )
    except (OSError, ValueError, AttributeError):
        installed_version = None
    try:
        import gi

        gi.require_version("Gio", "2.0")
        gi.require_version("GLib", "2.0")
        from gi.repository import Gio, GLib

        shell_settings = Gio.Settings.new("org.gnome.shell")
        if not shell_settings.get_boolean("allow-extension-installation"):
            results.append(
                ("FAIL", "Extension installation", "GNOME allow-extension-installation is false")
            )
        if shell_settings.get_boolean("disable-user-extensions"):
            results.append(
                ("WARN", "User extensions", "All user extensions are disabled in GNOME settings")
            )
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        value = bus.call_sync(
            "org.gnome.Shell.Extensions",
            "/org/gnome/Shell/Extensions",
            "org.gnome.Shell.Extensions",
            "GetExtensionInfo",
            GLib.Variant.new("(s)", (UUID,)),
            None,
            Gio.DBusCallFlags.NO_AUTO_START,
            1500,
            None,
        )
        results.append(extension_registration_result(value.unpack()[0], installed_version))
    except Exception as exc:  # diagnostics must not crash when the session bus is absent
        results.append(("WARN", "Shell registration", f"Could not query GNOME Shell: {exc}"))
    return results


def extension_revision_result(payload: str, installed_version: object) -> tuple[str, str, str]:
    """Compare the running Shell module with the installed metadata build."""
    name = "Extension build"
    try:
        state = json.loads(payload)
        if not isinstance(state, dict):
            raise ValueError("state is not an object")
    except (TypeError, ValueError):
        return ("WARN", name, "The running extension returned invalid state; log out and back in")
    loaded = state.get("extensionVersion")
    if installed_version is None:
        return ("WARN", name, "Installed metadata has no build version")
    if loaded is None:
        return (
            "WARN",
            name,
            f"Older Notch code is loaded; installed build {installed_version}. Log out and back in.",
        )
    if str(loaded) != str(installed_version):
        return (
            "WARN",
            name,
            f"Loaded build {loaded}, installed build {installed_version}. Log out and back in.",
        )
    return ("PASS", name, f"Loaded and installed build {installed_version}")


def helper_revision_result(payload: str, installed_version: object) -> tuple[str, str, str]:
    name = "Helper build"
    try:
        state = json.loads(payload)
        if not isinstance(state, dict):
            raise ValueError("state is not an object")
    except (TypeError, ValueError):
        return (
            "WARN",
            name,
            "The running helper returned invalid state; restart notch-helper.service",
        )
    loaded = state.get("build")
    if loaded is None:
        return (
            "WARN",
            name,
            "Older helper is running; run: systemctl --user restart notch-helper.service",
        )
    if installed_version is not None and str(loaded) != str(installed_version):
        return (
            "WARN",
            name,
            f"Loaded build {loaded}, installed build {installed_version}. Restart notch-helper.service.",
        )
    shelf = state.get("shelfPath") or str(state_dir() / "shelf.json")
    count = state.get("itemCount", 0)
    error = state.get("loadError")
    detail = f"Build {loaded}; {count} stashed file(s); {shelf}"
    if error:
        return ("FAIL", name, f"Shelf storage needs repair: {error}")
    return ("PASS", name, detail)


def inspect_bus() -> list[tuple[str, str, str]]:
    results = []
    try:
        installed_version = json.loads((extension_dir() / "metadata.json").read_text()).get(
            "version"
        )
    except (OSError, ValueError, AttributeError):
        installed_version = None
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
                is_helper = name == HELPER_ID
                value = bus.call_sync(
                    name,
                    path,
                    interface,
                    method,
                    None,
                    None,
                    Gio.DBusCallFlags.NONE if is_helper else Gio.DBusCallFlags.NO_AUTO_START,
                    8000 if is_helper else 1500,
                    None,
                )
                detail = str(value.unpack()[0])
                results.append(("PASS", name, detail))
                if name == EXTENSION_ID:
                    results.append(extension_revision_result(detail, installed_version))
                elif name == HELPER_ID:
                    try:
                        info = bus.call_sync(
                            name,
                            path,
                            interface,
                            "GetInfo",
                            None,
                            None,
                            Gio.DBusCallFlags.NONE,
                            2000,
                            None,
                        )
                        results.append(
                            helper_revision_result(str(info.unpack()[0]), installed_version)
                        )
                    except GLib.Error:
                        results.append(helper_revision_result("{}", installed_version))
            except GLib.Error as exc:
                detail = (
                    "Not running; if files were installed/updated in this session, log out/in and enable it"
                    if name == EXTENSION_ID
                    else f"Not running (the helper may be idle): {exc.message}"
                )
                results.append(("WARN", name, detail))
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
        players = [n for n in value.unpack()[0] if n.startswith("org.mpris.MediaPlayer2.")]
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
    results += inspect_helper_service()
    if not args.offline:
        results += inspect_shell_registration()
        results += inspect_bus()
    for level, name, detail in results:
        print(f"[{level}] {name}: {detail}")
    return 1 if any(level == "FAIL" for level, _, _ in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
