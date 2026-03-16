import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dsa_scraper_v3"))

import phase1_download
import phase2_parse


class PhaseRefactorTests(unittest.TestCase):
    def test_normalize_regelwiki_url_encodes_umlauts_in_path(self):
        normalized = phase1_download.normalize_regelwiki_url(
            "https://dsa.ulisses-regelwiki.de/Best_Dämonen.html"
        )

        self.assertEqual(
            normalized,
            "https://dsa.ulisses-regelwiki.de/Best_D%C3%A4monen.html",
        )

    def test_should_skip_url_only_skips_root_suche_page(self):
        self.assertTrue(
            phase1_download.should_skip_url(
                "https://dsa.ulisses-regelwiki.de/suche.html"
            )
        )
        self.assertFalse(
            phase1_download.should_skip_url(
                "https://dsa.ulisses-regelwiki.de/Nahrungssuche.html"
            )
        )
        self.assertFalse(
            phase1_download.should_skip_url(
                "https://dsa.ulisses-regelwiki.de/fokus_Krautersuche.html"
            )
        )

    def test_extract_internal_links_normalizes_unicode_href(self):
        html = '<html><body><a href="Best_Dämonen.html">Daem</a></body></html>'

        links = phase1_download.extract_internal_links(
            html,
            "https://dsa.ulisses-regelwiki.de/bestiarium.html",
        )

        self.assertEqual(
            links,
            {"https://dsa.ulisses-regelwiki.de/Best_D%C3%A4monen.html"},
        )

    def test_is_clearly_broken_url_only_filters_obvious_breakage(self):
        self.assertTrue(
            phase1_download.is_clearly_broken_url(
                "https://dsa.ulisses-regelwiki.de/{{link_url%3A%3A8513?talent=Verkleiden"
            )
        )
        self.assertTrue(
            phase1_download.is_clearly_broken_url(
                "https://dsa.ulisses-regelwiki.de/Epharit-R\ufffdstung"
            )
        )
        self.assertFalse(
            phase1_download.is_clearly_broken_url(
                "https://dsa.ulisses-regelwiki.de/Alraunige_Homunculus.html"
            )
        )

    def test_parse_sitemap_urls_extracts_all_locations(self):
        xml_text = """<?xml version='1.0' encoding='UTF-8'?>
<urlset xmlns='https://www.sitemaps.org/schemas/sitemap/0.9'>
  <url><loc>https://example.com/a</loc></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>
"""

        urls = phase1_download.parse_sitemap_urls(xml_text)

        self.assertEqual(urls, {"https://example.com/a", "https://example.com/b"})

    def test_get_category_seed_urls_merges_matching_sitemap_urls(self):
        sitemap_urls = {
            "https://dsa.ulisses-regelwiki.de/alternative_regeln.html",
            "https://dsa.ulisses-regelwiki.de/zauberauswahl.html",
            "https://dsa.ulisses-regelwiki.de/Fokus_Abschuerfungen.html",
        }

        seed_urls = phase1_download.get_category_seed_urls("rules", ["regel_erlaeuterungen.html"], sitemap_urls)

        self.assertEqual(
            seed_urls,
            [
                "https://dsa.ulisses-regelwiki.de/Fokus_Abschuerfungen.html",
                "https://dsa.ulisses-regelwiki.de/alternative_regeln.html",
                "https://dsa.ulisses-regelwiki.de/regel_erlaeuterungen.html",
            ],
        )

    def test_get_pending_sitemap_ingest_urls_returns_only_uncompleted_urls(self):
        checkpoint = phase1_download.Checkpoint()
        checkpoint.reset()
        checkpoint.completed = {"https://dsa.ulisses-regelwiki.de/already.html"}
        downloader = phase1_download.Downloader(checkpoint, resume=True)
        downloader.sitemap_urls = {
            "https://dsa.ulisses-regelwiki.de/already.html",
            "https://dsa.ulisses-regelwiki.de/missing.html",
            "https://dsa.ulisses-regelwiki.de/Best_Dämonen.html",
        }

        pending_urls = downloader.get_pending_sitemap_ingest_urls()

        self.assertEqual(
            pending_urls,
            [
                "https://dsa.ulisses-regelwiki.de/Best_D%C3%A4monen.html",
                "https://dsa.ulisses-regelwiki.de/missing.html",
            ],
        )

    def test_mark_completed_tracks_sitemap_ingest_crawl_source(self):
        checkpoint = phase1_download.Checkpoint()
        checkpoint.reset()

        checkpoint.mark_completed(
            "https://example.com/sitemap-page",
            phase1_download.config.SITEMAP_INGEST_CATEGORY,
            page_state="content",
            filepath="html/sitemap_ingest/example.html",
        )

        self.assertEqual(
            checkpoint.page_index["https://example.com/sitemap-page"]["crawl_sources"],
            [phase1_download.config.SITEMAP_INGEST_CATEGORY],
        )
        self.assertEqual(
            checkpoint.page_index["https://example.com/sitemap-page"]["category"],
            "unresolved",
        )

    def test_add_crawl_source_updates_existing_page_index_entry(self):
        checkpoint = phase1_download.Checkpoint()
        checkpoint.reset()
        checkpoint.page_index = {
            "https://example.com/a": {
                "url": "https://example.com/a",
                "category": "unresolved",
                "page_state": "content",
                "filepath": "html/magic/a.html",
                "crawl_sources": ["magic"],
                "provisional_category": None,
                "resolved_category": None,
            }
        }

        checkpoint.add_crawl_source("https://example.com/a", "rules")

        self.assertEqual(
            checkpoint.page_index["https://example.com/a"]["crawl_sources"],
            ["magic", "rules"],
        )

    def test_summarize_new_entries_by_category_uses_crawl_sources(self):
        checkpoint = phase1_download.Checkpoint()
        checkpoint.reset()
        checkpoint.page_index = {
            "https://example.com/a": {
                "url": "https://example.com/a",
                "category": "unresolved",
                "page_state": "content",
                "crawl_sources": ["magic", "rules"],
            },
            "https://example.com/b": {
                "url": "https://example.com/b",
                "category": "unresolved",
                "page_state": "crawl_only",
                "crawl_sources": ["magic"],
            },
        }

        summary = phase1_download.summarize_new_entries_by_category(
            checkpoint,
            initial_urls=set(),
            categories=["magic", "rules", "cultures"],
        )

        self.assertEqual(summary, {"magic": 1, "rules": 1, "cultures": 0})

    def test_seed_pending_urls_adds_crawl_source_for_completed_seed(self):
        checkpoint = phase1_download.Checkpoint()
        checkpoint.reset()
        checkpoint.completed = {"https://example.com/hub"}
        checkpoint.page_index = {
            "https://example.com/hub": {
                "url": "https://example.com/hub",
                "category": "unresolved",
                "page_state": "hybrid",
                "filepath": "html/magic/hub.html",
                "crawl_sources": ["magic"],
                "provisional_category": None,
                "resolved_category": None,
            }
        }

        seeded = checkpoint.seed_pending_urls("rules", ["https://example.com/hub"])

        self.assertEqual(seeded, [])
        self.assertEqual(
            checkpoint.page_index["https://example.com/hub"]["crawl_sources"],
            ["magic", "rules"],
        )

    def test_seed_pending_urls_merges_new_seeds_with_existing_pending_urls(self):
        checkpoint = phase1_download.Checkpoint()
        checkpoint.reset()
        checkpoint.pending_urls = {
            "rules": {"https://example.com/existing"}
        }

        seeded = checkpoint.seed_pending_urls(
            "rules",
            ["https://example.com/new", "https://example.com/existing"],
        )

        self.assertEqual(
            seeded,
            ["https://example.com/existing", "https://example.com/new"],
        )
        self.assertEqual(
            checkpoint.pending_urls["rules"],
            {"https://example.com/existing", "https://example.com/new"},
        )

    def test_download_page_retries_plausible_404s(self):
        checkpoint = phase1_download.Checkpoint()
        checkpoint.reset()
        downloader = phase1_download.Downloader(checkpoint, resume=False)
        downloader.fetch_page_once = AsyncMock(
            side_effect=[
                (None, "http_404"),
                (None, "http_404"),
                ("<html></html>", None),
            ]
        )

        async def run_test():
            return await downloader.download_page("https://dsa.ulisses-regelwiki.de/Alraunige_Homunculus.html")

        html, error = phase1_download.asyncio.run(run_test())

        self.assertEqual(html, "<html></html>")
        self.assertIsNone(error)
        self.assertEqual(downloader.fetch_page_once.await_count, 3)

    def test_download_page_skips_retry_for_clearly_broken_404(self):
        checkpoint = phase1_download.Checkpoint()
        checkpoint.reset()
        downloader = phase1_download.Downloader(checkpoint, resume=False)
        downloader.fetch_page_once = AsyncMock(return_value=(None, "http_404"))

        async def run_test():
            return await downloader.download_page("https://dsa.ulisses-regelwiki.de/{{link_url%3A%3A8513?talent=Verkleiden")

        html, error = phase1_download.asyncio.run(run_test())

        self.assertIsNone(html)
        self.assertEqual(error, "http_404_broken_url")
        self.assertEqual(downloader.fetch_page_once.await_count, 1)

    def test_get_parseable_entries_accepts_crawl_source_match(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            html_dir = data_dir / "html" / "magic"
            html_dir.mkdir(parents=True)
            html_file = html_dir / "entry.html"
            html_file.write_text("<html></html>", encoding="utf-8")

            page_index = [
                {
                    "url": "https://example.com/a",
                    "category": "unresolved",
                    "page_state": "content",
                    "filepath": "html/magic/entry.html",
                    "crawl_sources": ["magic"],
                    "provisional_category": None,
                    "resolved_category": None,
                }
            ]
            page_index_file = data_dir / "page_index.json"
            page_index_file.write_text(json.dumps(page_index), encoding="utf-8")

            original_data_dir = phase2_parse.DATA_DIR
            original_page_index_file = phase2_parse.PAGE_INDEX_FILE
            try:
                phase2_parse.DATA_DIR = data_dir
                phase2_parse.PAGE_INDEX_FILE = page_index_file
                entries = phase2_parse.get_parseable_entries("magic")
            finally:
                phase2_parse.DATA_DIR = original_data_dir
                phase2_parse.PAGE_INDEX_FILE = original_page_index_file

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["url"], "https://example.com/a")


if __name__ == "__main__":
    unittest.main()
