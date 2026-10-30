import json
import stat
import tempfile
import unittest
from pathlib import Path

from notch_app.config import MAX_ITEMS
from notch_app.storage import ShelfStore


class ShelfStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.path = self.root / "state/shelf.json"
        self.store = ShelfStore(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_add_persists_references_not_contents(self):
        original = self.root / "original.txt"
        original.write_text("original content")
        self.store.add([original.as_uri()])
        reloaded = ShelfStore(self.path)
        self.assertEqual(reloaded.items[0]["uri"], original.as_uri())
        self.assertEqual(reloaded.items[0]["name"], "original.txt")
        self.assertEqual(original.read_text(), "original content")
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(list(self.path.parent.glob("*.tmp")), [])

    def test_deduplication_and_bound(self):
        uris = [(self.root / f"{i}.txt").as_uri() for i in range(MAX_ITEMS + 5)]
        self.store.add(uris[:MAX_ITEMS])
        self.store.add(uris[MAX_ITEMS:])
        self.assertEqual(len(self.store.items), MAX_ITEMS)
        self.store.add([uris[0]])
        self.assertEqual(self.store.items[0]["uri"], uris[0])
        self.assertEqual(len(self.store.items), MAX_ITEMS)

    def test_rejects_remote_and_malformed_uris(self):
        for uri in [
            "https://example.com/file",
            "file://remote/share/a",
            "file:relative",
            "",
            "a" * 9000,
        ]:
            with self.subTest(uri=uri), self.assertRaises(ValueError):
                self.store.add([uri])
        self.assertFalse(self.path.exists())

    def test_remove_and_clear_never_touch_originals(self):
        original = self.root / "keep.txt"
        original.write_text("keep")
        self.store.add([original.as_uri()])
        self.store.remove(original.as_uri())
        self.assertTrue(original.exists())
        self.store.add([original.as_uri()])
        self.store.clear()
        self.assertTrue(original.exists())
        self.assertEqual(ShelfStore(self.path).items, [])
        with self.assertRaises(ValueError):
            self.store.remove(original.as_uri())

    def test_corrupt_store_is_not_overwritten(self):
        self.path.parent.mkdir(parents=True)
        self.path.write_text("not json")
        store = ShelfStore(self.path)
        self.assertIsNotNone(store.load_error)
        with self.assertRaises(RuntimeError):
            store.add([(self.root / "file").as_uri()])
        self.assertEqual(self.path.read_text(), "not json")

    def test_unsupported_version_is_preserved(self):
        self.path.parent.mkdir(parents=True)
        self.path.write_text(json.dumps({"version": 99, "items": []}))
        store = ShelfStore(self.path)
        with self.assertRaises(RuntimeError):
            store.clear()
        self.assertEqual(json.loads(self.path.read_text())["version"], 99)

    def test_unicode_names_round_trip(self):
        uri = (self.root / "संगीत 🎵.txt").as_uri()
        self.store.add([uri])
        self.assertEqual(ShelfStore(self.path).items[0]["name"], "संगीत 🎵.txt")
        self.assertIn("संगीत", self.store.to_json())


if __name__ == "__main__":
    unittest.main()
