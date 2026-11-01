from __future__ import annotations

import json
import sys

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, Gio, GLib, Gtk  # noqa: E402

from . import __version__  # noqa: E402
from .config import APP_ID, EXTENSION_ID, OBJECT_PATH, interface_xml  # noqa: E402


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
        self.window.add(self.about_page())
        self.window.connect("close-request", self._window_closed)
        self.window.present()
        self.refresh_status()

    def _window_closed(self, *_):
        self.cancellable.cancel()
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
        self.settings.set_int("expanded-height", 480)
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
        shortcut = Adw.ActionRow(
            title="Keyboard shortcut", subtitle="Super + ` (the key above Tab on US keyboards)"
        )
        media.add(shortcut)
        return page

    def about_page(self):
        page = Adw.PreferencesPage(title="About", icon_name="help-about-symbolic")
        about = self.group(
            page,
            f"Notch {__version__}",
            "A native Shell notch with a GTK4/Libadwaita settings app. Inspired by Cyclop; no Cyclop code or assets are included.",
        )
        self.extension_status = Adw.ActionRow(title="Shell extension", subtitle="Checking…")
        about.add(self.extension_status)
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
                data = json.loads(value.unpack()[0])
                build = data.get("extensionVersion", "unknown")
                mode = data.get("mode", "closed")
                self.extension_status.set_subtitle(f"Running · build {build} · {mode}")
            except (ValueError, IndexError, TypeError, AttributeError):
                self.extension_status.set_subtitle("Running · invalid status response")

        self.extension_call("GetState", state)


def main(argv=None):
    Adw.init()
    return SettingsApplication().run(argv if argv is not None else sys.argv)
