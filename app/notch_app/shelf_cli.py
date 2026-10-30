from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import gi

gi.require_version("Gio", "2.0")
gi.require_version("GLib", "2.0")
from gi.repository import Gio, GLib  # noqa: E402

from .config import HELPER_ID, HELPER_PATH  # noqa: E402


def _call(method: str, parameters: GLib.Variant | None = None):
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    result = bus.call_sync(
        HELPER_ID,
        HELPER_PATH,
        HELPER_ID,
        method,
        parameters,
        None,
        Gio.DBusCallFlags.NONE,
        10000,
        None,
    )
    return result.unpack() if result is not None else ()


def _uri(value: str, must_exist: bool = True) -> str:
    if value.startswith("file://"):
        return value
    path = Path(value).expanduser().resolve()
    if must_exist and not path.exists():
        raise ValueError(f"Path does not exist: {path}")
    return path.as_uri()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="notch-shelf",
        description="Add/list/remove Notch Quick stash references without using drag-and-drop.",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    add = sub.add_parser("add", help="Stash local files/directories by path")
    add.add_argument("paths", nargs="+")
    remove = sub.add_parser("remove", help="Remove a stashed reference by path or file:// URI")
    remove.add_argument("uri")
    sub.add_parser("list", help="List stashed references")
    sub.add_parser("clear", help="Remove all shelf references (originals are untouched)")
    sub.add_parser("info", help="Show helper build, storage path and item count")
    args = parser.parse_args(argv)

    try:
        if args.command == "add":
            uris = [_uri(value) for value in args.paths]
            (payload,) = _call("Add", GLib.Variant("(as)", [uris]))
            items = json.loads(payload)
            print(
                f"Stashed {len(uris)} reference(s); shelf now has {len(items)}. Originals unchanged."
            )
        elif args.command == "remove":
            (payload,) = _call("Remove", GLib.Variant("(s)", [_uri(args.uri, must_exist=False)]))
            print(f"Removed. Shelf now has {len(json.loads(payload))} reference(s).")
        elif args.command == "list":
            (payload,) = _call("List")
            items = json.loads(payload)
            if not items:
                print("Shelf is empty.")
            for index, item in enumerate(items, 1):
                print(f"{index}. {item['name']}\n   {item['uri']}")
        elif args.command == "clear":
            _call("Clear")
            print("Shelf references cleared. Original files were not deleted.")
        elif args.command == "info":
            (payload,) = _call("GetInfo")
            print(json.dumps(json.loads(payload), indent=2, ensure_ascii=False))
        return 0
    except (GLib.Error, ValueError, OSError, RuntimeError) as exc:
        message = exc.message if isinstance(exc, GLib.Error) else str(exc)
        print(f"notch-shelf: {message}", file=sys.stderr)
        print(
            "If the helper is offline, run: systemctl --user restart notch-helper.service && notch-doctor",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
