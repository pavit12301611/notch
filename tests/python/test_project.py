import json
import re
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from notch_app.config import APP_ID, UUID, extension_dir

ROOT = Path(__file__).resolve().parents[2]


class ProjectTests(unittest.TestCase):
    def test_metadata_and_schema_agree(self):
        metadata = json.loads((ROOT / "extension/metadata.json").read_text())
        self.assertEqual(metadata["uuid"], UUID)
        self.assertEqual(metadata["settings-schema"], APP_ID)
        self.assertIn("50", metadata["shell-version"])
        schema = ET.parse(ROOT / "extension/schemas" / f"{APP_ID}.gschema.xml").getroot()
        keys = {key.attrib["name"] for key in schema.findall(".//key")}
        for source in (ROOT / "extension").rglob("*.js"):
            used = set(
                re.findall(
                    r"settings\.get_(?:int|boolean|double|string)\('([^']+)'\)", source.read_text()
                )
            )
            self.assertTrue(used <= keys, f"Unknown keys in {source}: {used - keys}")

    def test_xml_interfaces_parse(self):
        for path in (ROOT / "extension/dbus").glob("*.xml"):
            with self.subTest(path=path):
                self.assertTrue(ET.parse(path).getroot().findall("interface"))

    def test_shell_resource_import_paths(self):
        # prefs.js lives in the separate org.gnome.Shell.Extensions resource bundle,
        # not in the main org.gnome.Shell bundle used by extension.js.
        prefs = (ROOT / "extension/prefs.js").read_text()
        self.assertIn("resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js", prefs)
        self.assertNotIn("resource:///org/gnome/shell/extensions/prefs.js", prefs)
        extension = (ROOT / "extension/extension.js").read_text()
        self.assertIn("resource:///org/gnome/shell/extensions/extension.js", extension)

    def test_st_box_spacing_is_css_not_property(self):
        widgets = (ROOT / "extension/lib/widgets.js").read_text()
        self.assertNotRegex(widgets, r"new St\.BoxLayout\(\{[^}]*\bspacing\s*[,}]")
        self.assertIn("spacing: ${Number(spacing) || 0}px;", widgets)

    def test_prefs_are_inline_libadwaita(self):
        prefs = (ROOT / "extension/prefs.js").read_text()
        for control in ("Adw.SwitchRow", "Adw.SpinRow", "Adw.ComboRow", "clipboard-enabled"):
            self.assertIn(control, prefs)
        self.assertNotIn("Open Notch Settings", prefs)
        self.assertNotIn("openPreferences()", (ROOT / "extension/extension.js").read_text())

    def test_macbook_defaults_and_notification_keys(self):
        schema = ET.parse(ROOT / "extension/schemas" / f"{APP_ID}.gschema.xml").getroot()
        keys = {key.attrib["name"]: key for key in schema.findall(".//key")}
        for name in (
            "replace-panel-clock",
            "idle-clock",
            "notifications-in-notch",
            "auto-open-notifications",
            "open-animation-ms",
            "close-animation-ms",
        ):
            self.assertIn(name, keys)
        self.assertEqual(keys["placement"].find("default").text, "'panel'")
        self.assertEqual(keys["collapsed-width"].find("default").text, "185")
        self.assertEqual(keys["expanded-width"].find("default").text, "640")
        self.assertEqual(keys["animation-profile"].find("default").text, "'mac-spring'")
        for name in (
            "notch-scale",
            "match-panel-height",
            "adaptive-corners",
            "closed-media",
            "peek-duration-ms",
        ):
            self.assertIn(name, keys)
        self.assertEqual(keys["opacity"].find("default").text, "1.0")
        self.assertEqual(keys["notifications-in-notch"].find("default").text, "true")

    def test_notification_bridge_is_reversible(self):
        source = (ROOT / "extension/lib/notifications.js").read_text()
        self.assertIn("overrideMethod(this.tray, '_showNotification'", source)
        self.assertIn("restoreMethod(this.tray, '_showNotification')", source)
        self.assertIn("notification.acknowledged = true", source)
        self.assertNotIn("notification.destroy()", source)
        self.assertNotIn("_hideNotification", source)
        view = (ROOT / "extension/lib/view.js").read_text()
        self.assertIn("GnomeDesktop.WallClock", view)
        self.assertIn("syncPanelClock", view)
        self.assertIn("container.opacity = this.clockOriginal?.opacity ?? 255", view)
        self.assertIn("new NotchSurface", view)
        self.assertIn("SpringGeometry", view)

    def test_pyobject_dbus_apis_match_gio(self):
        helper = (ROOT / "app/notch_app/helper.py").read_text()
        self.assertIn("connection.register_object(", helper)
        self.assertIn("connection.unregister_object(self.registration)", helper)
        self.assertNotIn("register_object_path", helper)
        self.assertNotIn("unregister_object_path", helper)
        for name in ("doctor.py", "settings.py"):
            source = (ROOT / "app/notch_app" / name).read_text()
            self.assertNotIn("deepUnpack", source)
            self.assertIn(".unpack()", source)

    def test_helper_activation_is_not_blocked_by_desktop_condition(self):
        unit = (ROOT / "data/notch-helper.service.in").read_text()
        self.assertNotIn("ConditionEnvironment", unit)
        service = (ROOT / "data/io.github.pavit12301611.Notch.Helper.service.in").read_text()
        self.assertNotIn("SystemdService=", service)
        self.assertIn("Exec=@bindir@/notch-helper", service)
        self.assertIn("BusName=io.github.pavit12301611.Notch.Helper", unit)
        installer = (ROOT / "install.sh").read_text()
        self.assertIn("reset-failed notch-helper.service", installer)
        self.assertIn("import-environment", installer)
        helper = (ROOT / "app/notch_app/helper.py").read_text()
        self.assertIn("self.gobject.Value", helper)
        self.assertIn("OSError", helper)

    def test_adaptive_view_has_scrollable_pages_and_stable_actions(self):
        view = (ROOT / "extension/lib/view.js").read_text()
        self.assertIn("contentLayout", view)
        self.assertIn("pageScrolls", view)
        self.assertIn("headerMode", (ROOT / "extension/lib/layout.js").read_text())
        self.assertIn("syncActions", view)
        self.assertIn("retryShelf", view)
        self.assertIn("showStatus", view)
        self.assertNotIn("Main.notify('Notch', message)", view)

    def test_templates_are_fully_substituted(self):
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run(
                ["make", "stage", f"STAGE={temp}", "PREFIX=/usr", "SYSCONFDIR=/etc"],
                cwd=ROOT,
                check=True,
                capture_output=True,
            )
            for path in Path(temp).iterdir():
                self.assertNotIn("@bindir@", path.read_text())
                self.assertNotIn("@pkgdatadir@", path.read_text())
                self.assertNotIn("@python@", path.read_text())
            self.assertIn(
                "/usr/bin/notch-helper", (Path(temp) / "notch-helper.service").read_text()
            )

    def test_remote_bootstrap_syntax_and_help(self):
        script = ROOT / "scripts/bootstrap.sh"
        subprocess.run(["bash", "-n", str(script)], check=True, capture_output=True)
        result = subprocess.run(
            ["bash", str(script), "--help"], check=True, capture_output=True, text=True
        )
        self.assertIn("--with-deps", result.stdout)
        self.assertIn("codeload", script.read_text())
        self.assertTrue(script.stat().st_mode & 0o111)

    def test_extension_directory_override(self):
        import os

        old = os.environ.get("NOTCH_EXTENSION_DIR")
        os.environ["NOTCH_EXTENSION_DIR"] = str(ROOT / "extension")
        try:
            self.assertEqual(extension_dir(), ROOT / "extension")
        finally:
            if old is None:
                del os.environ["NOTCH_EXTENSION_DIR"]
            else:
                os.environ["NOTCH_EXTENSION_DIR"] = old


if __name__ == "__main__":
    unittest.main()
