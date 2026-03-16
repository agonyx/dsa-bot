#!/usr/bin/env python3
import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from phase1_download import run_phase1, run_phase1_explicit
from phase2_parse import run_phase2, run_phase2_explicit
from audit import format_audit_report, run_audit
from export_embeddings import export_embeddings

DATA_DIR = Path(__file__).parent / "data"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(DATA_DIR / "scraper.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="DSA 5 Wiki Scraper - Two Phase Approach",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run.py --phase both --categories spells
  python run.py --phase 1 --categories spells,talents --resume
  python run.py --phase 2 --categories all
  python run.py --phase audit --explicit
  python run.py --phase export
        """,
    )

    parser.add_argument(
        "--phase",
        type=str,
        choices=["1", "2", "both", "audit", "export"],
        default="both",
        help="Which phase to run: 1=download, 2=parse, both=both phases, audit=coverage audit only, export=embedding export only",
    )

    parser.add_argument(
        "--categories",
        type=str,
        default=None,
        help="Comma-separated list of categories (e.g., spells,talents). Default: all categories",
    )

    parser.add_argument(
        "--resume",
        action="store_true",
        default=True,
        help="Resume from checkpoint (default: True)",
    )

    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Start fresh, ignore checkpoint",
    )

    parser.add_argument(
        "--list-categories",
        action="store_true",
        help="List available categories and exit",
    )

    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )

    parser.add_argument(
        "--explicit",
        action="store_true",
        help="Use explicit URL lists from explicit_urls.py instead of hub discovery",
    )

    parser.add_argument(
        "--audit",
        action="store_true",
        help="Build audit reports from existing scraper outputs",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.list_categories:
        if args.explicit:
            import explicit_urls
            print("Available explicit categories:")
            for cat in sorted(explicit_urls.EXPLICIT_HUBS.keys()):
                print(f"  - {cat}")
        else:
            import config
            print("Available categories:")
            for cat in sorted(config.CATEGORIES.keys()):
                print(f"  - {cat}")
        return 0

    categories = None
    if args.categories:
        categories = [c.strip() for c in args.categories.split(",")]
        if categories == ["all"]:
            categories = None

    resume = not args.no_resume
    phase = args.phase

    logger.info(f"Starting DSA 5 Wiki Scraper")
    logger.info(f"Phase: {phase}")
    logger.info(f"Categories: {categories or 'all'}")
    logger.info(f"Resume: {resume}")

    try:
        ran_phase = False
        if phase in ["1", "both"]:
            ran_phase = True
            logger.info("=" * 50)
            logger.info("PHASE 1: Downloading HTML files")
            logger.info("=" * 50)
            
            if args.explicit:
                download_results = asyncio.run(run_phase1_explicit(categories, resume))
            else:
                download_results = asyncio.run(run_phase1(categories, resume))

            total_success = sum(s for s, _ in download_results.values())
            total_fail = sum(f for _, f in download_results.values())
            logger.info(f"Phase 1 complete: {total_success} success, {total_fail} failed")

            for cat, (success, fail) in sorted(download_results.items()):
                logger.info(f"  {cat}: {success} downloaded, {fail} failed")

        if phase in ["2", "both"]:
            ran_phase = True
            logger.info("=" * 50)
            logger.info("PHASE 2: Parsing HTML to JSON")
            logger.info("=" * 50)
            
            if args.explicit:
                parse_results = run_phase2_explicit(categories)
            else:
                parse_results = run_phase2(categories)

            total_items = sum(parse_results.values())
            logger.info(f"Phase 2 complete: {total_items} items parsed")

            for cat, count in sorted(parse_results.items()):
                logger.info(f"  {cat}: {count} items")

        if phase == "export":
            ran_phase = True
            logger.info("=" * 50)
            logger.info("EXPORT: Building embedding-ready corpus")
            logger.info("=" * 50)
            export_summary = export_embeddings(categories=categories)
            logger.info(
                "Export complete: docs=%s chunks=%s unresolved=%s failed_urls=%s",
                export_summary["doc_count"],
                export_summary["chunk_count"],
                export_summary["unresolved_doc_count"],
                export_summary["failed_url_count"],
            )

        if args.audit or phase == "audit":
            logger.info("=" * 50)
            logger.info("AUDIT: Building coverage reports")
            logger.info("=" * 50)
            audit_report = run_audit(categories)
            logger.info(format_audit_report(audit_report))
            if audit_report["has_errors"]:
                logger.error("Audit detected hard errors")
                return 2

        logger.info("=" * 50)
        logger.info("Scraping complete!")
        logger.info("=" * 50)

        return 0

    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
