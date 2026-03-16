import json
import logging
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.parse import parse_qs, urlparse, unquote

from bs4 import BeautifulSoup, Tag

sys.path.insert(0, str(Path(__file__).parent))
import category_resolution
from cli_progress import LiveStats, ProgressAwareStreamHandler
import config
import explicit_urls

DATA_DIR = Path(__file__).parent / "data"
HTML_DIR = DATA_DIR / "html"
JSON_DIR = DATA_DIR / "json"
PAGE_INDEX_FILE = DATA_DIR / "page_index.json"


def atomic_write_json(filepath: Path, data: object):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    temp_path = filepath.with_suffix(filepath.suffix + ".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    temp_path.replace(filepath)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        ProgressAwareStreamHandler(),
        logging.FileHandler(DATA_DIR / "parser.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def extract_inner_html(soup: Tag | BeautifulSoup) -> Tag | BeautifulSoup:
    ce_text = soup.find("div", class_="ce_text")
    if ce_text:
        inner_html_match = re.search(
            r"<!DOCTYPE html>.*?</html>", str(ce_text), re.DOTALL
        )
        if inner_html_match:
            inner_soup = BeautifulSoup(inner_html_match.group(0), "html5lib")
            return inner_soup.body if inner_soup.body else inner_soup
    return soup


def preprocess_html(soup: Tag | BeautifulSoup) -> Tag | BeautifulSoup:
    soup = extract_inner_html(soup)

    for header in soup.find_all("div", class_="header"):
        header.name = "h1"
        header.attrs = {}

    for body_einzeln in soup.find_all("div", class_="body_einzeln"):
        body_einzeln.name = "h3"
        body_einzeln.attrs = {}

    return soup


def get_main_content_area(soup: Tag | BeautifulSoup) -> Tag | BeautifulSoup:
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


def extract_properties(soup: Tag | BeautifulSoup) -> dict[str, str]:
    properties = {}

    body_div = soup.find("div", class_="body")
    if body_div:
        for spalte in body_div.find_all("div", class_="spalte1"):
            label = spalte.get_text(strip=True).rstrip(":")
            value_div = spalte.find_next_sibling("div")

            if value_div and "spalte1" not in (value_div.get("class") or []):
                value = value_div.get_text(separator=" ", strip=True)
                if label and value:
                    properties[label] = value

    return properties


def extract_breadcrumbs(soup: Tag | BeautifulSoup) -> list[str]:
    breadcrumbs = []
    breadcrumb_boxed = soup.select_one(".breadcrumb_boxed")
    if breadcrumb_boxed:
        for link in breadcrumb_boxed.find_all("a"):
            text = link.get_text(strip=True)
            if text:
                breadcrumbs.append(text)
    return breadcrumbs


def extract_description(soup: Tag | BeautifulSoup) -> str:
    body_div = soup.find("div", class_="body")
    if not body_div:
        content_area = get_main_content_area(soup)
        paragraphs = [
            p.get_text(" ", strip=True)
            for p in content_area.find_all("p")
        ]
        long_paragraphs = [text for text in paragraphs if len(text) >= 40]
        return "\n\n".join(long_paragraphs)

    for spalte in body_div.find_all("div", class_="spalte1"):
        label = spalte.get_text(strip=True).rstrip(":")
        if label == "Wirkung":
            value_div = spalte.find_next_sibling("div")
            if value_div:
                return value_div.get_text(separator=" ", strip=True)

    return ""


def extract_extensions(soup: Tag | BeautifulSoup) -> list[dict]:
    extensions = []
    body_div = soup.find("div", class_="body")
    if not body_div:
        return extensions

    extensions_header = None
    for elem in body_div.find_all(["h3"]):
        if "Zaubererweiterungen" in elem.get_text():
            extensions_header = elem
            break

    if not extensions_header:
        return extensions

    current_ext = None
    next_elem = extensions_header.next_sibling

    while next_elem:
        if isinstance(next_elem, Tag):
            elem_class = next_elem.get("class") or []
            if "body_einzeln" in elem_class or "line_separator" in elem_class:
                break

            text = next_elem.get_text(strip=True)
            if text.startswith("#"):
                if current_ext:
                    extensions.append(current_ext)
                current_ext = {"name": text[1:].strip(), "description": ""}
            elif current_ext and text:
                if current_ext["description"]:
                    current_ext["description"] += " " + text
                else:
                    current_ext["description"] = text

        next_elem = next_elem.next_sibling

    if current_ext:
        extensions.append(current_ext)

    return extensions


def extract_name(soup: Tag | BeautifulSoup) -> str:
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

    title = soup.find("title")
    if title:
        text = title.get_text(strip=True)
        if text.endswith(" - DSA Regel-Wiki"):
            text = text[:-17].strip()
        if text:
            return text

    return ""


def generate_id(category: str, name: str, url: str) -> str:
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)

    for param_values in query_params.values():
        if param_values:
            param_value = param_values[0]
            clean_id = re.sub(r"[^a-zA-Z0-9_-]", "_", param_value)
            clean_id = re.sub(r"_+", "_", clean_id).strip("_")
            return f"{category}_{clean_id}"

    if name:
        clean_name = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
        clean_name = re.sub(r"_+", "_", clean_name).strip("_")
        return f"{category}_{clean_name}"

    return f"{category}_{hash(url) % 100000}"


def determine_subcategory(breadcrumbs: list[str], category_config: dict) -> str:
    if len(breadcrumbs) >= 2:
        return breadcrumbs[-2]
    return ""


def reconstruct_url(filename: str, category: str) -> str:
    category_config = config.CATEGORIES.get(category, {})
    url_param = category_config.get("url_param", "item")

    # Filename format: {page}.html_{param}_{value}.html
    # Example: zauber.html_zauber_Ablativum.html
    if ".html_" in filename:
        # Extract page name (before .html_)
        page_part = filename.split(".html_")[0]
        # Extract param and value (after .html_)
        rest = filename.split(".html_")[1]
        parts = rest.split("_", 1)
        if len(parts) == 2:
            param, value = parts
            # Remove trailing .html from value
            if value.endswith(".html"):
                value = value[:-5]
            return f"{config.BASE_URL}{page_part}.html?{param}={value}"

    # Fallback for unexpected formats
    return f"{config.BASE_URL}{filename.replace('_', '/')}"


def parse_html_file(
    filepath: Path,
    category: str,
    category_config: dict,
    source_url: str | None = None,
) -> dict:
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "lxml")
    soup = preprocess_html(soup)

    name = extract_name(soup)
    properties = extract_properties(soup)
    breadcrumbs = extract_breadcrumbs(soup)
    description = extract_description(soup)
    extensions = extract_extensions(soup)
    subcategory = determine_subcategory(breadcrumbs, category_config)

    filename = filepath.stem
    url = source_url or reconstruct_url(filename, category)

    item_id = generate_id(category, name, url)

    result = {
        "id": item_id,
        "category": category,
        "name": name,
        "url": url,
        "breadcrumbs": breadcrumbs,
        "properties": properties,
        "description": description,
    }

    if subcategory:
        result["subcategory"] = subcategory

    if extensions:
        result["extensions"] = extensions

    return result


def load_page_index() -> list[dict]:
    if not PAGE_INDEX_FILE.exists():
        return []

    with open(PAGE_INDEX_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_page_index(entries: list[dict]):
    atomic_write_json(PAGE_INDEX_FILE, entries)


def get_all_parseable_entries() -> list[dict]:
    entries = load_page_index()
    parseable_entries = []

    for entry in entries:
        if entry.get("page_state") not in {"content", "hybrid"}:
            continue

        relative_path = entry.get("filepath")
        if not isinstance(relative_path, str) or not relative_path:
            continue

        filepath = DATA_DIR / Path(relative_path)
        if filepath.exists():
            parseable_entries.append({
                "entry": entry,
                "filepath": filepath,
                "url": entry.get("url"),
            })

    return parseable_entries


def resolve_item_category(entry: dict, item: dict) -> tuple[str | None, str, list[str]]:
    crawl_sources = entry.get("crawl_sources", [])
    if not isinstance(crawl_sources, list):
        crawl_sources = []

    provisional_category = entry.get("provisional_category")
    if not isinstance(provisional_category, str):
        provisional_category = None

    return category_resolution.resolve_final_category(
        url=item["url"],
        breadcrumbs=item.get("breadcrumbs", []),
        title=item.get("name", ""),
        properties=item.get("properties", {}),
        crawl_sources=crawl_sources,
        provisional_category=provisional_category,
    )


def is_noise_page(item: dict) -> bool:
    url = item.get("url", "")
    title = (item.get("name") or "").strip().lower()
    breadcrumbs = item.get("breadcrumbs", [])

    if title == "suche":
        return True
    if title.startswith("willkommen auf der seite der dsa-regel-wiki"):
        return True

    if isinstance(url, str):
        parsed = urlparse(url)
        if parsed.path in {"", "/"}:
            return True

    return breadcrumbs == ["DSA Regel-Wiki"] and not item.get("properties")


def parse_all_explicit_categories(selected_categories: list[str]) -> tuple[dict[str, list[dict]], list[dict], list[dict], list[tuple[str, str]]]:
    parseable_entries = get_all_parseable_entries()
    results_by_category = {
        category: [] for category in explicit_urls.EXPLICIT_HUBS
    }
    unresolved_items: list[dict] = []
    page_index_entries = load_page_index()
    page_index_by_url = {
        entry.get("url"): entry
        for entry in page_index_entries
        if isinstance(entry.get("url"), str)
    }
    errors = []
    status = LiveStats("[phase2:explicit]")
    processed_count = 0

    def render_status(*, force: bool = False, current: str = ""):
        status.render(
            (
                f"processed={processed_count}/{len(parseable_entries)} resolved={sum(len(items) for items in results_by_category.values())} "
                f"unresolved={len(unresolved_items)} errors={len(errors)} current={current or '-'}"
            ),
            force=force,
        )

    render_status(force=True)

    for parse_entry in parseable_entries:
        entry = parse_entry["entry"]
        filepath = parse_entry["filepath"]
        source_url = parse_entry.get("url")
        crawl_sources = entry.get("crawl_sources", [])
        if not isinstance(crawl_sources, list):
            crawl_sources = []

        parse_category_name = None
        for candidate in [entry.get("provisional_category"), *crawl_sources]:
            if isinstance(candidate, str) and candidate in explicit_urls.EXPLICIT_HUBS:
                parse_category_name = candidate
                break

        if not parse_category_name:
            parse_category_name = "rules"

        try:
            item = parse_html_file(
                filepath,
                parse_category_name,
                config.CATEGORIES.get(parse_category_name, {}),
                source_url=source_url if isinstance(source_url, str) else None,
            )
            if not item["name"]:
                logger.debug(f"No name extracted from {filepath}")
                continue

            if is_noise_page(item):
                page_index_entry = page_index_by_url.get(item["url"])
                if page_index_entry is not None:
                    page_index_entry["resolved_category"] = "crawl_only"
                    page_index_entry["resolution_confidence"] = "high"
                    page_index_entry["resolution_evidence"] = ["noise_page"]
                    page_index_entry["category"] = "crawl_only"
                continue

            final_category, confidence, evidence = resolve_item_category(entry, item)
            page_index_entry = page_index_by_url.get(item["url"])
            if page_index_entry is not None:
                page_index_entry["resolved_category"] = final_category
                page_index_entry["resolution_confidence"] = confidence
                page_index_entry["resolution_evidence"] = evidence
                page_index_entry["category"] = final_category or "unresolved"

            if final_category and final_category in results_by_category:
                item["id"] = generate_id(final_category, item["name"], item["url"])
                item["category"] = final_category
                results_by_category[final_category].append(item)
            else:
                item["category"] = "unresolved"
                item["resolution_confidence"] = confidence
                item["resolution_evidence"] = evidence
                unresolved_items.append(item)
        except Exception as e:
            errors.append((str(filepath), str(e)))
            logger.error(f"Error parsing {filepath}: {e}")
        finally:
            processed_count += 1
            render_status(current=parse_category_name)

    status.finish(
        f"processed={processed_count}/{len(parseable_entries)} resolved={sum(len(items) for items in results_by_category.values())} unresolved={len(unresolved_items)} errors={len(errors)}"
    )
    return results_by_category, unresolved_items, page_index_entries, errors


def get_parseable_entries(category: str) -> list[dict]:
    entries = load_page_index()
    parseable_entries = []

    for entry in entries:
        if entry.get("page_state") not in {"content", "hybrid"}:
            continue

        category_matches = False
        for key in ["resolved_category", "provisional_category", "category"]:
            value = entry.get(key)
            if isinstance(value, str) and value == category:
                category_matches = True
                break

        if not category_matches:
            crawl_sources = entry.get("crawl_sources", [])
            if isinstance(crawl_sources, list) and category in crawl_sources:
                category_matches = True

        if not category_matches:
            continue

        relative_path = entry.get("filepath")
        if not relative_path:
            continue

        filepath = DATA_DIR / Path(relative_path)
        if filepath.exists():
            parseable_entries.append({
                "filepath": filepath,
                "url": entry.get("url"),
            })

    return parseable_entries


def parse_category(category: str) -> list[dict]:
    category_config = config.CATEGORIES.get(category, {})
    parseable_entries = get_parseable_entries(category)

    if not parseable_entries:
        html_category_dir = HTML_DIR / category

        if not html_category_dir.exists():
            logger.warning(f"No HTML directory or page index entries for category: {category}")
            return []

        parseable_entries = [
            {"filepath": filepath, "url": None}
            for filepath in html_category_dir.glob("*.html")
        ]

    logger.info(f"Found {len(parseable_entries)} parseable HTML files for {category}")

    results = []
    errors = []
    status = LiveStats(f"[phase2:{category}]")
    processed_count = 0
    status.render(
        f"processed=0/{len(parseable_entries)} resolved=0 unresolved=0 errors=0",
        force=True,
    )

    for entry in parseable_entries:
        filepath = entry["filepath"]
        try:
            item = parse_html_file(
                filepath,
                category,
                category_config,
                source_url=entry.get("url"),
            )
            if item["name"]:
                results.append(item)
            else:
                logger.debug(f"No name extracted from {filepath}")
        except Exception as e:
            errors.append((str(filepath), str(e)))
            logger.error(f"Error parsing {filepath}: {e}")
        finally:
            processed_count += 1
            status.render(
                f"processed={processed_count}/{len(parseable_entries)} resolved={len(results)} unresolved=0 errors={len(errors)}",
            )

    if errors:
        error_file = JSON_DIR / f"{category}_parse_errors.json"
        with open(error_file, "w", encoding="utf-8") as f:
            json.dump(errors, f, indent=2, ensure_ascii=False)
        logger.warning(f"Logged {len(errors)} parse errors to {error_file}")

    status.finish(
        f"processed={processed_count}/{len(parseable_entries)} resolved={len(results)} unresolved=0 errors={len(errors)}"
    )
    return results


def save_category_json(category: str, items: list[dict]):
    JSON_DIR.mkdir(parents=True, exist_ok=True)
    output_file = JSON_DIR / f"{category}.json"

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)

    logger.info(f"Saved {len(items)} items to {output_file}")


def run_phase2(categories: list[str] | None = None) -> dict[str, int]:
    if categories is None:
        categories = list(config.CATEGORIES.keys())

    results = {}

    for category in categories:
        if category not in config.CATEGORIES:
            logger.warning(f"Unknown category: {category}")
            continue

        logger.info(f"Parsing category: {category}")
        items = parse_category(category)
        save_category_json(category, items)
        results[category] = len(items)

    return results


def run_phase2_explicit(categories: list[str] | None = None) -> dict[str, int]:
    """Run phase 2 using explicit URL categories from explicit_urls.py"""
    if categories is None:
        categories = list(explicit_urls.EXPLICIT_HUBS.keys())

    categories = [
        category for category in categories if category in explicit_urls.EXPLICIT_HUBS
    ]

    results_by_category, unresolved_items, page_index_entries, errors = parse_all_explicit_categories(categories)
    save_page_index(page_index_entries)

    if errors:
        error_file = JSON_DIR / "explicit_parse_errors.json"
        JSON_DIR.mkdir(parents=True, exist_ok=True)
        with open(error_file, "w", encoding="utf-8") as f:
            json.dump(errors, f, indent=2, ensure_ascii=False)
        logger.warning(f"Logged {len(errors)} parse errors to {error_file}")

    save_category_json("unresolved", unresolved_items)

    results = {}
    for category in categories:
        logger.info(f"Saving explicit category: {category}")
        items = results_by_category.get(category, [])
        save_category_json(category, items)
        results[category] = len(items)

    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2: Parse HTML to JSON")
    parser.add_argument(
        "--categories",
        type=str,
        help="Comma-separated list of categories to parse",
    )
    parser.add_argument(
        "--explicit",
        action="store_true",
        help="Use explicit URL categories from explicit_urls.py",
    )
    args = parser.parse_args()

    categories = args.categories.split(",") if args.categories else None
    
    if args.explicit:
        results = run_phase2_explicit(categories)
    else:
        results = run_phase2(categories)

    total = sum(results.values())
    logger.info(f"Phase 2 complete: {total} items parsed across {len(results)} categories")
    for cat, count in sorted(results.items()):
        logger.info(f"  {cat}: {count}")
