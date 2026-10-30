from __future__ import annotations

import sys
import time

import gi

gi.require_version("Gio", "2.0")
gi.require_version("GLib", "2.0")
from gi.repository import Gio, GLib  # noqa: E402

from . import __version__  # noqa: E402
from .config import DROP_TITLE, HELPER_ID, HELPER_PATH, interface_xml, state_dir  # noqa: E402
from .storage import ShelfStore  # noqa: E402

DBUS_ERROR = "org.freedesktop.DBus.Error.InvalidArgs"


class HelperApplication(Gio.Application):
    """Session-bus service. GTK is imported lazily; the process exits after five idle minutes."""

    def __init__(self):
        super().__init__(application_id=HELPER_ID, flags=Gio.ApplicationFlags.FLAGS_NONE)
        self.store = ShelfStore(state_dir() / "shelf.json")
        self.window = None
        self.dialog = None
        self.registration = None
        self.connection = None
        self.last_use = time.monotonic()
        self.idle_source = None
        self.gtk = None
        self.gdk = None

    def do_startup(self):
        Gio.Application.do_startup(self)
        self.hold()
        self.idle_source = GLib.timeout_add_seconds(30, self._idle_exit)

    def do_activate(self):
        # No window on activation: this is a drop-target provider, not a background UI.
        self.last_use = time.monotonic()

    def _idle_exit(self):
        if (
            time.monotonic() - self.last_use >= 300
            and self.dialog is None
            and (self.window is None or not self.window.get_visible())
        ):
            self.idle_source = None
            self.release()
            self.quit()
            return GLib.SOURCE_REMOVE
        return GLib.SOURCE_CONTINUE

    def do_dbus_register(self, connection, object_path):
        if not Gio.Application.do_dbus_register(self, connection, object_path):
            return False
        self.connection = connection
        try:
            node = Gio.DBusNodeInfo.new_for_xml(interface_xml(f"{HELPER_ID}.xml"))
        except (OSError, GLib.Error) as exc:
            print(f"Notch helper: cannot load D-Bus interface: {exc}", file=sys.stderr)
            return False
        try:
            self.registration = connection.register_object(
                HELPER_PATH, node.interfaces[0], self._method_call, None, None
            )
        except (GLib.Error, TypeError) as exc:
            print(f"Notch helper: cannot register D-Bus object: {exc}", file=sys.stderr)
            self.registration = None
            return False
        return self.registration is not None and self.registration > 0

    def do_dbus_unregister(self, connection, object_path):
        if self.registration is not None:
            connection.unregister_object(self.registration)
            self.registration = None
        self.connection = None
        Gio.Application.do_dbus_unregister(self, connection, object_path)

    def _emit_shelf(self):
        if self.connection:
            self.connection.emit_signal(
                None,
                HELPER_PATH,
                HELPER_ID,
                "ShelfChanged",
                GLib.Variant("(s)", (self.store.to_json(),)),
            )

    def _method_call(self, connection, sender, path, interface, method, params, invocation):
        self.last_use = time.monotonic()
        try:
            args = params.unpack()
            result = None
            if method == "Ping":
                result = (__version__,)
            elif method == "List":
                result = (self.store.to_json(),)
            elif method == "Add":
                self.store.add(list(args[0]))
                self._emit_shelf()
                result = (self.store.to_json(),)
            elif method == "Remove":
                self.store.remove(args[0])
                self._emit_shelf()
                result = (self.store.to_json(),)
            elif method == "Clear":
                self.store.clear()
                self._emit_shelf()
                result = (self.store.to_json(),)
            elif method == "ShowDropTarget":
                self.show_drop_target(*args)
            elif method == "HideDropTarget":
                if self.window:
                    self.window.hide()
            elif method == "ChooseFiles":
                self.choose_files()
            elif method == "Open":
                self.store.require(args[0])
                if not Gio.AppInfo.launch_default_for_uri(args[0], None):
                    raise RuntimeError("No application is associated with this file")
            elif method == "Reveal":
                self.store.require(args[0])
                self.reveal(args[0])
            elif method == "CopyUri":
                self.store.require(args[0])
                self.copy_uri(args[0])
            else:
                invocation.return_dbus_error(DBUS_ERROR, "Unknown method")
                return
            signature = "(s)" if result is not None else None
            invocation.return_value(GLib.Variant(signature, result) if result is not None else None)
        except (ValueError, RuntimeError, TypeError, OverflowError, OSError) as exc:
            invocation.return_dbus_error(DBUS_ERROR, str(exc))
        except GLib.Error as exc:
            invocation.return_dbus_error(DBUS_ERROR, exc.message)

    def _load_gtk(self):
        if self.gtk is not None:
            return
        gi.require_version("Gtk", "4.0")
        gi.require_version("Gdk", "4.0")
        from gi.repository import Gdk, GObject, Gtk

        Gtk.init()
        self.gtk, self.gdk, self.gobject = Gtk, Gdk, GObject
        css = Gtk.CssProvider()
        css.load_from_data(
            """
            .notch-drop-window { background: #14231d; color: #e4fff1; border: 2px dashed #8ee4c0;
              border-radius: 22px; box-shadow: none; }
            .notch-drop-title { font-size: 20px; font-weight: 700; }
            .notch-drop-detail { color: #acd5be; }
        """.encode()
        )
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    def _make_window(self):
        self._load_gtk()
        Gtk, Gdk = self.gtk, self.gdk
        # This is a Gio.Application (not Gtk.Application), so the window is
        # managed explicitly and the application hold controls process lifetime.
        self.window = Gtk.Window(
            title=DROP_TITLE, decorated=False, resizable=False, deletable=False, hide_on_close=True
        )
        self.window.add_css_class("notch-drop-window")
        content = Gtk.Box(
            orientation=Gtk.Orientation.VERTICAL,
            spacing=12,
            valign=Gtk.Align.CENTER,
            halign=Gtk.Align.CENTER,
            margin_top=24,
            margin_bottom=24,
            margin_start=24,
            margin_end=24,
        )
        image = Gtk.Image.new_from_icon_name("folder-download-symbolic")
        image.set_pixel_size(48)
        content.append(image)
        title = Gtk.Label(label="Drop files to stash", css_classes=["notch-drop-title"])
        content.append(title)
        self.drop_detail = Gtk.Label(
            label="Only shelf references are saved. Originals stay where they are.",
            css_classes=["notch-drop-detail"],
            wrap=True,
            max_width_chars=44,
        )
        content.append(self.drop_detail)
        self.window.set_child(content)
        target = Gtk.DropTarget.new(Gdk.FileList, Gdk.DragAction.COPY)
        target.connect("drop", self._on_drop)
        target.connect("enter", lambda *_: Gdk.DragAction.COPY)
        target.connect(
            "leave",
            lambda *_: self.drop_detail.set_text(
                "Only shelf references are saved. Originals stay where they are."
            ),
        )
        self.window.add_controller(target)
        self.window.connect("close-request", lambda *_: self.window.hide() or True)

    def show_drop_target(self, x, y, width, height):
        if self.window is None:
            self._make_window()
        width = max(160, min(2000, int(width)))
        height = max(100, min(1400, int(height)))
        self.window.set_size_request(width, height)
        self.window.set_default_size(width, height)
        # The extension (compositor) owns positioning; this client never calls localhost/X11.
        self.window.show()

    def _on_drop(self, target, value, x, y):
        file_list = value.get_boxed()
        files = file_list.get_files() if file_list else []
        try:
            self.store.add([file.get_uri() for file in files])
            self._emit_shelf()
            self.drop_detail.set_text("Files stashed. You can release the drag.")
            GLib.idle_add(self._hide_after_drop)
            return True
        except (ValueError, RuntimeError) as exc:
            self.drop_detail.set_text(str(exc))
            return False

    def _hide_after_drop(self):
        if self.window:
            self.window.hide()
        return GLib.SOURCE_REMOVE

    def choose_files(self):
        self._load_gtk()
        if self.dialog is not None:
            return
        self.dialog = self.gtk.FileDialog(
            title="Add files to Notch", accept_label="Stash", modal=False
        )
        self.dialog.open_multiple(None, None, self._files_chosen)

    def _files_chosen(self, dialog, result):
        try:
            files = dialog.open_multiple_finish(result)
            if files:
                self.store.add([files.get_item(i).get_uri() for i in range(files.get_n_items())])
                self._emit_shelf()
        except GLib.Error as exc:
            if not exc.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED):
                print(f"Notch shelf: {exc.message}", file=sys.stderr)
        except (ValueError, RuntimeError) as exc:
            print(f"Notch shelf: {exc}", file=sys.stderr)
        finally:
            self.dialog = None
            self.last_use = time.monotonic()

    def reveal(self, uri):
        # FileManager1 is the standardized way to select a file in its folder.
        self.connection.call(
            "org.freedesktop.FileManager1",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1",
            "ShowItems",
            GLib.Variant("(ass)", ([uri], "")),
            None,
            Gio.DBusCallFlags.NONE,
            2000,
            None,
            self._reveal_finished,
            uri,
        )

    def _reveal_finished(self, connection, result, uri):
        try:
            connection.call_finish(result)
        except GLib.Error:
            parent = Gio.File.new_for_uri(uri).get_parent()
            if parent:
                Gio.AppInfo.launch_default_for_uri(parent.get_uri(), None)

    def copy_uri(self, uri):
        self._load_gtk()
        clipboard = self.gdk.Display.get_default().get_clipboard()
        value = self.gobject.Value(self.gobject.TYPE_STRING)
        value.set_string(uri)
        clipboard.set_content(self.gdk.ContentProvider.new_for_value(value))


def main(argv=None):
    return HelperApplication().run(argv if argv is not None else sys.argv)


if __name__ == "__main__":
    raise SystemExit(main())
