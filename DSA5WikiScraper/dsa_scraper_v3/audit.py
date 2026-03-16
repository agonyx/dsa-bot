import json
import hashlib
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).parent / "data"
JSON_DIR = DATA_DIR / "json"
AUDIT_DIR = DATA_DIR / "audit"
CHECKPOINT_FILE = DATA_DIR / "checkpoint.json"
PAGE_INDEX_FILE = DATA_DIR / "page_index.json"


def load_json_file(path: Path, default: Any):
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_checkpoint(data_dir: Path = DATA_DIR) -> dict[str, Any]:
    return load_json_file(data_dir / "checkpoint.json", {})


def load_page_index(data_dir: Path = DATA_DIR) -> list[dict[str, Any]]:
    return load_json_file(data_dir / "page_index.json", [])


def load_json_outputs(data_dir: Path = DATA_DIR) -> dict[str, list[dict[str, Any]]]:
    outputs: dict[str, list[dict[str, Any]]] = {}
    json_dir = data_dir / "json"
    if not json_dir.exists():
        return outputs

    for path in sorted(json_dir.glob("*.json")):
        if path.name.endswith("_parse_errors.json") or path.name == "explicit_parse_errors.json":
            continue
        outputs[path.stem] = load_json_file(path, [])
    return outputs


def atomic_write_json(path: Path, data: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    temp_path.replace(path)


def make_url_hash(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def parse_http_status(fetch_error: Any) -> int | None:
    if not isinstance(fetch_error, str):
        return None
    match = re.search(r"\b(\d{3})\b", fetch_error)
    if not match:
        return None
    return int(match.group(1))


def write_jsonl(path: Path, rows: list[dict[str, Any]]):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    temp_path.replace(path)


def effective_category(entry: dict[str, Any]) -> str:
    resolved = entry.get("resolved_category")
    if isinstance(resolved, str) and resolved:
        return resolved
    category = entry.get("category")
    if isinstance(category, str) and category:
        return category
    return "unresolved"


def expected_categories_for_entry(entry: dict[str, Any]) -> set[str]:
    expected = set()

    resolved = entry.get("resolved_category")
    if isinstance(resolved, str) and resolved:
        expected.add(resolved)

    category = entry.get("category")
    if isinstance(category, str) and category and category != "unresolved":
        expected.add(category)

    if not expected:
        crawl_sources = entry.get("crawl_sources")
        if isinstance(crawl_sources, list):
            expected.update(
                value for value in crawl_sources if isinstance(value, str) and value
            )

    return expected


def url_matches_categories(entry: dict[str, Any], categories: set[str] | None) -> bool:
    if not categories:
        return True

    candidates: set[str] = set()
    for key in ["resolved_category", "provisional_category", "category"]:
        value = entry.get(key)
        if isinstance(value, str) and value:
            candidates.add(value)
    crawl_sources = entry.get("crawl_sources")
    if isinstance(crawl_sources, list):
        for value in crawl_sources:
            if isinstance(value, str) and value:
                candidates.add(value)
    return bool(candidates & categories)


def build_expected_inventory(
    page_index: list[dict[str, Any]],
    categories: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    category_filter = set(categories) if categories else None
    inventory: dict[str, dict[str, Any]] = {}

    for entry in page_index:
        url = entry.get("url")
        if not isinstance(url, str) or not url:
            continue
        if entry.get("page_state") not in {"content", "hybrid"}:
            continue
        if entry.get("resolved_category") == "crawl_only":
            continue
        if not url_matches_categories(entry, category_filter):
            continue
        inventory[url] = dict(entry)

    return inventory


def build_emitted_inventory(
    json_outputs: dict[str, list[dict[str, Any]]],
    page_index: list[dict[str, Any]],
    categories: list[str] | None = None,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    category_filter = set(categories) if categories else None
    page_index_by_url = {
        entry.get("url"): entry
        for entry in page_index
        if isinstance(entry.get("url"), str)
    }
    by_url: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_category: dict[str, list[dict[str, Any]]] = {}

    for category, items in json_outputs.items():
        if category_filter and category not in category_filter and category != "unresolved":
            continue
        filtered_items: list[dict[str, Any]] = []
        for item in items:
            url = item.get("url")
            if not isinstance(url, str) or not url:
                continue
            if category_filter and category == "unresolved":
                page_entry = page_index_by_url.get(url)
                if page_entry is None or not url_matches_categories(page_entry, category_filter):
                    continue
            filtered_items.append(item)
            by_url[url].append({"category": category, "item": item})
        by_category[category] = filtered_items

    return dict(by_url), by_category


def build_url_inventory(
    checkpoint: dict[str, Any],
    page_index: list[dict[str, Any]],
    json_outputs: dict[str, list[dict[str, Any]]],
    categories: list[str] | None = None,
) -> list[dict[str, Any]]:
    expected = build_expected_inventory(page_index, categories)
    emitted_by_url, _ = build_emitted_inventory(json_outputs, page_index, categories)
    failed = checkpoint.get("failed", {}) if isinstance(checkpoint.get("failed", {}), dict) else {}
    completed = set(checkpoint.get("completed", [])) if isinstance(checkpoint.get("completed", []), list) else set()
    run_id = datetime.utcnow().isoformat() + "Z"

    rows: list[dict[str, Any]] = []
    all_urls = set(expected) | set(emitted_by_url) | set(failed) | completed

    for url in sorted(all_urls):
        entry = expected.get(url, {})
        emitted_entries = emitted_by_url.get(url, [])
        emitted_categories = sorted({item["category"] for item in emitted_entries})
        emitted_item = emitted_entries[0]["item"] if emitted_entries else {}
        fetch_error = failed.get(url)
        url_hash = make_url_hash(url)
        discovered = bool(entry) or bool(emitted_entries) or url in completed or url in failed
        fetched = bool(entry) or bool(emitted_entries) or url in completed
        row = {
            "url": url,
            "url_normalized": url,
            "url_hash": url_hash,
            "doc_id": f"doc_{url_hash[:16]}",
            "discovered": discovered,
            "fetched": fetched,
            "parsed": bool(emitted_entries),
            "resolved": bool(emitted_entries and "unresolved" not in emitted_categories),
            "emitted": bool(emitted_entries),
            "http_status": parse_http_status(fetch_error),
            "fetch_error": fetch_error,
            "parse_error": None,
            "page_state": entry.get("page_state"),
            "crawl_sources": entry.get("crawl_sources", []),
            "source_urls": [],
            "provisional_category": entry.get("provisional_category"),
            "resolved_category": entry.get("resolved_category") or (emitted_categories[0] if emitted_categories and emitted_categories[0] != "unresolved" else None),
            "resolution_confidence": entry.get("resolution_confidence") or emitted_item.get("resolution_confidence"),
            "resolution_evidence": entry.get("resolution_evidence") or emitted_item.get("resolution_evidence", []),
            "title": emitted_item.get("name"),
            "breadcrumbs": emitted_item.get("breadcrumbs", []),
            "subcategory": emitted_item.get("subcategory"),
            "raw_html_path": entry.get("filepath"),
            "text_length": len((emitted_item.get("description") or "").strip()),
            "content_hash": None,
            "is_duplicate": len(emitted_entries) > 1,
            "duplicate_of": None,
            "emitted_categories": emitted_categories,
            "run_id": run_id,
        }
        rows.append(row)

    return rows


def build_coverage_summary(inventory: list[dict[str, Any]], report: dict[str, Any]) -> dict[str, Any]:
    totals = {
        "discovered": sum(1 for row in inventory if row["discovered"]),
        "fetched": sum(1 for row in inventory if row["fetched"]),
        "failed": sum(1 for row in inventory if row["fetch_error"]),
        "parsed": sum(1 for row in inventory if row["parsed"]),
        "resolved": sum(1 for row in inventory if row["resolved"]),
        "unresolved": sum(1 for row in inventory if row["parsed"] and not row["resolved"]),
        "emitted": sum(1 for row in inventory if row["emitted"]),
        "duplicates": sum(1 for row in inventory if row["is_duplicate"]),
    }
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "totals": totals,
        "hard_error_count": sum(len(values) for values in report["details"]["hard_errors"].values()),
        "warning_count": sum(len(values) for values in report["details"]["warnings"].values()),
    }


def build_category_coverage(inventory: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    coverage: dict[str, Counter[str]] = defaultdict(Counter)
    for row in inventory:
        category = row.get("resolved_category") or row.get("provisional_category") or effective_category(row)
        if not isinstance(category, str):
            category = "unresolved"
        coverage[category]["discovered"] += int(bool(row["discovered"]))
        coverage[category]["fetched"] += int(bool(row["fetched"]))
        coverage[category]["parsed"] += int(bool(row["parsed"]))
        coverage[category]["resolved"] += int(bool(row["resolved"]))
        coverage[category]["emitted"] += int(bool(row["emitted"]))
        coverage[category]["failed"] += int(bool(row["fetch_error"]))
        coverage[category]["thin_content"] += int(row["text_length"] < 80 and bool(row["emitted"]))
    return {category: dict(counter) for category, counter in sorted(coverage.items())}


def build_failed_urls(checkpoint: dict[str, Any]) -> list[dict[str, Any]]:
    failed = checkpoint.get("failed", {})
    if not isinstance(failed, dict):
        return []
    return [
        {"url": url, "error": error}
        for url, error in sorted(failed.items())
    ]


def build_unresolved_urls(inventory: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        row for row in inventory
        if row["parsed"] and not row["resolved"]
    ]


def build_thin_content_report(inventory: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "url": row["url"],
            "title": row.get("title"),
            "resolved_category": row.get("resolved_category"),
            "text_length": row["text_length"],
            "reason": "thin_content",
        }
        for row in inventory
        if row["emitted"] and row["text_length"] < 80
    ]


def build_discovery_gaps(
    inventory: list[dict[str, Any]],
    checkpoint: dict[str, Any],
    page_index: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    completed = set(checkpoint.get("completed", [])) if isinstance(checkpoint.get("completed", []), list) else set()
    indexed_urls = {
        entry.get("url")
        for entry in page_index
        if isinstance(entry.get("url"), str)
    }

    for url in sorted(completed - indexed_urls):
        gaps.append({"url": url, "reason": "completed_without_page_index"})

    for row in inventory:
        if row["fetched"] and not row["parsed"] and row.get("page_state") in {"content", "hybrid"}:
            gaps.append({"url": row["url"], "reason": "parseable_not_emitted"})
    return gaps


def build_audit_report(
    checkpoint: dict[str, Any],
    page_index: list[dict[str, Any]],
    json_outputs: dict[str, list[dict[str, Any]]],
    categories: list[str] | None = None,
) -> dict[str, Any]:
    category_filter = set(categories) if categories else None
    expected = build_expected_inventory(page_index, categories)
    emitted_by_url, emitted_by_category = build_emitted_inventory(json_outputs, page_index, categories)
    hard_errors: dict[str, list[dict[str, Any]]] = defaultdict(list)
    warnings: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for url, entry in expected.items():
        emitted_entries = emitted_by_url.get(url, [])
        if not emitted_entries:
            hard_errors["missing_from_json"].append({"url": url, "expected_category": effective_category(entry)})

    for url, emitted_entries in emitted_by_url.items():
        page_entry = expected.get(url)
        emitted_categories = [item["category"] for item in emitted_entries]

        if category_filter and page_entry is None and set(emitted_categories) == {"unresolved"}:
            continue

        if page_entry is None:
            hard_errors["orphan_json"].append({"url": url, "categories": emitted_categories})
            continue

        categories_for_url = sorted(set(emitted_categories))
        if len(categories_for_url) > 1:
            hard_errors["duplicate_url_across_files"].append({"url": url, "categories": categories_for_url})

        emitted_category = categories_for_url[0] if categories_for_url else None
        expected_category = effective_category(page_entry)
        expected_categories = expected_categories_for_entry(page_entry)
        if (
            emitted_category
            and emitted_category != "unresolved"
            and expected_categories
            and emitted_category not in expected_categories
        ):
            hard_errors["category_mismatch"].append(
                {"url": url, "expected_category": expected_category, "emitted_category": emitted_category}
            )
        if emitted_category == "unresolved":
            warnings["unresolved_items"].append({"url": url})

    completed = set(checkpoint.get("completed", [])) if isinstance(checkpoint.get("completed", []), list) else set()
    if not category_filter:
        indexed_urls = {
            entry.get("url")
            for entry in page_index
            if isinstance(entry.get("url"), str)
        }
        for url in sorted(completed):
            if url not in indexed_urls:
                warnings["completed_without_page_index"].append({"url": url})

    summary = {
        "expected_parseable": len(expected),
        "emitted_urls": len(emitted_by_url),
        "hard_error_types": {key: len(values) for key, values in hard_errors.items()},
        "warning_types": {key: len(values) for key, values in warnings.items()},
    }

    return {
        "summary": summary,
        "details": {
            "hard_errors": dict(hard_errors),
            "warnings": dict(warnings),
        },
        "has_errors": any(hard_errors.values()),
        "emitted_by_category": {key: len(values) for key, values in emitted_by_category.items()},
    }


def format_audit_report(report: dict[str, Any]) -> str:
    summary = report["summary"]
    hard_errors = summary["hard_error_types"]
    warnings = summary["warning_types"]
    hard_error_text = ", ".join(f"{key}={value}" for key, value in sorted(hard_errors.items()) if value) or "none"
    warning_text = ", ".join(f"{key}={value}" for key, value in sorted(warnings.items()) if value) or "none"
    return (
        f"Audit summary: expected_parseable={summary['expected_parseable']} emitted_urls={summary['emitted_urls']} "
        f"hard_errors={hard_error_text} warnings={warning_text}"
    )


def write_audit_outputs(data_dir: Path, inventory: list[dict[str, Any]], report: dict[str, Any], checkpoint: dict[str, Any]):
    audit_dir = data_dir / "audit"
    write_jsonl(audit_dir / "url_inventory.jsonl", inventory)
    atomic_write_json(audit_dir / "coverage_summary.json", build_coverage_summary(inventory, report))
    atomic_write_json(audit_dir / "category_coverage.json", build_category_coverage(inventory))
    atomic_write_json(audit_dir / "failed_urls.json", build_failed_urls(checkpoint))
    atomic_write_json(audit_dir / "unresolved_urls.json", build_unresolved_urls(inventory))
    atomic_write_json(audit_dir / "empty_or_thin_content.json", build_thin_content_report(inventory))
    page_index = load_page_index(data_dir)
    atomic_write_json(audit_dir / "discovery_gaps.json", build_discovery_gaps(inventory, checkpoint, page_index))

    run_history_path = audit_dir / "run_history.jsonl"
    summary_row = build_coverage_summary(inventory, report)
    with open(run_history_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(summary_row, ensure_ascii=False) + "\n")


def run_audit(categories: list[str] | None = None, data_dir: Path = DATA_DIR) -> dict[str, Any]:
    checkpoint = load_checkpoint(data_dir)
    page_index = load_page_index(data_dir)
    json_outputs = load_json_outputs(data_dir)
    report = build_audit_report(checkpoint, page_index, json_outputs, categories)
    inventory = build_url_inventory(checkpoint, page_index, json_outputs, categories)
    write_audit_outputs(data_dir, inventory, report, checkpoint)
    return report
