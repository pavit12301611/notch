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
        self.assertEqual(metadata["version"], 22)
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

    def test_optional_features_have_default_off_switches_in_both_preferences(self):
        schema = ET.parse(ROOT / "extension/schemas" / f"{APP_ID}.gschema.xml").getroot()
        keys = {key.attrib["name"]: key for key in schema.findall(".//key")}
        features = (ROOT / "extension/lib/features.js").read_text()
        feature_keys = re.findall(r"^    \['([^']+)',", features, re.MULTILINE)
        self.assertEqual(len(feature_keys), 8)
        python_prefs = (ROOT / "app/notch_app/settings.py").read_text()
        shell_prefs = (ROOT / "extension/prefs.js").read_text()
        self.assertIn("of FEATURES) addSwitch", shell_prefs)
        for key in feature_keys:
            self.assertEqual(keys[key].attrib["type"], "b")
            self.assertEqual(keys[key].find("default").text, "false")
            self.assertIn(f'"{key}"', python_prefs)
        self.assertEqual(keys["peek-blocked-apps"].attrib["type"], "as")
        for key in ("timer-enabled", "timer-minutes", "focus-minutes", "break-minutes"):
            self.assertNotIn(key, keys)
            self.assertNotIn(key, shell_prefs)
            self.assertNotIn(key, python_prefs)
        for source in (ROOT / "extension").rglob("*.js"):
            self.assertNotIn("Countdown", source.read_text())
            self.assertNotIn("timer-enabled", source.read_text())

    def test_overview_keeps_audio_controls_available_without_rebinding_super(self):
        schema = ET.parse(ROOT / "extension/schemas" / f"{APP_ID}.gschema.xml").getroot()
        keys = {key.attrib["name"]: key for key in schema.findall(".//key")}
        self.assertEqual(keys["hide-in-overview"].find("default").text, "false")
        self.assertEqual(keys["hide-on-fullscreen"].find("default").text, "true")
        view = (ROOT / "extension/lib/view.js").read_text()
        self.assertIn("'shown', () => this.syncVisibility()", view)
        self.assertIn("'hidden', () => this.syncVisibility()", view)
        self.assertIn("addChrome(this.actor, {trackFullscreen: false})", view)
        entry = (ROOT / "extension/extension.js").read_text()
        self.assertIn("Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW", entry)
        self.assertNotIn("overlay-key", entry)
        self.assertNotIn("overlay-key", view)

    def test_removed_features_are_absent_from_runtime_and_schema(self):
        schema = ET.parse(ROOT / "extension/schemas" / f"{APP_ID}.gschema.xml").getroot()
        keys = {key.attrib["name"] for key in schema.findall(".//key")}
        self.assertNotIn("clipboard-enabled", keys)
        self.assertNotIn("clipboard-limit", keys)
        for path in (
            "extension/lib/clipboard.js",
            "extension/lib/shelf.js",
            "extension/lib/pagination.js",
            "extension/lib/launcher.js",
            "extension/dbus/io.github.pavit12301611.Notch.Helper.xml",
            "app/notch_app/helper.py",
            "app/notch_app/storage.py",
            "app/notch_app/shelf_cli.py",
            "data/notch-helper.in",
            "data/notch-shelf.in",
            "data/notch-helper.service.in",
            "data/io.github.pavit12301611.Notch.Helper.service.in",
        ):
            self.assertFalse((ROOT / path).exists(), path)
        for source in (ROOT / "extension").rglob("*.js"):
            text = source.read_text()
            self.assertNotRegex(
                text, r"ClipboardHistory|ClearClipboard|notchDropGeometry|nearDropTarget"
            )
            self.assertNotIn("clipboard-enabled", text)
        for source in (ROOT / "app/notch_app").glob("*.py"):
            text = source.read_text()
            self.assertNotIn("HELPER_ID", text)
            self.assertNotIn("helper_call", text)
        xml = (ROOT / "extension/dbus/io.github.pavit12301611.Notch.xml").read_text()
        self.assertNotIn("ClearClipboard", xml)

    def test_xml_interfaces_parse(self):
        for path in (ROOT / "extension/dbus").glob("*.xml"):
            with self.subTest(path=path):
                self.assertTrue(ET.parse(path).getroot().findall("interface"))

    def test_shell_resource_import_paths(self):
        prefs = (ROOT / "extension/prefs.js").read_text()
        self.assertIn("resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js", prefs)
        self.assertNotIn("resource:///org/gnome/shell/extensions/prefs.js", prefs)
        extension = (ROOT / "extension/extension.js").read_text()
        self.assertIn("resource:///org/gnome/shell/extensions/extension.js", extension)

    def test_st_box_spacing_is_css_not_property(self):
        widgets = (ROOT / "extension/lib/widgets.js").read_text()
        self.assertNotRegex(widgets, r"new St\.BoxLayout\(\{[^}]*\bspacing\s*[,}]")
        self.assertIn("spacing: ${Number(spacing) || 0}px;", widgets)

    def test_prefs_are_inline_libadwaita_without_privacy_page(self):
        prefs = (ROOT / "extension/prefs.js").read_text()
        for control in ("Adw.SwitchRow", "Adw.SpinRow", "Adw.ComboRow"):
            self.assertIn(control, prefs)
        self.assertNotIn("Privacy", prefs)
        self.assertNotIn("clipboard", prefs.lower())
        self.assertNotIn("shelf", prefs.lower())
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
        self.assertEqual(keys["expanded-height"].find("default").text, "480")
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

    def test_design_spacing_and_symbolic_icons(self):
        layout = (ROOT / "extension/lib/layout.js").read_text()
        self.assertIn("paddingX: 20", layout)
        self.assertIn("headerHeight: 44", layout)
        css = (ROOT / "extension/stylesheet.css").read_text()
        self.assertIn("-st-icon-style: symbolic", css)
        self.assertIn(".notch-page", css)
        self.assertIn(".notch-empty", css)
        self.assertIn(".notch-stat-value", css)
        self.assertIn(".notch-home-clock", css)
        view = (ROOT / "extension/lib/view.js").read_text()
        self.assertIn("emptyState(", view)
        self.assertIn("notch-page-header", view)

    def test_st_icon_uses_real_gnome50_properties(self):
        for source in (ROOT / "extension").rglob("*.js"):
            text = source.read_text()
            self.assertNotRegex(text, r"\bicon_type\s*[:=]", str(source))
            self.assertNotIn("St.IconType", text, str(source))
        widgets = (ROOT / "extension/lib/widgets.js").read_text()
        self.assertIn("export function setIconSource", widgets)
        self.assertIn("widget.icon_name = null;\n        widget.gicon = gicon;", widgets)
        view = (ROOT / "extension/lib/view.js").read_text()
        self.assertIn("sourceIcon(gicon", view)

    def test_gjs_dbus_results_are_unpacked_not_destructured(self):
        media = (ROOT / "extension/lib/media.js").read_text()
        self.assertIn("result.deepUnpack()[0]", media)
        self.assertNotIn(".then(([names])", media)
        self.assertNotIn(".then(([variant])", media)

    def test_pyobject_dbus_apis_match_gio(self):
        for name in ("doctor.py", "settings.py"):
            source = (ROOT / "app/notch_app" / name).read_text()
            self.assertNotIn("deepUnpack", source)
            self.assertIn(".unpack()", source)

    def test_adaptive_view_has_optional_calendar_tab_and_overflow(self):
        view = (ROOT / "extension/lib/view.js").read_text()
        self.assertIn("contentLayout", view)
        self.assertIn("pageContainers", view)
        self.assertIn("notificationScroll", view)
        self.assertEqual(view.count("new St.ScrollView"), 1)
        extras = (ROOT / "extension/lib/extras.js").read_text()
        self.assertIn("enabled ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER", extras)
        self.assertIn("this.extras.wrapPage(id, page)", view)
        self.assertIn("headerMode", (ROOT / "extension/lib/layout.js").read_text())
        self.assertIn("syncActions", view)
        self.assertIn("showStatus", view)
        self.assertNotIn("Main.notify('Notch', message)", view)
        self.assertNotIn("pageSlice", view)
        self.assertNotIn("shelfPager", view)
        self.assertNotIn("clipboardPager", view)
        for tab in ("'home'", "'calendar'", "'media'", "'notifications'", "'system'"):
            self.assertIn(tab, view)
        self.assertNotIn("'shelf'", view)
        self.assertNotIn("'clipboard'", view)

    def test_home_music_system_and_stability_contracts(self):
        view = (ROOT / "extension/lib/view.js").read_text()
        self.assertIn("notch-home-page", view)
        self.assertIn("notch-home-clock", view)
        self.assertIn("notch-home-date", view)
        self.assertIn("translation_y", view)
        self.assertIn("visualizerLevels", view)
        self.assertIn("set_pivot_point(0.5, 1)", view)
        self.assertIn("scale_y: levels[index]", view)
        self.assertNotIn("bar.style = `height:", view)
        self.assertIn("repeat_count: 1", view)
        self.assertIn("_animationWatchdog", view)
        self.assertIn("relayout storm", view)
        self.assertIn("page.y_expand = false", view)
        media = (ROOT / "extension/lib/media.js").read_text()
        self.assertIn("scheduleChange", media)
        self.assertIn("suppressUntil", (ROOT / "extension/lib/widgets.js").read_text())
        self.assertIn("mediaDisplayTitle", view)
        self.assertIn("setIconDirectory", view)
        self.assertTrue((ROOT / "extension/icons/user-home-symbolic.svg").is_file())
        self.assertNotIn("ArtLoader", view)
        self.assertNotIn("remote-art", view)
        self.assertNotIn("AudioController", view)
        self.assertNotIn("playerVolume", view)
        self.assertNotIn("outputVolume", view)
        self.assertNotIn("notch-home-media", view)
        self.assertIn("mediaEmpty", view)
        self.assertIn("countNotifications", view)
        self.assertIn("previewText", view)
        self.assertIn("notch-stat-value", view)
        self.assertIn("notch-stat-label", view)

    def test_build19_header_icons_and_charging_contract(self):
        view = (ROOT / "extension/lib/view.js").read_text()
        layout = (ROOT / "extension/lib/layout.js").read_text()
        surface = (ROOT / "extension/lib/surface.js").read_text()
        diagnostics = (ROOT / "extension/lib/diagnostics.js").read_text()
        self.assertIn("settings-sliders-symbolic", view)
        self.assertNotIn("emblem-system-symbolic", view)
        self.assertTrue((ROOT / "extension/icons/settings-sliders-symbolic.svg").is_file())
        self.assertTrue((ROOT / "extension/icons/battery-charging-symbolic.svg").is_file())
        self.assertFalse((ROOT / "extension/icons/emblem-system-symbolic.svg").exists())
        # Fixed unthemed tab slots keep themed button padding inside the rail budget.
        self.assertIn("tabSlots", view)
        self.assertIn("headerLayout", layout)
        self.assertIn("requiredWidth", layout)
        self.assertIn("headerRight", view)
        # The left flare must mirror the right flare, not fill a square outside the body.
        self.assertIn("cr.lineTo(r, r);", surface)
        self.assertIn("cr.curveTo(r, r / 3, 2 * r / 3, 0, 0, 0);", surface)
        # Charging feedback is transition-gated and strictly under two seconds.
        self.assertIn("onChargeStart", diagnostics)
        self.assertIn("_batteryInitialized", diagnostics)
        self.assertIn("chargingStarted", diagnostics)
        self.assertIn("showChargingBadge", view)
        self.assertIn("chargeBadgeTimer", view)
        self.assertIn("this.setTimer('chargeBadgeTimer', 1640", view)
        self.assertIn("duration: this.motionDuration(120)", view)
        self.assertIn("this.mode !== 'closed'", view)

    def test_templates_are_fully_substituted(self):
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run(
                ["make", "stage", f"STAGE={temp}", "PREFIX=/usr", "SYSCONFDIR=/etc"],
                cwd=ROOT,
                check=True,
                capture_output=True,
            )
            names = {path.name for path in Path(temp).iterdir()}
            self.assertEqual(names, {"notch-settings", "notch-doctor", f"{APP_ID}.desktop"})
            for path in Path(temp).iterdir():
                self.assertNotIn("@bindir@", path.read_text())
                self.assertNotIn("@pkgdatadir@", path.read_text())
                self.assertNotIn("@python@", path.read_text())

    def test_installer_retires_legacy_helper(self):
        makefile = (ROOT / "Makefile").read_text()
        self.assertIn("rm -f $(DESTDIR)$(BINDIR)/notch-helper", makefile)
        self.assertIn("rm -f $(DESTDIR)$(BINDIR)/notch-shelf", makefile)
        self.assertIn("$(APP_ID).Helper.service", makefile)
        self.assertIn("notch-helper.service", makefile)
        self.assertIn("helper.py", makefile)
        installer = (ROOT / "install.sh").read_text()
        self.assertIn("disable --now notch-helper.service", installer)
        self.assertNotIn("enable notch-helper.service", installer)
        self.assertNotIn("Soup", installer)
        spec = (ROOT / "packaging/rpm/notch.spec").read_text()
        self.assertNotIn("notch-helper", spec)
        self.assertNotIn("notch-shelf", spec)
        self.assertNotIn("libsoup3", spec)

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
