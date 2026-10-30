from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from .config import MAX_ITEMS, MAX_URI_LENGTH


class ShelfStore:
    """Bounded, atomic metadata storage. Never copies, moves or deletes source files."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.items: list[dict[str, Any]] = []
        self.load_error: str | None = None
        self.load()

    @staticmethod
    def valid_uri(uri: Any) -> bool:
        if not isinstance(uri, str) or not uri or len(uri) > MAX_URI_LENGTH:
            return False
        try:
            parsed = urlsplit(uri)
            return (
                parsed.scheme == "file"
                and parsed.netloc in ("", "localhost")
                and parsed.path.startswith("/")
                and not parsed.query
                and not parsed.fragment
                and "\x00" not in uri
                and unquote(parsed.path).startswith("/")
            )
        except ValueError:
            return False

    def load(self) -> None:
        self.load_error = None
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if (
                not isinstance(raw, dict)
                or raw.get("version") != 1
                or not isinstance(raw.get("items"), list)
            ):
                raise ValueError("unsupported shelf format")
            items = []
            seen = set()
            for item in raw["items"][:MAX_ITEMS]:
                if not isinstance(item, dict) or not self.valid_uri(item.get("uri")):
                    raise ValueError("invalid shelf reference")
                if not isinstance(item.get("name"), str) or len(item["name"]) > 1024:
                    raise ValueError("invalid shelf name")
                if item["uri"] in seen:
                    continue
                seen.add(item["uri"])
                items.append(
                    {"uri": item["uri"], "name": item["name"], "added": int(item.get("added", 0))}
                )
            self.items = items
        except FileNotFoundError:
            self.items = []
        except (OSError, ValueError, TypeError, OverflowError) as exc:
            # Do not overwrite an unreadable/corrupt store on the next Add operation.
            self.items = []
            self.load_error = str(exc)

    def _check_writable(self) -> None:
        if self.load_error:
            raise RuntimeError(
                f"Shelf storage needs repair: {self.path}. Original files are untouched."
            )

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        payload = {"version": 1, "items": self.items}
        fd, temporary = tempfile.mkstemp(prefix=".shelf-", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(payload, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temporary, 0o600)
            os.replace(temporary, self.path)
        finally:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass

    def add(self, uris: list[str]) -> int:
        self._check_writable()
        if len(uris) > MAX_ITEMS:
            raise ValueError(f"At most {MAX_ITEMS} files can be added at once")
        for uri in uris:
            if not self.valid_uri(uri):
                raise ValueError("Only local file URIs can be stashed")
        added = 0
        now = int(time.time())
        for uri in reversed(uris):
            existing = next((item for item in self.items if item["uri"] == uri), None)
            if existing:
                self.items.remove(existing)
            name = unquote(urlsplit(uri).path).rsplit("/", 1)[-1] or "/"
            self.items.insert(0, {"uri": uri, "name": name[:1024], "added": now})
            added += 1
        self.items = self.items[:MAX_ITEMS]
        self._save()
        return added

    def require(self, uri: str) -> dict[str, Any]:
        item = next((item for item in self.items if item["uri"] == uri), None)
        if item is None:
            raise ValueError("That file is not on the shelf")
        return item

    def remove(self, uri: str) -> None:
        self._check_writable()
        self.require(uri)
        self.items = [item for item in self.items if item["uri"] != uri]
        self._save()

    def clear(self) -> None:
        self._check_writable()
        self.items = []
        self._save()

    def to_json(self) -> str:
        return json.dumps(self.items, ensure_ascii=False)
