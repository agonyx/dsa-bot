import asyncio
import json
import logging
import os
import random
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional
from urllib.parse import quote, urljoin, urlparse, urlsplit, urlunsplit, parse_qs, unquote

import aiohttp
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
import category_resolution
from cli_progress import LiveStats, ProgressAwareStreamHandler
import config
import explicit_urls

DATA_DIR = Path(__file__).parent / "data"
HTML_DIR = DATA_DIR / "html"
CHECKPOINT_FILE = DATA_DIR / "checkpoint.json"
PAGE_INDEX_FILE = DATA_DIR / "page_index.json"


def atomic_write_json(filepath: Path, data: object):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    temp_path = filepath.with_suffix(filepath.suffix + ".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(temp_path, filepath)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        ProgressAwareStreamHandler(),
        logging.FileHandler(DATA_DIR / "scraper.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def sanitize_filename(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.replace("/", "_").strip("_")
    query = parsed.query.replace("/", "_").replace("=", "_")
    filename = f"{path}_{query}" if query else path
    filename = unquote(filename)
    filename = re.sub(r'[<>:"/\\|?*]', "_", filename)
    return filename[:200] + ".html"


def should_skip_url(url: str) -> bool:
    """Skip external links and global noise pages."""
    url_lower = url.lower()
    
    # Skip external domains
    if not url_lower.startswith(config.BASE_URL.lower()):
        return True

    # Skip anchors, mailto, javascript, and known global utility pages.
    parsed = urlsplit(url)
    path_lower = parsed.path.lower()
    for pattern in config.SKIP_PATTERNS:
        pattern_lower = pattern.lower()
        if pattern_lower == "suche.html":
            if path_lower.endswith("/suche.html") or path_lower == "/suche.html":
                return True
            continue
        if pattern_lower in url_lower:
            return True
    
    return False


def normalize_regelwiki_url(url: str) -> str:
    parts = urlsplit(url)
    normalized_path = quote(parts.path, safe="/%")
    normalized_query = quote(parts.query, safe="=&%+/:()-")
    normalized_fragment = quote(parts.fragment, safe="")
    return urlunsplit((parts.scheme, parts.netloc, normalized_path, normalized_query, normalized_fragment))


def get_base_url_from_html(html: str, fallback_url: str) -> str:
    """Extract base URL from HTML's <base> tag, or fallback to the page URL."""
    soup = BeautifulSoup(html, "html5lib")
    base_tag = soup.find("base", href=True)
    if base_tag:
        return str(base_tag["href"])
    return fallback_url


def get_base_url_from_soup(soup: BeautifulSoup, fallback_url: str) -> str:
    base_tag = soup.find("base", href=True)
    if base_tag:
        return str(base_tag["href"])
    return fallback_url


def extract_internal_links(html: str, base_url: str) -> set[str]:
    """Extract all internal links from HTML, respecting <base> tag.
    
    Uses html5lib parser to handle malformed HTML with unclosed/nested tags.
    """
    soup = BeautifulSoup(html, "html5lib")
    effective_base = get_base_url_from_soup(soup, base_url)
    
    links = set()
    for a in soup.find_all("a", href=True):
        href = str(a["href"])
        # Skip anchors and non-http links
        if href.startswith("#") or href.startswith("mailto:") or href.startswith("javascript:"):
            continue
        full_url = normalize_regelwiki_url(urljoin(effective_base, href))
        # Only keep internal links
        if full_url.startswith(config.BASE_URL):
            links.add(full_url)
    return links


def is_clearly_broken_url(url: str) -> bool:
    broken_markers = [
        "{{",
        "}}",
        "{link_url",
        "|urlattr",
        "\ufffd",
        "%ef%bf%bd",
    ]
    url_lower = url.lower()
    return any(marker in url_lower for marker in broken_markers)


def parse_sitemap_urls(xml_text: str) -> set[str]:
    namespace = {"sm": "https://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(xml_text)
    urls = set()
    for loc in root.findall("sm:url/sm:loc", namespace):
        if loc.text:
            urls.add(loc.text.strip())
    return urls


def get_category_seed_urls(
    category: str,
    hub_url_paths: list[str],
    sitemap_urls: set[str] | None = None,
) -> list[str]:
    seed_urls = {normalize_regelwiki_url(urljoin(config.BASE_URL, path)) for path in hub_url_paths}
    if not sitemap_urls:
        return sorted(seed_urls)

    for sitemap_url in sitemap_urls:
        if should_skip_url(sitemap_url):
            continue
        candidates = category_resolution.get_url_category_candidates(sitemap_url)
        if category in candidates:
            seed_urls.add(normalize_regelwiki_url(sitemap_url))

    return sorted(seed_urls)


def has_content_markers(html: str) -> bool:
    """Check if page has content markers indicating it's a content page, not a hub."""
    soup = BeautifulSoup(html, "html5lib")
    text = soup.get_text().lower()
    for marker in config.PROPERTY_LABELS:
        if marker.lower() in text:
            return True
    return False


def has_content_markers_in_soup(soup: BeautifulSoup) -> bool:
    text = soup.get_text().lower()
    for marker in config.PROPERTY_LABELS:
        if marker.lower() in text:
            return True
    return False


def prepare_classification_soup(html: str) -> BeautifulSoup:
    soup = BeautifulSoup(html, "html5lib")
    ce_text = soup.find("div", class_="ce_text")
    if not ce_text:
        return soup

    inner_html_match = re.search(r"<!DOCTYPE html>.*?</html>", str(ce_text), re.DOTALL)
    if not inner_html_match:
        return soup

    return BeautifulSoup(inner_html_match.group(0), "html5lib")


def get_main_content_area(soup: BeautifulSoup):
    content_area = soup.find("div", id="main")
    if not content_area:
        content_area = soup.find("div", class_="inside")
    if not content_area:
        content_area = soup.find("div", class_="body")
    if not content_area:
        content_area = soup.find("main")
    if not content_area:
        content_area = soup.body if soup.body else soup
    return content_area


def has_property_layout(soup: BeautifulSoup) -> bool:
    body_div = soup.find("div", class_="body")
    return bool(body_div and body_div.find("div", class_="spalte1"))


def has_filter_controls(soup: BeautifulSoup) -> bool:
    if soup.select_one("div.filter select"):
        return True
    if soup.select_one(".filter_einzeln input[type='submit']"):
        return True
    if soup.find("select"):
        option_text = " ".join(
            option.get_text(" ", strip=True)
            for option in soup.find_all("option")
        )
        if any(marker in option_text for marker in ["[Alle]", "Publikation", "Tradition", "Leiteigenschaft"]):
            return True
    return False


def has_substantive_text_content(soup: BeautifulSoup) -> bool:
    content_area = get_main_content_area(soup)
    paragraphs = [
        p.get_text(" ", strip=True)
        for p in content_area.find_all("p")
    ]
    long_paragraphs = [text for text in paragraphs if len(text) >= 80]
    return bool(long_paragraphs)


def count_discovery_links(soup: BeautifulSoup) -> int:
    content_area = get_main_content_area(soup)
    count = 0
    for a in content_area.find_all("a", href=True):
        href = str(a.get("href", ""))
        if not href or href.startswith("#") or href.startswith("mailto:"):
            continue
        if config.BASE_URL in href or not href.startswith("http"):
            count += 1
    if count:
        return count

    for a in soup.find_all("a", href=True):
        href = str(a.get("href", ""))
        if not href:
            continue
        absolute_url = urljoin(config.BASE_URL, href)
        if should_skip_url(absolute_url):
            continue
        count += 1
    return count


def extract_page_name_signal(soup: BeautifulSoup) -> str:
    title = soup.find("title")
    if title:
        title_text = title.get_text(strip=True)
        if title_text.endswith(" - DSA Regel-Wiki"):
            title_text = title_text[:-17].strip()
        if title_text:
            return title_text

    header = soup.find("div", class_="header")
    if header:
        text = header.get_text(" ", strip=True)
        if len(text) > 1:
            return text

    h1 = soup.find("h1")
    if h1:
        text = h1.get_text(" ", strip=True)
        if len(text) > 1:
            return text

    return ""


def classify_page(html: str) -> dict[str, object]:
    soup = prepare_classification_soup(html)
    is_filter = has_filter_controls(soup)
    has_properties = has_property_layout(soup)
    has_substantive_text = has_substantive_text_content(soup)
    content_markers = has_content_markers_in_soup(soup)
    hub_like = is_hub_page_in_soup(soup)
    has_name_signal = bool(extract_page_name_signal(soup))
    discovery_links = count_discovery_links(soup)
    is_listing_filter = is_filter and not has_properties and discovery_links >= 10

    should_follow_links = hub_like or is_filter or (has_substantive_text and discovery_links >= 3)
    should_emit_item = (
        not is_listing_filter
        and not (is_filter and not has_properties and not has_substantive_text)
        and (
            has_properties
            or has_substantive_text
            or (content_markers and has_name_signal and not is_filter)
        )
    )

    if should_emit_item and should_follow_links:
        page_state = "hybrid"
    elif should_emit_item:
        page_state = "content"
    else:
        page_state = "crawl_only"

    return {
        "page_state": page_state,
        "should_emit_item": should_emit_item,
        "should_follow_links": should_follow_links,
    }


def is_hub_page(html: str) -> bool:
    """Determine if a page is a hub (contains many content links) vs content page.
    
    Looks for links in the main content area only, ignoring nav menus.
    Uses html5lib parser to handle malformed HTML with unclosed/nested tags.
    """
    soup = BeautifulSoup(html, "html5lib")
    return is_hub_page_in_soup(soup)


def is_hub_page_in_soup(soup: BeautifulSoup) -> bool:
    content_area = get_main_content_area(soup)

    links = content_area.find_all("a", href=True)
    internal_count = 0
    for a in links:
        href = str(a.get("href", ""))
        if href and not href.startswith("#") and not href.startswith("mailto:"):
            if config.BASE_URL in href or not href.startswith("http"):
                internal_count += 1

    return internal_count >= config.HUB_LINK_THRESHOLD


class Checkpoint:
    def __init__(self):
        self.completed: set[str] = set()
        self.failed: dict[str, str] = {}
        self.category_urls: dict[str, set[str]] = {}
        self.page_index: dict[str, dict[str, object]] = {}
        self.pending_urls: dict[str, set[str]] = {}
        self.load()

    def reset(self):
        self.completed = set()
        self.failed = {}
        self.category_urls = {}
        self.page_index = {}
        self.pending_urls = {}

    def load(self):
        if CHECKPOINT_FILE.exists():
            try:
                with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.completed = set(data.get("completed", []))
                    self.failed = data.get("failed", {})
                    self.category_urls = {
                        k: set(v) for k, v in data.get("category_urls", {}).items()
                    }
                    self.page_index = data.get("page_index", {})
                    self.pending_urls = {
                        k: set(v) for k, v in data.get("pending_urls", {}).items()
                    }
                logger.info(f"Loaded checkpoint: {len(self.completed)} completed")
            except Exception as e:
                logger.warning(f"Failed to load checkpoint: {e}")

    def save(self):
        CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "completed": list(self.completed),
            "failed": self.failed,
            "category_urls": {k: list(v) for k, v in self.category_urls.items()},
            "page_index": self.page_index,
            "pending_urls": {k: list(v) for k, v in self.pending_urls.items()},
        }
        atomic_write_json(CHECKPOINT_FILE, data)
        atomic_write_json(PAGE_INDEX_FILE, list(self.page_index.values()))

    def seed_pending_urls(self, category: str, urls: list[str]) -> list[str]:
        category_pending = self.pending_urls.setdefault(category, set())
        for url in urls:
            if url in self.completed:
                self.add_crawl_source(url, category)

        seeded_urls = {
            url for url in urls if url not in self.completed
        }
        category_pending.update(seeded_urls)
        return sorted(url for url in category_pending if url not in self.completed)

    def add_pending_url(self, category: str, url: str):
        category_pending = self.pending_urls.setdefault(category, set())
        if url not in self.completed:
            category_pending.add(url)

    def add_crawl_source(self, url: str, category: str):
        entry = self.page_index.get(url)
        if not entry:
            return

        existing_sources = entry.get("crawl_sources", [])
        crawl_sources = set(existing_sources) if isinstance(existing_sources, list) else set()
        crawl_sources.add(category)
        entry["crawl_sources"] = sorted(crawl_sources)

    def remove_pending_url(self, category: str, url: str):
        if category in self.pending_urls:
            self.pending_urls[category].discard(url)

    def mark_completed(
        self,
        url: str,
        category: str,
        *,
        page_state: str | None = None,
        filepath: str | None = None,
    ):
        self.completed.add(url)
        if category not in self.category_urls:
            self.category_urls[category] = set()
        self.category_urls[category].add(url)
        if page_state and filepath:
            existing_entry = self.page_index.get(url, {})
            existing_crawl_sources = existing_entry.get("crawl_sources", [])
            crawl_sources = set(existing_crawl_sources) if isinstance(existing_crawl_sources, list) else set()
            crawl_sources.add(category)
            existing_resolved = existing_entry.get("resolved_category")
            resolved_category = existing_resolved if isinstance(existing_resolved, str) else None
            existing_provisional = existing_entry.get("provisional_category")
            provisional_category = existing_provisional if isinstance(existing_provisional, str) else None
            stored_category = resolved_category or "unresolved"

            self.page_index[url] = {
                "url": url,
                "category": stored_category,
                "page_state": page_state,
                "filepath": filepath,
                "crawl_sources": sorted(crawl_sources),
                "provisional_category": provisional_category,
                "resolved_category": resolved_category,
            }

    def mark_failed(self, url: str, error: str):
        self.failed[url] = error


class Downloader:
    def __init__(self, checkpoint: Checkpoint, resume: bool = True):
        self.checkpoint = checkpoint
        self.resume = resume
        self.session: Optional[aiohttp.ClientSession] = None
        self.sitemap_urls: set[str] | None = None

    async def init_session(self):
        self.session = aiohttp.ClientSession(
            headers={"User-Agent": config.USER_AGENT},
            timeout=aiohttp.ClientTimeout(total=30),
        )

    async def close_session(self):
        if self.session:
            await self.session.close()

    async def load_sitemap_urls(self) -> set[str]:
        if self.sitemap_urls is not None:
            return self.sitemap_urls

        if self.session is None:
            raise RuntimeError("HTTP session not initialized")

        sitemap_urls: set[str] = set()
        try:
            async with self.session.get(config.SITEMAP_URL) as response:
                if response.status != 200:
                    logger.warning(f"HTTP {response.status} for sitemap {config.SITEMAP_URL}")
                    self.sitemap_urls = sitemap_urls
                    return sitemap_urls
                xml_text = await response.text(encoding="utf-8", errors="replace")
                sitemap_urls = parse_sitemap_urls(xml_text)
                sitemap_urls = {
                    url
                    for url in sitemap_urls
                    if url.startswith(config.BASE_URL) and not should_skip_url(url)
                }
                logger.info(f"Loaded {len(sitemap_urls)} sitemap URLs from {config.SITEMAP_URL}")
        except Exception as exc:
            logger.warning(f"Failed to load sitemap {config.SITEMAP_URL}: {exc}")

        self.sitemap_urls = sitemap_urls
        return sitemap_urls

    async def fetch_page_once(self, url: str) -> tuple[Optional[str], str | None]:
        if self.session is None:
            raise RuntimeError("HTTP session not initialized")

        request_url = normalize_regelwiki_url(url)

        async with self.session.get(request_url) as response:
            if response.status == 200:
                html = await response.text(encoding="utf-8", errors="replace")
                return html, None

            logger.warning(f"HTTP {response.status} for {request_url}")
            return None, f"http_{response.status}"

    async def download_page(self, url: str) -> tuple[Optional[str], str | None]:
        if self.resume and url in self.checkpoint.completed:
            logger.debug(f"Skipping (already completed): {url}")
            return None, "already_completed"

        delay = random.uniform(config.REQUEST_DELAY_MIN, config.REQUEST_DELAY_MAX)
        await asyncio.sleep(delay)

        try:
            html, error = await self.fetch_page_once(url)
            if html is not None or error != "http_404":
                return html, error

            if is_clearly_broken_url(url):
                return None, "http_404_broken_url"

            for _ in range(config.HTTP_404_RETRY_ATTEMPTS):
                await asyncio.sleep(config.HTTP_404_RETRY_DELAY)
                html, retry_error = await self.fetch_page_once(url)
                if html is not None:
                    return html, None
                error = retry_error

            return None, error
        except Exception as e:
            logger.error(f"Error downloading {url}: {e}")
            return None, str(e)

    async def save_html(self, url: str, html: str, category: str) -> Path:
        filename = sanitize_filename(url)
        category_dir = HTML_DIR / category
        category_dir.mkdir(parents=True, exist_ok=True)
        filepath = category_dir / filename
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)
        logger.debug(f"Saved: {filepath}")
        return filepath

    def get_storage_category(self, source_category: str) -> str:
        return source_category

    def get_pending_sitemap_ingest_urls(self) -> list[str]:
        sitemap_urls = self.sitemap_urls or set()
        return sorted(
            normalize_regelwiki_url(url)
            for url in sitemap_urls
            if url not in self.checkpoint.completed and not should_skip_url(url)
        )

    async def crawl_seed_urls(
        self,
        category: str,
        initial_urls: list[str],
        *,
        follow_discovered_links: bool,
    ) -> tuple[set[str], set[str]]:
        discovered_content = set()
        discovered_hybrids = set()
        discovered_hubs = set()
        visited_urls = set()
        frontier_urls = self.checkpoint.seed_pending_urls(category, initial_urls)
        queued_urls = set(frontier_urls)
        url_queue: asyncio.Queue[str | None] = asyncio.Queue()
        state_lock = asyncio.Lock()
        processed_count = 0
        checked_count = 0
        failure_count = 0
        status = LiveStats(f"[phase1:{category}]")

        def render_status(*, force: bool = False):
            status.render(
                (
                    f"checked={checked_count} pending={url_queue.qsize()} "
                    f"content={len(discovered_content)} hybrid={len(discovered_hybrids)} "
                    f"crawl_only={len(discovered_hubs)} failed={failure_count}"
                ),
                force=force,
            )

        for url in frontier_urls:
            await url_queue.put(url)

        if frontier_urls:
            self.checkpoint.save()
        render_status(force=True)

        async def enqueue_url(link: str):
            if not follow_discovered_links:
                return False

            async with state_lock:
                if link in self.checkpoint.completed:
                    self.checkpoint.add_crawl_source(link, category)
                    return False
                if link in visited_urls or link in queued_urls:
                    return False
                queued_urls.add(link)
                self.checkpoint.add_pending_url(category, link)
            await url_queue.put(link)
            render_status()
            return True

        async def record_processed_page(
            url: str,
            html: str,
            content_links: set[str],
            page_state: str,
            should_follow_links: bool,
        ):
            nonlocal processed_count
            storage_category = self.get_storage_category(category)

            new_links_queued = 0
            if should_follow_links and follow_discovered_links:
                for link in content_links:
                    if await enqueue_url(link):
                        new_links_queued += 1

            if page_state == "hybrid":
                logger.debug(
                    f"  Hybrid page: following {len(content_links)} links ({new_links_queued} new queued)"
                )
                discovered_hybrids.add(url)
                filepath = await self.save_html(url, html, f"{storage_category}_hybrid")
            elif page_state == "content":
                logger.debug("  Content page")
                discovered_content.add(url)
                filepath = await self.save_html(url, html, storage_category)
            else:
                logger.debug(
                    f"  Crawl-only page: following {len(content_links)} links ({new_links_queued} new queued)"
                )
                discovered_hubs.add(url)
                filepath = await self.save_html(url, html, f"{storage_category}_hubs")

            async with state_lock:
                self.checkpoint.mark_completed(
                    url,
                    category,
                    page_state=page_state,
                    filepath=str(filepath.relative_to(DATA_DIR)).replace("\\", "/"),
                )
                self.checkpoint.remove_pending_url(category, url)
                processed_count += 1
                if processed_count % config.CHECKPOINT_BATCH_SIZE == 0:
                    self.checkpoint.save()
            render_status()

        async def worker():
            nonlocal checked_count, failure_count
            while True:
                url = await url_queue.get()
                try:
                    if url is None:
                        return

                    async with state_lock:
                        if url in visited_urls:
                            continue
                        visited_urls.add(url)
                        checked_count += 1

                    logger.debug(f"Checking: {url}")
                    html, download_error = await self.download_page(url)
                    if html:
                        internal_links = extract_internal_links(html, url)
                        content_links = {
                            link for link in internal_links if not should_skip_url(link)
                        }

                        classification = classify_page(html)
                        page_state = str(classification["page_state"])
                        should_follow_links = bool(classification["should_follow_links"])

                        await record_processed_page(
                            url,
                            html,
                            content_links,
                            page_state,
                            should_follow_links,
                        )
                    else:
                        async with state_lock:
                            failure_reason = download_error or "download_failed"
                            if failure_reason != "already_completed":
                                self.checkpoint.mark_failed(url, failure_reason)
                                failure_count += 1
                        render_status()
                except Exception as e:
                    logger.error(f"Worker error for {url}: {e}")
                    if url is not None:
                        async with state_lock:
                            self.checkpoint.mark_failed(url, str(e))
                            failure_count += 1
                        render_status()
                finally:
                    url_queue.task_done()

        workers = [
            asyncio.create_task(worker())
            for _ in range(config.REQUEST_CONCURRENCY)
        ]

        await url_queue.join()

        for _ in workers:
            await url_queue.put(None)

        await asyncio.gather(*workers)

        self.checkpoint.save()
        render_status(force=True)
        status.finish(
            (
                f"checked={checked_count} pending=0 content={len(discovered_content)} "
                f"hybrid={len(discovered_hybrids)} crawl_only={len(discovered_hubs)} failed={failure_count}"
            )
        )
        logger.info(
            f"Discovered {len(discovered_content)} content URLs, {len(discovered_hybrids)} hybrid URLs, and {len(discovered_hubs)} crawl-only URLs for {category}"
        )
        return discovered_content | discovered_hybrids, discovered_hubs

    async def discover_urls_from_hubs(
        self, category: str, hub_url_paths: list[str]
    ) -> tuple[set[str], set[str]]:
        """Discover URLs from hubs, recursively following nested hub pages.
        
        Returns:
            tuple of (content_urls, hub_urls) - all discovered URLs categorized
        """
        sitemap_urls = await self.load_sitemap_urls()
        initial_hub_urls = get_category_seed_urls(category, hub_url_paths, sitemap_urls)
        return await self.crawl_seed_urls(
            category,
            initial_hub_urls,
            follow_discovered_links=True,
        )

    async def ingest_remaining_sitemap_urls(self) -> tuple[int, int]:
        await self.load_sitemap_urls()
        pending_urls = self.get_pending_sitemap_ingest_urls()
        if not pending_urls:
            logger.info("No remaining sitemap URLs to ingest")
            return 0, 0

        failed_before = len(self.checkpoint.failed)
        content_urls, _crawl_only_urls = await self.crawl_seed_urls(
            config.SITEMAP_INGEST_CATEGORY,
            pending_urls,
            follow_discovered_links=False,
        )
        fail_count = len(self.checkpoint.failed) - failed_before
        return len(content_urls), fail_count

    async def download_category(
        self, category: str, hub_urls: list[str]
    ) -> tuple[int, int]:
        failed_before = len(self.checkpoint.failed)
        content_urls, crawl_only_urls = await self.discover_urls_from_hubs(category, hub_urls)

        success_count = 0
        for url in content_urls:
            entry = self.checkpoint.page_index.get(url, {})
            entry_category = entry.get("provisional_category")
            if not isinstance(entry_category, str):
                entry_category = entry.get("category")
            if entry_category == category:
                success_count += 1
        fail_count = len(self.checkpoint.failed) - failed_before

        cross_category_count = len(content_urls) - success_count
        logger.info(
            f"Category-owned pages discovered: {success_count}; cross-category or unresolved pages discovered: {cross_category_count}"
        )

        return success_count, fail_count


def summarize_new_entries_by_category(
    checkpoint: Checkpoint,
    initial_urls: set[str],
    categories: list[str],
) -> dict[str, int]:
    summary = {category: 0 for category in categories}

    for url, entry in checkpoint.page_index.items():
        if url in initial_urls:
            continue
        if entry.get("page_state") not in {"content", "hybrid"}:
            continue
        crawl_sources = entry.get("crawl_sources", [])
        if not isinstance(crawl_sources, list):
            continue

        for crawl_source in crawl_sources:
            if isinstance(crawl_source, str) and crawl_source in summary:
                summary[crawl_source] += 1

    return summary


async def run_phase1(
    categories: Optional[list[str]] = None, resume: bool = True
) -> dict[str, tuple[int, int]]:
    checkpoint = Checkpoint()
    if not resume:
        checkpoint.reset()
    downloader = Downloader(checkpoint, resume)
    initial_page_index_urls = set(checkpoint.page_index.keys())

    await downloader.init_session()

    try:
        if categories is None:
            categories = list(config.CATEGORIES.keys())

        per_category_failures = {category: 0 for category in categories}
        for category in categories:
            if category not in config.CATEGORIES:
                logger.warning(f"Unknown category: {category}")
                continue

            logger.info(f"Starting category: {category}")
            category_config = config.CATEGORIES[category]
            configured_hub_urls = category_config.get("hub_urls")
            if isinstance(configured_hub_urls, list):
                hub_urls = [hub_url for hub_url in configured_hub_urls if isinstance(hub_url, str)]
            else:
                configured_hub_url = category_config.get("hub_url", "")
                hub_urls = [configured_hub_url] if isinstance(configured_hub_url, str) and configured_hub_url else []
            success, fail = await downloader.download_category(
                category, hub_urls
            )
            per_category_failures[category] = fail
            logger.info(f"Completed {category}: {success} success, {fail} failed")

        sitemap_success, sitemap_fail = await downloader.ingest_remaining_sitemap_urls()
        logger.info(
            f"Completed {config.SITEMAP_INGEST_CATEGORY}: {sitemap_success} success, {sitemap_fail} failed"
        )

        success_summary = summarize_new_entries_by_category(
            checkpoint,
            initial_page_index_urls,
            categories,
        )
        results = {
            category: (success_summary.get(category, 0), per_category_failures.get(category, 0))
            for category in categories
        }
        results[config.SITEMAP_INGEST_CATEGORY] = (sitemap_success, sitemap_fail)

        return results

    finally:
        await downloader.close_session()


async def run_phase1_explicit(
    categories: Optional[list[str]] = None, resume: bool = True
) -> dict[str, tuple[int, int]]:
    """Run phase 1 using explicit hub URL lists from explicit_urls.py"""
    checkpoint = Checkpoint()
    if not resume:
        checkpoint.reset()
    downloader = Downloader(checkpoint, resume)
    initial_page_index_urls = set(checkpoint.page_index.keys())

    await downloader.init_session()

    try:
        if categories is None:
            categories = list(explicit_urls.EXPLICIT_HUBS.keys())

        per_category_failures = {category: 0 for category in categories}
        for category in categories:
            if category not in explicit_urls.EXPLICIT_HUBS:
                logger.warning(f"Unknown explicit category: {category}")
                continue

            logger.info(f"Starting explicit category: {category}")
            hub_urls = explicit_urls.EXPLICIT_HUBS[category]
            success, fail = await downloader.download_category(
                category, hub_urls
            )
            per_category_failures[category] = fail
            logger.info(f"Completed {category}: {success} success, {fail} failed")

        sitemap_success, sitemap_fail = await downloader.ingest_remaining_sitemap_urls()
        logger.info(
            f"Completed {config.SITEMAP_INGEST_CATEGORY}: {sitemap_success} success, {sitemap_fail} failed"
        )

        success_summary = summarize_new_entries_by_category(
            checkpoint,
            initial_page_index_urls,
            categories,
        )
        results = {
            category: (success_summary.get(category, 0), per_category_failures.get(category, 0))
            for category in categories
        }
        results[config.SITEMAP_INGEST_CATEGORY] = (sitemap_success, sitemap_fail)

        return results

    finally:
        await downloader.close_session()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 1: Download HTML files")
    parser.add_argument(
        "--categories",
        type=str,
        help="Comma-separated list of categories to download",
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Start fresh, ignore checkpoint",
    )
    parser.add_argument(
        "--explicit",
        action="store_true",
        help="Use explicit URL lists from explicit_urls.py",
    )
    args = parser.parse_args()

    categories = args.categories.split(",") if args.categories else None
    resume = not args.no_resume

    if args.explicit:
        results = asyncio.run(run_phase1_explicit(categories, resume))
    else:
        results = asyncio.run(run_phase1(categories, resume))

    total_success = sum(s for s, _ in results.values())
    total_fail = sum(f for _, f in results.values())
    logger.info(f"Phase 1 complete: {total_success} success, {total_fail} failed")
