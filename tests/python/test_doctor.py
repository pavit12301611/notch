import json
import unittest

from notch_app.config import UUID
from notch_app.doctor import (
    extension_registration_result,
    extension_revision_result,
    helper_revision_result,
)


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


class ShellRegistrationTests(unittest.TestCase):
    def test_unknown_extension_means_session_has_not_discovered_files(self):
        level, name, detail = extension_registration_result({}, 14)
        self.assertEqual(level, "FAIL")
        self.assertEqual(name, "Shell registration")
        self.assertIn("Log out/in", detail)

    def test_active_matching_build_passes(self):
        level, _, detail = extension_registration_result(
            {"uuid": UUID, "state": 1, "version": 14}, 14
        )
        self.assertEqual(level, "PASS")
        self.assertIn("active", detail)

    def test_dbus_double_build_number_matches_integer_metadata(self):
        level, _, _ = extension_registration_result(
            {"uuid": UUID, "state": 1.0, "version": 14.0}, 14
        )
        self.assertEqual(level, "PASS")

    def test_load_error_is_reported(self):
        level, _, detail = extension_registration_result(
            {"uuid": UUID, "state": 3, "error": "Failed to parse metadata.json"}, 14
        )
        self.assertEqual(level, "FAIL")
        self.assertIn("metadata.json", detail)

    def test_stale_shell_registration_warns_to_log_out(self):
        level, _, detail = extension_registration_result(
            {"uuid": UUID, "state": 1, "version": 13}, 14
        )
        self.assertEqual(level, "WARN")
        self.assertIn("Log out/in", detail)


class HelperRevisionTests(unittest.TestCase):
    def test_matching_helper_build_passes(self):
        level, name, detail = helper_revision_result(
            json.dumps({"build": 10, "itemCount": 2, "shelfPath": "/tmp/shelf.json"}), 10
        )
        self.assertEqual(level, "PASS")
        self.assertEqual(name, "Helper build")
        self.assertIn("2 stashed", detail)

    def test_old_helper_warns_to_restart(self):
        level, _, detail = helper_revision_result(json.dumps({"build": 9}), 10)
        self.assertEqual(level, "WARN")
        self.assertIn("Restart", detail)

    def test_legacy_helper_without_build_warns(self):
        level, _, detail = helper_revision_result("{}", 10)
        self.assertEqual(level, "WARN")
        self.assertIn("Older helper", detail)

    def test_corrupt_shelf_fails(self):
        level, _, detail = helper_revision_result(
            json.dumps({"build": 10, "loadError": "bad json"}), 10
        )
        self.assertEqual(level, "FAIL")
        self.assertIn("repair", detail)


if __name__ == "__main__":
    unittest.main()
