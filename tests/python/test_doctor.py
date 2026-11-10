import json
import unittest
from unittest import mock

from notch_app.config import UUID
from notch_app.doctor import (
    extension_registration_result,
    extension_revision_result,
    inspect_legacy_artifacts,
    legacy_artifacts,
)


class ExtensionRevisionTests(unittest.TestCase):
    def test_matching_build_passes(self):
        level, name, detail = extension_revision_result(json.dumps({"extensionVersion": 22}), 22)
        self.assertEqual(level, "PASS")
        self.assertEqual(name, "Extension build")
        self.assertIn("22", detail)

    def test_old_build_warns_to_log_out(self):
        level, _, detail = extension_revision_result(json.dumps({"extensionVersion": 21}), 22)
        self.assertEqual(level, "WARN")
        self.assertIn("Log out", detail)

    def test_legacy_state_without_build_warns(self):
        level, _, detail = extension_revision_result("{}", 22)
        self.assertEqual(level, "WARN")
        self.assertIn("Older Notch", detail)

    def test_invalid_state_warns(self):
        level, _, _ = extension_revision_result("not json", 22)
        self.assertEqual(level, "WARN")


class ShellRegistrationTests(unittest.TestCase):
    def test_unknown_extension_means_session_has_not_discovered_files(self):
        level, name, detail = extension_registration_result({}, 22)
        self.assertEqual(level, "FAIL")
        self.assertEqual(name, "Shell registration")
        self.assertIn("Log out/in", detail)

    def test_active_matching_build_passes(self):
        level, _, detail = extension_registration_result(
            {"uuid": UUID, "state": 1, "version": 22}, 22
        )
        self.assertEqual(level, "PASS")
        self.assertIn("active", detail)

    def test_dbus_double_build_number_matches_integer_metadata(self):
        level, _, detail = extension_registration_result(
            {"uuid": UUID, "state": 1.0, "version": 22.0}, 22
        )
        self.assertEqual(level, "PASS")

    def test_load_error_is_reported(self):
        level, _, detail = extension_registration_result(
            {"uuid": UUID, "state": 3, "error": "Failed to parse metadata.json"}, 22
        )
        self.assertEqual(level, "FAIL")
        self.assertIn("metadata.json", detail)

    def test_stale_shell_registration_warns_to_log_out(self):
        level, _, detail = extension_registration_result(
            {"uuid": UUID, "state": 1, "version": 21}, 22
        )
        self.assertEqual(level, "WARN")
        self.assertIn("Log out/in", detail)


class LegacyArtifactTests(unittest.TestCase):
    def test_clean_install_passes(self):
        with mock.patch("notch_app.doctor.legacy_artifacts", return_value=[]):
            results = inspect_legacy_artifacts()
        self.assertEqual(results[0][0], "PASS")
        self.assertIn("No clipboard/shelf", results[0][2])

    def test_leftover_helper_warns(self):
        with mock.patch("notch_app.doctor.legacy_artifacts", return_value=["/tmp/notch-helper"]):
            results = inspect_legacy_artifacts()
        self.assertEqual(results[0][0], "WARN")
        self.assertIn("install.sh", results[0][2])

    def test_legacy_artifacts_is_a_list(self):
        self.assertIsInstance(legacy_artifacts(), list)


if __name__ == "__main__":
    unittest.main()
