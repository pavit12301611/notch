import json
import unittest

from notch_app.doctor import extension_revision_result


class ExtensionRevisionTests(unittest.TestCase):
    def test_matching_build_passes(self):
        level, name, detail = extension_revision_result(
            json.dumps({"version": "0.1.0", "extensionVersion": 7}), 7
        )
        self.assertEqual(level, "PASS")
        self.assertEqual(name, "Extension build")
        self.assertIn("build 7", detail)

    def test_stale_shell_module_warns_to_log_out(self):
        level, _, detail = extension_revision_result(json.dumps({"extensionVersion": 6}), 7)
        self.assertEqual(level, "WARN")
        self.assertIn("Loaded build 6", detail)
        self.assertIn("installed build 7", detail)
        self.assertIn("Log out", detail)

    def test_legacy_state_without_build_warns(self):
        level, _, detail = extension_revision_result(json.dumps({"version": "0.1.0"}), 7)
        self.assertEqual(level, "WARN")
        self.assertIn("Older Notch code", detail)

    def test_invalid_state_warns(self):
        for payload in ("not json", "[]", "null"):
            with self.subTest(payload=payload):
                level, _, _ = extension_revision_result(payload, 7)
                self.assertEqual(level, "WARN")

    def test_missing_installed_version_warns(self):
        level, _, _ = extension_revision_result(json.dumps({"extensionVersion": 7}), None)
        self.assertEqual(level, "WARN")


if __name__ == "__main__":
    unittest.main()
