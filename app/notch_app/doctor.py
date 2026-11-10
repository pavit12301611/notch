from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
from pathlib import Path

from .config import APP_ID, EXTENSION_ID, OBJECT_PATH, UUID, extension_dir


def _data_dirs() -> list[Path]:
    home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    dirs = [home]
    dirs += [
        Path(p)
        for p in os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share").split(":")
        if p
    ]
    return dirs


def legacy_artifacts() -> list[Path]:
    """Return installed build-17-and-older helper/shelf files that should be gone."""
    found = []
    service = f"{APP_ID}.Helper.service"
    for data in _data_dirs():
        candidate = data / "dbus-1/services" / service
        if candidate.is_file():
            found.append(candidate)
    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    unit_dirs = [
        config / "systemd/user",
        Path("/etc/systemd/user"),
        Path("/usr/lib/systemd/user"),
        Path("/usr/local/lib/systemd/user"),
    ]
    for directory in unit_dirs:
        candidate = directory / "notch-helper.service"
        if candidate.is_file():
            found.append(candidate)
    for name in ("notch-helper", "notch-shelf"):
        resolved = shutil.which(name)
        if resolved:
            found.append(Path(resolved))
    return found


def inspect_legacy_artifacts() -> list[tuple[str, str, str]]:
    found = legacy_artifacts()
    if found:
        return [
            (
                "WARN",
                "Legacy helper",
                "Old clipboard/shelf helper files are still installed: "
                + ", ".join(str(p) for p in found)
                + ". Re-run install.sh (build 18+) to remove them.",
            )
        ]
    return [("PASS", "Legacy helper", "No clipboard/shelf helper artifacts")]


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
        if release.get("ID") == "fedora" and release.get("VERSION_ID") not in {"44", "45"}:
            check(
                "WARN",
                "Fedora release",
                "This release targets Fedora 44-45 / GNOME 50-51 (GNOME Shell 46-51)",
            )
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
    shell_major = int(major.group(1)) if major else 0
    shell_ok = 46 <= shell_major <= 51
    check(
        "PASS" if shell_ok else "WARN",
        "GNOME Shell",
        version or "Not installed; 46-51 metadata compatibility, primary target 51",
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
        for namespace, ver in [("Gio", "2.0"), ("Gtk", "4.0"), ("Adw", "1")]:
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
        try:
            value = bus.call_sync(
                EXTENSION_ID,
                OBJECT_PATH,
                APP_ID,
                "GetState",
                None,
                None,
                Gio.DBusCallFlags.NO_AUTO_START,
                1500,
                None,
            )
            detail = str(value.unpack()[0])
            results.append(("PASS", EXTENSION_ID, detail))
            results.append(extension_revision_result(detail, installed_version))
        except GLib.Error:
            results.append(
                (
                    "WARN",
                    EXTENSION_ID,
                    "Not running; if files were installed/updated in this session, log out/in and enable it",
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
    results += inspect_legacy_artifacts()
    if not args.offline:
        results += inspect_shell_registration()
        results += inspect_bus()
    for level, name, detail in results:
        print(f"[{level}] {name}: {detail}")
    return 1 if any(level == "FAIL" for level, _, _ in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
