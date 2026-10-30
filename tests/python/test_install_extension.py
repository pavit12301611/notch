import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from notch_app.config import UUID

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/install_extension.py"


def make_source(root: Path, version: int = 14, uuid: str = UUID) -> Path:
    source = root / "source"
    (source / "schemas").mkdir(parents=True)
    (source / "metadata.json").write_text(
        json.dumps(
            {
                "uuid": uuid,
                "name": "Notch",
                "description": "test",
                "version": version,
                "shell-version": ["50"],
            }
        )
    )
    for name in ("extension.js", "prefs.js", "stylesheet.css"):
        (source / name).write_text("// test\n")
    (source / "schemas/test.gschema.xml").write_text("<schemalist/>\n")
    return source


def run_install(source: Path, data_dir: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--source",
            str(source),
            "--data-dir",
            str(data_dir),
            "--uuid",
            UUID,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


class AtomicExtensionInstallTests(unittest.TestCase):
    def test_fresh_install_publishes_complete_payload(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = make_source(root)
            data_dir = root / "data"
            result = run_install(source, data_dir)
            self.assertEqual(result.returncode, 0, result.stderr)
            target = data_dir / "gnome-shell/extensions" / UUID
            self.assertEqual(json.loads((target / "metadata.json").read_text())["version"], 14)
            self.assertTrue((target / "extension.js").is_file())
            self.assertTrue((target / "schemas/test.gschema.xml").is_file())

    def test_upgrade_replaces_stale_files_and_preserves_complete_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data_dir = root / "data"
            target = data_dir / "gnome-shell/extensions" / UUID
            target.mkdir(parents=True)
            (target / "metadata.json").write_text('{"uuid": "old", "version": 13}')
            (target / "stale.js").write_text("old")
            source = make_source(root, version=14)
            result = run_install(source, data_dir)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads((target / "metadata.json").read_text())["version"], 14)
            self.assertFalse((target / "stale.js").exists())

    def test_invalid_source_does_not_touch_existing_install(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data_dir = root / "data"
            target = data_dir / "gnome-shell/extensions" / UUID
            target.mkdir(parents=True)
            original = '{"uuid": "old", "version": 13}'
            (target / "metadata.json").write_text(original)
            source = make_source(root, uuid="wrong@example.com")
            result = run_install(source, data_dir)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((target / "metadata.json").read_text(), original)

    def test_stale_transaction_backup_is_recovered_before_new_install(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data_dir = root / "data"
            shell_dir = data_dir / "gnome-shell"
            previous = shell_dir / f".{UUID}.install-old/previous"
            previous.mkdir(parents=True)
            (previous / "metadata.json").write_text(json.dumps({"uuid": UUID, "version": 13}))
            source = make_source(root, version=14)
            result = run_install(source, data_dir)
            self.assertEqual(result.returncode, 0, result.stderr)
            target = shell_dir / "extensions" / UUID
            self.assertEqual(json.loads((target / "metadata.json").read_text())["version"], 14)
            self.assertFalse((shell_dir / f".{UUID}.install-old").exists())

    def test_makefile_uses_atomic_publisher_for_metadata(self):
        makefile = (ROOT / "Makefile").read_text()
        self.assertIn("scripts/install_extension.py", makefile)
        self.assertNotIn("install -m644 extension/extension.js", makefile)
        installer = (ROOT / "install.sh").read_text()
        self.assertIn("XDG_DATA_HOME", installer)
        self.assertIn('DATADIR="$DATADIR"', installer)


if __name__ == "__main__":
    unittest.main()
