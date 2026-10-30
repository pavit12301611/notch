from __future__ import annotations

import json
import sys

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, Gio, GLib, Gtk  # noqa: E402

from . import __version__  # noqa: E402
from .config import APP_ID, EXTENSION_ID, HELPER_ID, HELPER_PATH, OBJECT_PATH, interface_xml  # noqa: E402


class SettingsApplication(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.FLAGS_NONE)
        self.window = None
        self.bindings = []
        self.proxy = None
        self.cancellable = Gio.Cancellable()

    def do_activate(self):
        if self.window is not None:
            self.window.present()
            return
        try:
            self.settings = Gio.Settings.new(APP_ID)
        except GLib.Error as exc:
            raise SystemExit(
                f"Notch schema is not installed. Run ./install.sh first.\n{exc.message}"
            ) from exc
        self.window = Adw.PreferencesWindow(
            application=self, title="Notch", default_width=760, default_height=780
        )
        self.window.add(self.appearance_page())
        self.window.add(self.behavior_page())
        self.window.add(self.privacy_page())
        self.window.add(self.about_page())
        self.settings.connect("changed", self._setting_changed)
        self.window.connect("close-request", self._window_closed)
        self.window.present()
        self.refresh_status()

    def _window_closed(self, *_):
        self.cancellable.cancel()
        self.settings.disconnect_by_func(self._setting_changed)
        for obj, handler in self.bindings:
            if obj.handler_is_connected(handler):
                obj.disconnect(handler)
        self.bindings = []
        return False

    def group(self, page, title, description=None):
        group = Adw.PreferencesGroup(title=title, description=description)
        page.add(group)
        return group

    def switch(self, group, key, title, subtitle=None):
        row = Adw.SwitchRow(title=title, subtitle=subtitle)
        self.settings.bind(key, row, "active", Gio.SettingsBindFlags.DEFAULT)
        group.add(row)
        return row

    def spin(self, group, key, title, low, high, step=1, subtitle=None):
        row = Adw.SpinRow(
            title=title,
            subtitle=subtitle,
            adjustment=Gtk.Adjustment.new(self.settings.get_int(key), low, high, step, 10, 0),
        )
        row.set_value(self.settings.get_int(key))

        def changed(widget, _param):
            value = int(widget.get_value())
            if self.settings.get_int(key) != value:
                self.settings.set_int(key, value)

        def external(*_):
            value = self.settings.get_int(key)
            if row.get_value() != value:
                row.set_value(value)

        self.bindings.append((row, row.connect("notify::value", changed)))
        self.bindings.append((self.settings, self.settings.connect(f"changed::{key}", external)))
        group.add(row)
        return row

    def appearance_page(self):
        page = Adw.PreferencesPage(
            title="Appearance", icon_name="preferences-desktop-appearance-symbolic"
        )
        geometry = self.group(
            page,
            "Shape & position",
            "Dimensions use logical pixels and are clamped to the selected monitor.",
        )
        placement = Adw.ComboRow(
            title="Placement",
            subtitle="MacBook mode replaces the centered top-bar clock",
            model=Gtk.StringList.new(
                ["Below panel (legacy)", "Floating island (optional)", "MacBook top edge (default)"]
            ),
        )
        values = ["top-center", "floating", "panel"]
        placement.set_selected(values.index(self.settings.get_string("placement")))

        def placement_changed(row, _param):
            self.settings.set_string("placement", values[row.get_selected()])

        def placement_external(*_):
            placement.set_selected(values.index(self.settings.get_string("placement")))

        self.bindings.append((placement, placement.connect("notify::selected", placement_changed)))
        self.bindings.append(
            (self.settings, self.settings.connect("changed::placement", placement_external))
        )
        geometry.add(placement)
        preset = Adw.ActionRow(
            title="MacBook preset",
            subtitle="Top-edge notch, idle clock, notification routing and smooth animation",
        )
        preset_button = Gtk.Button(label="Apply", valign=Gtk.Align.CENTER)
        preset_button.connect("clicked", lambda *_: self.apply_macbook_preset())
        preset.add_suffix(preset_button)
        preset.set_activatable_widget(preset_button)
        geometry.add(preset)
        self.spin(geometry, "monitor-index", "Monitor", -1, 15, subtitle="−1 = primary monitor")
        self.spin(geometry, "collapsed-width", "Collapsed base width", 150, 520, 10)
        self.spin(geometry, "collapsed-height", "Collapsed height", 24, 64)
        self.spin(geometry, "expanded-width", "Maximum page width", 480, 1100, 10)
        self.spin(geometry, "expanded-height", "Maximum page height", 200, 720, 10)
        self.switch(geometry, "match-panel-height", "Match panel height when closed")
        self.switch(geometry, "adaptive-corners", "Adaptive MacBook corners")
        self.spin(geometry, "floating-margin", "Floating top margin", 0, 200)
        self.spin(geometry, "horizontal-offset", "Horizontal offset", -2000, 2000, 10)
        finish = self.group(page, "Finish")
        self.spin(finish, "corner-radius", "Corner radius", 8, 40)
        row = Adw.ActionRow(
            title="Opacity", subtitle="The notch remains opaque enough for readable controls"
        )
        scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.5, 1.0, 0.01)
        scale.set_value(self.settings.get_double("opacity"))
        scale.set_size_request(240, -1)
        scale.set_valign(Gtk.Align.CENTER)
        scale.set_digits(2)
        scale.set_draw_value(True)

        def opacity_changed(widget):
            self.settings.set_double("opacity", round(widget.get_value(), 2))

        def opacity_external(*_):
            scale.set_value(self.settings.get_double("opacity"))

        self.bindings.append((scale, scale.connect("value-changed", opacity_changed)))
        self.bindings.append(
            (self.settings, self.settings.connect("changed::opacity", opacity_external))
        )
        row.add_suffix(scale)
        row.set_activatable_widget(scale)
        finish.add(row)
        scale_row = Adw.ActionRow(title="Notch scale")
        notch_scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.75, 1.5, 0.01)
        notch_scale.set_value(self.settings.get_double("notch-scale"))
        notch_scale.set_size_request(240, -1)
        notch_scale.set_valign(Gtk.Align.CENTER)
        notch_scale.set_digits(2)
        notch_scale.set_draw_value(True)

        def notch_scale_changed(widget):
            self.settings.set_double("notch-scale", round(widget.get_value(), 2))

        def notch_scale_external(*_):
            notch_scale.set_value(self.settings.get_double("notch-scale"))

        self.bindings.append(
            (notch_scale, notch_scale.connect("value-changed", notch_scale_changed))
        )
        self.bindings.append(
            (self.settings, self.settings.connect("changed::notch-scale", notch_scale_external))
        )
        scale_row.add_suffix(notch_scale)
        scale_row.set_activatable_widget(notch_scale)
        finish.add(scale_row)
        return page

    def apply_macbook_preset(self):
        self.settings.set_string("placement", "panel")
        self.settings.set_int("collapsed-width", 185)
        self.settings.set_int("collapsed-height", 32)
        self.settings.set_int("expanded-width", 640)
        self.settings.set_int("expanded-height", 320)
        self.settings.set_int("corner-radius", 24)
        self.settings.set_double("notch-scale", 1.0)
        self.settings.set_boolean("match-panel-height", True)
        self.settings.set_boolean("adaptive-corners", True)
        self.settings.set_boolean("closed-media", True)
        self.settings.set_string("animation-profile", "mac-spring")
        self.settings.set_double("opacity", 1.0)
        self.settings.set_boolean("replace-panel-clock", True)
        self.settings.set_boolean("idle-clock", True)
        self.settings.set_boolean("notifications-in-notch", True)
        self.settings.set_boolean("auto-open-notifications", True)
        self.settings.set_boolean("animations", True)
        self.settings.set_int("open-animation-ms", 420)
        self.settings.set_int("close-animation-ms", 450)
        self.settings.set_int("peek-duration-ms", 5000)

    def behavior_page(self):
        page = Adw.PreferencesPage(title="Behavior", icon_name="preferences-system-symbolic")
        macbook = self.group(
            page,
            "MacBook notch",
            "The default is a top-edge notch, not a floating Dynamic Island.",
        )
        self.switch(macbook, "replace-panel-clock", "Replace top-bar date & time")
        self.switch(macbook, "idle-clock", "Show time when idle")
        self.switch(macbook, "notifications-in-notch", "Show notifications in the notch")
        self.switch(macbook, "auto-open-notifications", "Compact notification peeks")
        self.spin(macbook, "peek-duration-ms", "Peek duration", 2000, 15000, 500, "Milliseconds")
        self.switch(macbook, "closed-media", "Closed music wings")
        profile = Adw.ComboRow(
            title="Motion profile", model=Gtk.StringList.new(["Mac spring", "Smooth easing"])
        )
        profile_values = ["mac-spring", "smooth"]
        profile.set_selected(profile_values.index(self.settings.get_string("animation-profile")))

        def profile_changed(row, _param):
            self.settings.set_string("animation-profile", profile_values[row.get_selected()])

        def profile_external(*_):
            profile.set_selected(
                profile_values.index(self.settings.get_string("animation-profile"))
            )

        self.bindings.append((profile, profile.connect("notify::selected", profile_changed)))
        self.bindings.append(
            (self.settings, self.settings.connect("changed::animation-profile", profile_external))
        )
        macbook.add(profile)
        self.spin(macbook, "open-animation-ms", "Smooth open duration", 0, 1000, 20, "Milliseconds")
        self.spin(
            macbook, "close-animation-ms", "Smooth close duration", 0, 1000, 20, "Milliseconds"
        )
        behavior = self.group(page, "Opening & hiding")
        self.switch(
            behavior, "open-on-hover", "Open on hover", "Clicking the collapsed notch always works"
        )
        self.spin(behavior, "hover-delay-ms", "Hover delay", 0, 1500, 50, "Milliseconds")
        self.spin(
            behavior,
            "auto-hide-ms",
            "Auto-hide delay",
            0,
            60000,
            500,
            "Milliseconds; 0 disables. Pointer activity and slider grabs postpone hiding.",
        )
        self.switch(
            behavior,
            "animations",
            "Smooth animations",
            "Also respects GNOME’s Enable Animations accessibility setting",
        )
        self.switch(behavior, "hide-on-fullscreen", "Hide on fullscreen")
        self.switch(behavior, "hide-in-overview", "Hide in Activities overview")
        self.switch(
            behavior,
            "reserve-space",
            "Reserve collapsed space",
            "Experimental top work-area inset; never reserves the expanded size",
        )
        actions = self.group(
            page, "Quick actions", "Choose which GNOME toggles appear on the System page."
        )
        self.switch(actions, "show-dnd", "Do Not Disturb")
        self.switch(actions, "show-night-light", "Night Light")
        self.switch(actions, "show-dark-mode", "Dark Mode")
        media = self.group(page, "Media")
        self.switch(
            media,
            "remote-art",
            "Download remote album art",
            "Fetch player-provided HTTP(S) image URLs; disable to avoid art/CDN requests",
        )
        shortcut = Adw.ActionRow(
            title="Keyboard shortcut", subtitle="Super + ` (the key above Tab on US keyboards)"
        )
        media.add(shortcut)
        return page

    def privacy_page(self):
        page = Adw.PreferencesPage(title="Privacy & shelf", icon_name="security-high-symbolic")
        clipboard = self.group(
            page,
            "Clipboard history",
            "Off by default. Plain-text history is RAM-only, bounded to 64 KiB per item, and cleared on lock, logout or disable. Automatic capture checks once per second. Known password hints and mixed-format clips are skipped, but no heuristic can guarantee secrecy: keep this off when handling secrets.",
        )
        self.switch(clipboard, "clipboard-enabled", "Remember copied text")
        self.spin(clipboard, "clipboard-limit", "History size", 5, 50, 5, "Entries")
        clear = Adw.ActionRow(
            title="Clear clipboard history", subtitle="Does not erase the current system clipboard"
        )
        button = Gtk.Button(label="Clear", valign=Gtk.Align.CENTER)
        button.connect("clicked", lambda *_: self.extension_call("ClearClipboard"))
        clear.add_suffix(button)
        clear.set_activatable_widget(button)
        clipboard.add(clear)
        shelf = self.group(
            page,
            "File shelf",
            "The shelf stores local file references, not copies. Removing a reference never deletes the original. Dropping or choosing files is an explicit action; no filesystem-wide scanning is performed.",
        )
        row = Adw.ActionRow(
            title="Reference list",
            subtitle=GLib.build_filenamev([GLib.get_user_state_dir(), "notch", "shelf.json"]),
        )
        shelf.add(row)
        add = Adw.ActionRow(
            title="Add files", subtitle="Uses the GTK file chooser / desktop portal"
        )
        add_button = Gtk.Button(label="Choose files", valign=Gtk.Align.CENTER)
        add_button.connect("clicked", lambda *_: self.helper_call("ChooseFiles"))
        add.add_suffix(add_button)
        add.set_activatable_widget(add_button)
        shelf.add(add)
        return page

    def about_page(self):
        page = Adw.PreferencesPage(title="About", icon_name="help-about-symbolic")
        about = self.group(
            page,
            f"Notch {__version__}",
            "A native Shell notch with GTK4/Libadwaita companions. Inspired by Cyclop; no Cyclop code or assets are included.",
        )
        self.extension_status = Adw.ActionRow(title="Shell extension", subtitle="Checking…")
        self.helper_status = Adw.ActionRow(title="File helper", subtitle="Checking…")
        about.add(self.extension_status)
        about.add(self.helper_status)
        refresh = Adw.ActionRow(title="Refresh status")
        button = Gtk.Button(label="Check", valign=Gtk.Align.CENTER)
        button.connect("clicked", lambda *_: self.refresh_status())
        refresh.add_suffix(button)
        refresh.set_activatable_widget(button)
        about.add(refresh)
        links = self.group(page, "Project")
        link = Adw.ActionRow(
            title="Source & documentation",
            subtitle="github.com/pavit12301611/notch",
            activatable=True,
        )
        link.connect(
            "activated",
            lambda *_: Gio.AppInfo.launch_default_for_uri(
                "https://github.com/pavit12301611/notch", None
            ),
        )
        links.add(link)
        return page

    def _setting_changed(self, _settings, key):
        if key == "clipboard-enabled" and not self.settings.get_boolean(key):
            self.extension_call("ClearClipboard")

    def _proxy(self, name, path, interface, filename, callback):
        try:
            info = Gio.DBusInterfaceInfo.new_for_xml(interface_xml(filename))
            Gio.DBusProxy.new_for_bus(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                info,
                name,
                path,
                interface,
                self.cancellable,
                self._proxy_ready,
                callback,
            )
        except (GLib.Error, OSError) as exc:
            callback(None, str(exc))

    def _proxy_ready(self, source, result, callback):
        try:
            callback(Gio.DBusProxy.new_for_bus_finish(result), None)
        except GLib.Error as exc:
            callback(None, exc.message)

    def extension_call(self, method, callback=None):
        def ready(proxy, error):
            if proxy is None:
                if callback:
                    callback(None, error or "Extension is not running")
                return
            proxy.call(
                method,
                None,
                Gio.DBusCallFlags.NONE,
                1000,
                self.cancellable,
                self._call_finished,
                callback,
            )

        self._proxy(EXTENSION_ID, OBJECT_PATH, APP_ID, f"{APP_ID}.xml", ready)

    def helper_call(self, method):
        def ready(proxy, _error):
            if proxy:
                proxy.call(
                    method, None, Gio.DBusCallFlags.NONE, 3000, None, self._call_finished, None
                )

        # Allow bus activation for the helper, unlike extension status checks.
        info = Gio.DBusInterfaceInfo.new_for_xml(interface_xml(f"{HELPER_ID}.xml"))
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            info,
            HELPER_ID,
            HELPER_PATH,
            HELPER_ID,
            None,
            self._proxy_ready,
            ready,
        )

    def _call_finished(self, proxy, result, callback):
        try:
            value = proxy.call_finish(result)
            if callback:
                callback(value, None)
        except GLib.Error as exc:
            if callback:
                callback(None, exc.message)

    def refresh_status(self):
        def state(value, error):
            if error:
                self.extension_status.set_subtitle(f"Not running · {error}")
                return
            try:
                data = json.loads(value.deepUnpack()[0])
                self.extension_status.set_subtitle(
                    f"Running · {data.get('clipboardCount', 0)} clips · {data.get('shelfCount', 0)} files"
                )
            except (ValueError, IndexError, TypeError):
                self.extension_status.set_subtitle("Running · invalid status response")

        self.extension_call("GetState", state)

        def ready(proxy, error):
            if proxy is None:
                self.helper_status.set_subtitle(f"Offline · {error}")
                return
            proxy.call("Ping", None, Gio.DBusCallFlags.NONE, 1000, None, ping_done, None)

        def ping_done(proxy, result, _data):
            try:
                version = proxy.call_finish(result).deepUnpack()[0]
                self.helper_status.set_subtitle(f"Ready · version {version}")
            except GLib.Error as exc:
                self.helper_status.set_subtitle(f"Offline · {exc.message}")

        self._proxy(HELPER_ID, HELPER_PATH, HELPER_ID, f"{HELPER_ID}.xml", ready)


def main(argv=None):
    Adw.init()
    return SettingsApplication().run(argv if argv is not None else sys.argv)
