#!/usr/bin/env python3
"""Re-extract links from existing hub HTML files and download missing pages."""

import asyncio
import json
import logging
import random
from pathlib import Path
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import aiohttp

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent
HTML_DIR = BASE_DIR / "data" / "html"
CHECKPOINT_FILE = BASE_DIR / "data" / "checkpoint.json"

BASE_URL = "https://dsa.ulisses-regelwiki.de/"
USER_AGENT = "DSA5WikiScraper/3.0 (Educational/Personal Use)"
REQUEST_DELAY_MIN = 0.2
REQUEST_DELAY_MAX = 0.5

SKIP_PATHS = [
    "/regeln.html",
    "/spezies.html",
    "/kulturen.html",
    "/professionen.html",
    "/sonderfertigkeiten.html",
    "/vor-und-nachteile.html",
    "/magie.html",
    "/goetterwirken.html",
    "/ruestkammer.html",
    "/bestiarium.html",
    "/herbarium.html",
    "/gifteundkrankheiten.html",
    "/wdv18.html",
]

SKIP_PATTERNS = [
    "kontakt.html",
    "impressum",
    "datenschutz",
    "index.html",
    "start.html",
    "javascript:",
    "mailto:",
    "#",
    "suche.html",
    "sitemap",
]


def sanitize_filename(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    if not path:
        path = "index"
    # Replace slashes with underscores to avoid directory issues
    path = path.replace("/", "_")
    query = parsed.query.replace("=", "_").replace("&", "_")
    if query:
        path = f"{path}_{query}"
    return f"{path}.html"


def should_skip_url(url: str) -> bool:
    url_lower = url.lower()
    parsed = urlparse(url)
    path = parsed.path.lower()
    
    for skip_path in SKIP_PATHS:
        if path == skip_path:
            return True
    
    for pattern in SKIP_PATTERNS:
        if pattern.lower() in url_lower:
            return True
    
    return False


def get_base_url_from_html(html: str, fallback_url: str) -> str:
    soup = BeautifulSoup(html, "html5lib")
    base_tag = soup.find("base", href=True)
    if base_tag:
        return base_tag["href"]
    return fallback_url


def extract_internal_links(html: str, base_url: str) -> set[str]:
    soup = BeautifulSoup(html, "html5lib")
    effective_base = get_base_url_from_html(html, base_url)
    
    links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("#") or href.startswith("mailto:") or href.startswith("javascript:"):
            continue
        full_url = urljoin(effective_base, href)
        if full_url.startswith(BASE_URL):
            links.add(full_url)
    return links


def has_content_markers(html: str) -> bool:
    soup = BeautifulSoup(html, "html5lib")
    text = soup.get_text().lower()
    markers = ["Wirkung", "Probe", "Kosten", "Voraussetzungen", "Publikation", 
               "RS", "BE", "TP", "AT", "PA", "LeP", "AsP", "KaP"]
    for marker in markers:
        if marker.lower() in text:
            return True
    return False


def is_hub_page(html: str) -> bool:
    soup = BeautifulSoup(html, "html5lib")
    content_area = soup.find("div", class_="inside")
    if not content_area:
        content_area = soup.find("div", class_="body")
    if not content_area:
        content_area = soup.find("main")
    if not content_area:
        content_area = soup.body if soup.body else soup
    
    links = content_area.find_all("a", href=True)
    internal_count = 0
    for a in links:
        href = a.get("href", "")
        if href and not href.startswith("#") and not href.startswith("mailto:"):
            if BASE_URL in href or not href.startswith("http"):
                internal_count += 1
    
    return internal_count >= 5


def load_checkpoint() -> dict:
    if CHECKPOINT_FILE.exists():
        return json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
    return {"completed": [], "failed": {}, "category_urls": {}}


def save_checkpoint(data: dict):
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def find_all_hub_files() -> list[Path]:
    """Find all hub HTML files in data/html."""
    hub_files = []
    for category_dir in HTML_DIR.iterdir():
        if category_dir.is_dir():
            for html_file in category_dir.glob("*.html"):
                hub_files.append(html_file)
    return hub_files


def extract_links_from_hubs(hub_files: list[Path]) -> tuple[set[str], dict[str, set[str]]]:
    """Extract all links from hub files, categorizing them."""
    all_links = set()
    links_by_hub = {}
    total = len(hub_files)
    
    for i, hub_file in enumerate(hub_files, 1):
        if i % 100 == 0 or i == total:
            logger.info(f"  Processing file {i}/{total}: {hub_file.name}")
        
        html = hub_file.read_text(encoding="utf-8")
        links = extract_internal_links(html, BASE_URL)
        content_links = {link for link in links if not should_skip_url(link)}
        links_by_hub[hub_file.name] = content_links
        all_links.update(content_links)
    
    return all_links, links_by_hub


def categorize_url(url: str) -> str:
    """Determine which category a URL belongs to based on path patterns."""
    path = urlparse(url).path.lower()
    query = urlparse(url).query.lower()
    
    if "zauber=" in query or "zauber.html" in path:
        return "spells"
    elif "zaubertrick=" in query or "zaubertrick.html" in path:
        return "cantrips"
    elif "ritual=" in query or "ritual.html" in path:
        return "rituals"
    elif "liturgie=" in query or "liturgie.html" in path:
        return "liturgies"
    elif "zeremonie=" in query or "zeremonie.html" in path:
        return "ceremonies"
    elif "segen=" in query or "segen.html" in path:
        return "blessings"
    elif "talent=" in query or "talent.html" in path:
        return "talents"
    elif "vorteil=" in query or "vorteil.html" in path:
        return "advantages"
    elif "nachteil=" in query or "nachteil.html" in path:
        return "disadvantages"
    elif "profession" in path or "pro_" in path:
        return "professions"
    elif "kul_" in path or "kultur" in path:
        return "cultures"
    elif "spez_" in path or "spezies" in path:
        return "species"
    elif "sf=" in query or "sonderfertigkeit" in path or "sf_" in path:
        return "special_abilities"
    elif any(x in path for x in ["ruestung", "waffe", "schild", "gegenstand", "helme", "rs_", "rk_"]):
        return "equipment"
    elif "bestiarium" in path or "creature" in query:
        return "bestiarium"
    elif "herbarium" in path:
        return "herbarium"
    elif "gift" in path or "krankheit" in path:
        return "poisons_and_illnesses"
    else:
        return "equipment"


async def download_missing_pages(missing_urls: set[str], checkpoint_data: dict):
    """Download all missing pages."""
    session = aiohttp.ClientSession(
        headers={"User-Agent": USER_AGENT},
        timeout=aiohttp.ClientTimeout(total=30),
    )
    
    completed = set(checkpoint_data.get("completed", []))
    category_urls = {k: set(v) for k, v in checkpoint_data.get("category_urls", {}).items()}
    
    try:
        total = len(missing_urls)
        for i, url in enumerate(sorted(missing_urls), 1):
            if url in completed:
                continue
            
            delay = random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX)
            await asyncio.sleep(delay)
            
            try:
                logger.info(f"[{i}/{total}] Downloading: {url}")
                async with session.get(url) as response:
                    if response.status == 200:
                        html = await response.text(encoding="utf-8", errors="replace")
                        
                        category = categorize_url(url)
                        if is_hub_page(html):
                            category = f"{category}_hubs"
                        
                        filename = sanitize_filename(url)
                        category_dir = HTML_DIR / category
                        category_dir.mkdir(parents=True, exist_ok=True)
                        filepath = category_dir / filename
                        filepath.write_text(html, encoding="utf-8")
                        
                        completed.add(url)
                        if category not in category_urls:
                            category_urls[category] = set()
                        category_urls[category].add(url)
                        
                        logger.info(f"  -> Saved to {category}/{filename}")
                    else:
                        logger.warning(f"  HTTP {response.status}")
                        checkpoint_data["failed"][url] = f"HTTP {response.status}"
            except Exception as e:
                logger.error(f"  Error: {e}")
                checkpoint_data["failed"][url] = str(e)
            
            if i % 50 == 0:
                checkpoint_data["completed"] = list(completed)
                checkpoint_data["category_urls"] = {k: list(v) for k, v in category_urls.items()}
                save_checkpoint(checkpoint_data)
                logger.info(f"  Checkpoint saved ({i} pages)")
    finally:
        await session.close()
    
    checkpoint_data["completed"] = list(completed)
    checkpoint_data["category_urls"] = {k: list(v) for k, v in category_urls.items()}
    save_checkpoint(checkpoint_data)


async def main():
    logger.info("=" * 60)
    logger.info("Finding missing pages by re-extracting links from hubs")
    logger.info("=" * 60)
    
    checkpoint_data = load_checkpoint()
    completed = set(checkpoint_data.get("completed", []))
    logger.info(f"Checkpoint: {len(completed)} URLs already completed")
    
    hub_files = find_all_hub_files()
    logger.info(f"Found {len(hub_files)} HTML files to scan")
    
    all_links, links_by_hub = extract_links_from_hubs(hub_files)
    logger.info(f"Total unique links extracted: {len(all_links)}")
    
    missing_urls = all_links - completed
    logger.info(f"Missing URLs to download: {len(missing_urls)}")
    
    if not missing_urls:
        logger.info("No missing pages found!")
        return
    
    categories_found = {}
    for url in missing_urls:
        cat = categorize_url(url)
        categories_found[cat] = categories_found.get(cat, 0) + 1
    
    logger.info("\nMissing by category:")
    for cat, count in sorted(categories_found.items(), key=lambda x: -x[1]):
        logger.info(f"  {cat}: {count}")
    
    logger.info("\nSample missing URLs:")
    for url in sorted(missing_urls)[:10]:
        logger.info(f"  {url}")
    
    logger.info(f"\nStarting download of {len(missing_urls)} pages...")
    await download_missing_pages(missing_urls, checkpoint_data)
    logger.info("Done!")


if __name__ == "__main__":
    asyncio.run(main())
