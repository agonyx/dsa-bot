import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dsa_scraper_v3"))

import audit


class AuditTests(unittest.TestCase):
    def test_effective_category_prefers_resolved(self):
        entry = {"category": "magic", "resolved_category": "rules"}
        self.assertEqual(audit.effective_category(entry), "rules")

    def test_missing_from_json_detected(self):
        checkpoint = {"completed": [], "failed": {}}
        page_index = [{
            "url": "https://example.com/a",
            "category": "magic",
            "page_state": "content",
        }]
        json_outputs = {"magic": []}

        report = audit.build_audit_report(checkpoint, page_index, json_outputs)
        self.assertIn("missing_from_json", report["details"]["hard_errors"])

    def test_orphan_json_detected(self):
        checkpoint = {"completed": [], "failed": {}}
        page_index = []
        json_outputs = {"magic": [{"url": "https://example.com/a", "name": "A"}]}

        report = audit.build_audit_report(checkpoint, page_index, json_outputs)
        self.assertIn("orphan_json", report["details"]["hard_errors"])

    def test_duplicate_url_across_files_detected(self):
        checkpoint = {"completed": [], "failed": {}}
        page_index = [{
            "url": "https://example.com/a",
            "category": "magic",
            "page_state": "content",
        }]
        json_outputs = {
            "magic": [{"url": "https://example.com/a", "name": "A"}],
            "rules": [{"url": "https://example.com/a", "name": "A"}],
        }

        report = audit.build_audit_report(checkpoint, page_index, json_outputs)
        self.assertIn("duplicate_url_across_files", report["details"]["hard_errors"])

    def test_category_mismatch_detected(self):
        checkpoint = {"completed": [], "failed": {}}
        page_index = [{
            "url": "https://example.com/a",
            "category": "magic",
            "resolved_category": "magic",
            "page_state": "content",
        }]
        json_outputs = {
            "rules": [{"url": "https://example.com/a", "name": "A"}],
        }

        report = audit.build_audit_report(checkpoint, page_index, json_outputs)
        self.assertIn("category_mismatch", report["details"]["hard_errors"])

    def test_selected_category_filter(self):
        page_index = [
            {"url": "https://example.com/a", "category": "magic", "page_state": "content"},
            {"url": "https://example.com/b", "category": "rules", "page_state": "content"},
        ]

        inventory = audit.build_expected_inventory(page_index, ["magic"])
        self.assertEqual(set(inventory), {"https://example.com/a"})

    def test_selected_category_ignores_unrelated_unresolved(self):
        checkpoint = {"completed": [], "failed": {}}
        page_index = [{
            "url": "https://example.com/a",
            "category": "magic",
            "page_state": "content",
        }]
        json_outputs = {
            "magic": [{"url": "https://example.com/a", "name": "A"}],
            "unresolved": [{"url": "https://example.com/b", "name": "B"}],
        }

        report = audit.build_audit_report(checkpoint, page_index, json_outputs, ["magic"])
        self.assertNotIn("orphan_json", report["details"]["hard_errors"])

    def test_discovery_gaps_detect_completed_without_page_index(self):
        inventory = []
        checkpoint = {"completed": ["https://example.com/a"], "failed": {}}
        page_index = []

        gaps = audit.build_discovery_gaps(inventory, checkpoint, page_index)
        self.assertEqual(gaps, [{"url": "https://example.com/a", "reason": "completed_without_page_index"}])

    def test_deferred_resolution_allows_crawl_source_category_in_audit(self):
        checkpoint = {"completed": [], "failed": {}}
        page_index = [{
            "url": "https://example.com/a",
            "category": "unresolved",
            "page_state": "content",
            "crawl_sources": ["magic", "rules"],
        }]
        json_outputs = {
            "magic": [{"url": "https://example.com/a", "name": "A"}],
        }

        report = audit.build_audit_report(checkpoint, page_index, json_outputs)
        self.assertNotIn("category_mismatch", report["details"]["hard_errors"])

    def test_url_hash_is_stable_sha256(self):
        url_hash = audit.make_url_hash("https://example.com/a")
        self.assertEqual(len(url_hash), 64)
        self.assertEqual(url_hash, audit.make_url_hash("https://example.com/a"))


if __name__ == "__main__":
    unittest.main()
