from __future__ import annotations

import sys
import tempfile
import types
import unittest
from pathlib import Path


class _Error(Exception):
    pass


class _Variant:
    def __init__(self, signature, args):
        self.signature = signature
        self.args = args


class _Application:
    def __init__(self, *args, **kwargs):
        pass


def _install_gi_stubs():
    gi = types.ModuleType("gi")
    gi.require_version = lambda *args: None
    repository = types.ModuleType("gi.repository")
    gio = types.ModuleType("gi.repository.Gio")
    gio.Application = _Application
    gio.ApplicationFlags = types.SimpleNamespace(FLAGS_NONE=0)
    gio.IOErrorEnum = types.SimpleNamespace(CANCELLED=19)
    glib = types.ModuleType("gi.repository.GLib")
    glib.Error = _Error
    glib.Variant = _Variant
    glib.SOURCE_REMOVE = False
    glib.timeouts = []
    glib.timeout_add = lambda delay, callback: glib.timeouts.append((delay, callback)) or 99
    glib.source_remove = lambda source: None
    repository.Gio = gio
    repository.GLib = glib
    gi.repository = repository
    sys.modules.setdefault("gi", gi)
    sys.modules.setdefault("gi.repository", repository)
    sys.modules.setdefault("gi.repository.Gio", gio)
    sys.modules.setdefault("gi.repository.GLib", glib)
    return glib


GLIB = _install_gi_stubs()

from notch_app.helper import HelperApplication  # noqa: E402
from notch_app.storage import ShelfStore  # noqa: E402


class Connection:
    def __init__(self):
        self.signals = []

    def emit_signal(self, bus, path, interface, name, variant):
        self.signals.append((name, variant.signature, variant.args))


class Card:
    def __init__(self):
        self.classes = set()

    def add_css_class(self, name):
        self.classes.add(name)

    def remove_css_class(self, name):
        self.classes.discard(name)

    def has_css_class(self, name):
        return name in self.classes


class Widget:
    def __init__(self):
        self.text = ""

    def set_text(self, text):
        self.text = text

    def set_from_icon_name(self, name):
        self.text = name


class Window:
    def __init__(self):
        self.size = None
        self.visible = False

    def set_size_request(self, width, height):
        self.size = (width, height)

    def set_default_size(self, width, height):
        self.default = (width, height)

    def show(self):
        self.visible = True

    def hide(self):
        self.visible = False


class File:
    def __init__(self, uri):
        self.uri = uri

    def get_uri(self):
        return self.uri


class FileList:
    def __init__(self, files):
        self.files = files

    def get_files(self):
        return self.files


class Value:
    def __init__(self, files):
        self.files = files

    def get_boxed(self):
        return FileList(self.files) if self.files is not None else None


class HelperDropTests(unittest.TestCase):
    def make_helper(self, root):
        app = HelperApplication.__new__(HelperApplication)
        app.store = ShelfStore(Path(root) / "shelf.json")
        app.connection = Connection()
        app.drop_card = Card()
        app.drop_icon = Widget()
        app.drop_title = Widget()
        app.drop_detail = Widget()
        app.window = Window()
        app._hide_source = None
        return app

    def test_drop_stashes_references_and_emits_completion(self):
        with tempfile.TemporaryDirectory() as root:
            app = self.make_helper(root)
            ok = app._on_drop(
                None, Value([File("file:///tmp/one.txt"), File("file:///tmp/two.txt")]), 0, 0
            )
            self.assertTrue(ok)
            self.assertEqual(len(app.store.items), 2)
            self.assertIn("notch-drop-success", app.drop_card.classes)
            self.assertEqual(app.drop_title.text, "Stashed")
            names = [signal[0] for signal in app.connection.signals]
            self.assertEqual(names, ["ShelfChanged", "DropCompleted"])
            self.assertEqual(app.connection.signals[-1][1], "(si)")
            self.assertEqual(app.connection.signals[-1][2][1], 2)
            self.assertEqual(GLIB.timeouts[-1][0], 700)

    def test_invalid_drop_reports_failure_without_saving(self):
        with tempfile.TemporaryDirectory() as root:
            app = self.make_helper(root)
            ok = app._on_drop(None, Value([File("https://example.com/file")]), 0, 0)
            self.assertFalse(ok)
            self.assertEqual(app.store.items, [])
            self.assertIn("notch-drop-error", app.drop_card.classes)
            self.assertEqual(app.connection.signals[-1][0], "DropFailed")

    def test_drop_target_is_clamped_and_reset(self):
        with tempfile.TemporaryDirectory() as root:
            app = self.make_helper(root)
            app.drop_card.add_css_class("notch-drop-success")
            app.show_drop_target(0, 0, 10, 10)
            self.assertEqual(app.window.size, (160, 120))
            self.assertTrue(app.window.visible)
            self.assertNotIn("notch-drop-success", app.drop_card.classes)
            self.assertEqual(app.drop_title.text, "Drop to Quick stash")


if __name__ == "__main__":
    unittest.main()
