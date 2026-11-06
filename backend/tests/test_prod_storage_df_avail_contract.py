"""PROD source-backed df Available compatibility regression (no database writes)."""
from datetime import datetime, timezone
import unittest

from backend.rundeck_prod_monthly_storage import (
    _storage_explicit_available_bytes,
    monthly_storage_evidence,
)

_HOST = "AOPH1PAPPDC"
_MOUNT = "/"
_TOTAL_KB = 83886080
_USED_KB = 63048892
_AVAIL_KB = 20121960


def source_row(*, retained=False, invalid=False):
    details = {
        "_positional": [
            "filesystem", "/dev/mapper/os_vg-os_lv", "btrfs",
            str(_TOTAL_KB), str(_USED_KB), "76", _MOUNT,
        ],
    }
    if retained:
        details["avail_kb"] = "not-a-number" if invalid else str(_AVAIL_KB)
    return {
        "host": _HOST,
        "mount_point": _MOUNT,
        "collected_at": datetime(2026, 9, 20, tzinfo=timezone.utc),
        "total_bytes": _TOTAL_KB * 1024,
        # Historical DB value may be guessed; must never be trusted as df Avail.
        "avail_bytes": (_TOTAL_KB - _USED_KB) * 1024,
        "used_pct": 76,
        "details": details,
    }


class Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class Conn:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, sql, params):
        return Result(self.rows)


def report(row):
    return monthly_storage_evidence("2026-09", Conn([row]), {
        "File System OS": {"host": _HOST, "mount": _MOUNT},
    })["items"][0]


class ProdStorageDfAvailableTests(unittest.TestCase):
    def test_legacy_db_estimate_is_never_exposed_as_df_available(self):
        row = source_row()
        self.assertIsNone(_storage_explicit_available_bytes(row))
        evidence = report(row)
        self.assertEqual(evidence["status"], "COLLECTED")
        self.assertEqual(evidence["availability_source"], "NOT_RETAINED")
        self.assertIsNone(evidence["free_bytes"])
        self.assertEqual(evidence["used_bytes"], _USED_KB * 1024)
        self.assertEqual(evidence["used_pct"], 76)

    def test_source_retained_df_available_populates_production_report(self):
        row = source_row(retained=True)
        observed = _AVAIL_KB * 1024
        self.assertNotEqual(observed, row["avail_bytes"])
        self.assertEqual(_storage_explicit_available_bytes(row), observed)
        evidence = report(row)
        self.assertEqual(evidence["status"], "COLLECTED")
        self.assertEqual(evidence["availability_source"], "EXPLICIT")
        self.assertEqual(evidence["free_bytes"], observed)
        self.assertEqual(evidence["sample_at"], row["collected_at"])

    def test_invalid_df_source_never_falls_back_to_guess(self):
        evidence = report(source_row(retained=True, invalid=True))
        self.assertEqual(evidence["status"], "COLLECTED")
        self.assertEqual(evidence["availability_source"], "NOT_RETAINED")
        self.assertIsNone(evidence["free_bytes"])

    def test_zero_available_is_real_if_explicitly_reported(self):
        row = source_row(retained=True)
        row["details"]["avail_kb"] = "0"
        evidence = report(row)
        self.assertEqual(evidence["status"], "COLLECTED")
        self.assertEqual(evidence["availability_source"], "EXPLICIT")
        self.assertEqual(evidence["free_bytes"], 0)

    def test_all_four_missing_mappings_fail_closed(self):
        result = monthly_storage_evidence("2026-09", Conn([source_row(retained=True)]), {})
        self.assertEqual(result["configured_categories"], 0)
        self.assertTrue(all(item["status"] == "NOT_COLLECTED" for item in result["items"]))
        self.assertTrue(all(item["reason"] == "MAPPING_NOT_CONFIGURED" for item in result["items"]))


if __name__ == "__main__":
    unittest.main()
