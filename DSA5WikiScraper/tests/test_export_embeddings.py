import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dsa_scraper_v3"))

import export_embeddings


class ExportEmbeddingTests(unittest.TestCase):
    def test_build_embedding_text_uses_properties_when_description_empty(self):
        item = {
            "name": "Zäher Hund",
            "url": "https://example.com/a",
            "breadcrumbs": ["DSA Regel-Wiki", "Vor- und Nachteile", "Vorteil"],
            "properties": {
                "Regel": "Der Held ignoriert Schmerz I.",
                "AP-Wert": "20 Abenteuerpunkte",
            },
            "description": "",
            "category": "advantages",
        }

        text = export_embeddings.build_embedding_text(item)
        self.assertIn("Zäher Hund", text)
        self.assertIn("Regel: Der Held ignoriert Schmerz I.", text)
        self.assertIn("AP-Wert: 20 Abenteuerpunkte", text)

    def test_build_embedding_text_uses_extensions(self):
        item = {
            "name": "Test",
            "url": "https://example.com/a",
            "breadcrumbs": ["DSA Regel-Wiki"],
            "properties": {},
            "description": "Beschreibung",
            "extensions": [{"name": "Erweiterung I", "description": "Mehr Wirkung"}],
            "category": "magic",
        }

        text = export_embeddings.build_embedding_text(item)
        self.assertIn("Extensions", text)
        self.assertIn("Erweiterung I", text)
        self.assertIn("Mehr Wirkung", text)

    def test_canonical_doc_keeps_unresolved_items(self):
        inventory = [{
            "url": "https://example.com/a",
            "doc_id": "doc_1",
            "url_hash": "hash1",
            "page_state": "content",
            "crawl_sources": ["professions"],
            "provisional_category": None,
            "resolved_category": None,
            "resolution_confidence": "ambiguous",
            "resolution_evidence": ["breadcrumb_ambiguous"],
            "raw_html_path": "html/a.html",
            "fetched": True,
            "parsed": True,
            "emitted": True,
        }]
        json_outputs = {
            "unresolved": [{
                "id": "professions_Test",
                "category": "unresolved",
                "name": "Test",
                "url": "https://example.com/a",
                "breadcrumbs": ["DSA Regel-Wiki", "Sonderfertigkeiten"],
                "properties": {},
                "description": "Inhalt",
                "resolution_confidence": "ambiguous",
                "resolution_evidence": ["breadcrumb_ambiguous"],
            }]
        }

        docs = export_embeddings.build_canonical_documents_from_records(inventory, json_outputs)
        self.assertEqual(len(docs), 1)
        self.assertTrue(docs[0]["is_unresolved"])
        self.assertTrue(docs[0]["embeddable"])

    def test_zero_information_doc_is_not_embeddable(self):
        inventory = [{
            "url": "https://example.com/a",
            "doc_id": "doc_1",
            "url_hash": "hash1",
            "page_state": "content",
            "crawl_sources": [],
            "provisional_category": None,
            "resolved_category": "rules",
            "resolution_confidence": "medium",
            "resolution_evidence": ["breadcrumb"],
            "raw_html_path": "html/a.html",
            "fetched": True,
            "parsed": True,
            "emitted": True,
        }]
        json_outputs = {
            "rules": [{
                "id": "rules_Test",
                "category": "rules",
                "name": "",
                "url": "https://example.com/a",
                "breadcrumbs": [],
                "properties": {},
                "description": "",
            }]
        }

        docs = export_embeddings.build_canonical_documents_from_records(inventory, json_outputs)
        self.assertIn("Category: rules", docs[0]["embedding_text"])
        self.assertFalse(docs[0]["embeddable"])

    def test_chunk_generation_is_deterministic_and_metadata_preserving(self):
        doc = {
            "doc_id": "doc_1",
            "url": "https://example.com/a",
            "category": "magic",
            "resolved_category": "magic",
            "title": "Test",
            "embedding_text": "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
            "embeddable": True,
            "page_state": "content",
            "resolution_confidence": "high",
            "is_unresolved": False,
            "breadcrumbs": ["DSA Regel-Wiki", "Magie"],
            "source_item_id": "magic_Test",
        }

        chunks = export_embeddings.build_chunks([doc], max_chars=20, overlap_chars=5)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertEqual(chunks[0]["doc_id"], "doc_1")
        self.assertEqual(chunks[0]["chunk_index"], 0)
        self.assertTrue(chunks[0]["chunk_id"].startswith("doc_1_chunk_"))
        self.assertLessEqual(len(chunks[0]["chunk_text"]), 20)
        self.assertIn("is_unresolved", chunks[0])
        self.assertIn("source_item_id", chunks[0])

    def test_long_paragraph_is_hard_split(self):
        long_text = "A" * 45
        chunks = export_embeddings.split_text(long_text, max_chars=20, overlap_chars=5)
        self.assertGreaterEqual(len(chunks), 3)
        self.assertTrue(all(len(chunk_text) <= 20 for _, _, chunk_text in chunks))


if __name__ == "__main__":
    unittest.main()
