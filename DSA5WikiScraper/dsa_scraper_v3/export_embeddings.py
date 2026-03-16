import argparse
import json
import logging
from pathlib import Path
from typing import Any

import audit


DATA_DIR = Path(__file__).parent / "data"
EXPORT_DIR = DATA_DIR / "embeddings"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def atomic_write_json(path: Path, data: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    temp_path.replace(path)


def write_jsonl(path: Path, rows: list[dict[str, Any]]):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    temp_path.replace(path)


def flatten_properties(properties: dict[str, Any]) -> str:
    if not isinstance(properties, dict) or not properties:
        return ""
    lines = [
        f"{key}: {value}"
        for key, value in properties.items()
        if value is not None and str(value).strip() != ""
    ]
    return "\n".join(lines)


def flatten_extensions(extensions: list[dict[str, Any]]) -> str:
    if not isinstance(extensions, list) or not extensions:
        return ""
    parts = []
    for extension in extensions:
        name = extension.get("name", "")
        description = extension.get("description", "")
        text = f"{name}: {description}".strip(": ")
        if text:
            parts.append(text)
    return "\n".join(parts)


def build_embedding_text(item: dict[str, Any]) -> str:
    sections: list[str] = []

    title = (item.get("name") or "").strip()
    if title:
        sections.append(f"Title: {title}")

    category = (item.get("category") or "").strip()
    if category:
        sections.append(f"Category: {category}")

    breadcrumbs = item.get("breadcrumbs", [])
    if isinstance(breadcrumbs, list) and breadcrumbs:
        sections.append("Breadcrumbs: " + " > ".join(str(part) for part in breadcrumbs if part))

    subcategory = (item.get("subcategory") or "").strip()
    if subcategory:
        sections.append(f"Subcategory: {subcategory}")

    properties_text = flatten_properties(item.get("properties", {}))
    if properties_text:
        sections.append("Properties:\n" + properties_text)

    description = (item.get("description") or "").strip()
    if description:
        sections.append("Description:\n" + description)

    extensions_text = flatten_extensions(item.get("extensions", []))
    if extensions_text:
        sections.append("Extensions:\n" + extensions_text)

    return "\n\n".join(section for section in sections if section).strip()


def is_embeddable_item(item: dict[str, Any], embedding_text: str) -> bool:
    if not embedding_text.strip():
        return False

    if (item.get("name") or "").strip():
        return True
    breadcrumbs = item.get("breadcrumbs", [])
    if isinstance(breadcrumbs, list) and any(str(part).strip() for part in breadcrumbs):
        return True
    if flatten_properties(item.get("properties", {})).strip():
        return True
    if (item.get("description") or "").strip():
        return True
    if flatten_extensions(item.get("extensions", [])).strip():
        return True
    return False


def load_url_inventory(data_dir: Path = DATA_DIR) -> list[dict[str, Any]]:
    inventory_path = data_dir / "audit" / "url_inventory.jsonl"
    rows: list[dict[str, Any]] = []
    if not inventory_path.exists():
        return rows
    with open(inventory_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def build_canonical_documents_from_records(
    url_inventory: list[dict[str, Any]],
    json_outputs: dict[str, list[dict[str, Any]]],
    page_index: list[dict[str, Any]] | None = None,
    categories: list[str] | None = None,
) -> list[dict[str, Any]]:
    category_filter = set(categories) if categories else None
    by_url, _ = audit.build_emitted_inventory(json_outputs, page_index or [], categories)
    docs: list[dict[str, Any]] = []

    for inventory_row in url_inventory:
        url = inventory_row.get("url")
        if not isinstance(url, str) or not url:
            continue
        emitted_entries = by_url.get(url, [])
        if not emitted_entries:
            continue

        emitted_category = emitted_entries[0]["category"]
        if category_filter and emitted_category not in category_filter and emitted_category != "unresolved":
            continue

        item = dict(emitted_entries[0]["item"])
        resolved_category = inventory_row.get("resolved_category")
        is_unresolved = item.get("category") == "unresolved" or not resolved_category
        embedding_text = build_embedding_text(item)
        embeddable = is_embeddable_item(item, embedding_text)
        exclude_reason = None if embeddable else "no_informational_text"

        doc = {
            "doc_id": inventory_row.get("doc_id") or f"doc_{audit.make_url_hash(url)[:16]}",
            "source_item_id": item.get("id"),
            "url": url,
            "url_hash": inventory_row.get("url_hash") or audit.make_url_hash(url),
            "title": item.get("name") or "",
            "category": item.get("category") or emitted_category,
            "resolved_category": resolved_category,
            "is_unresolved": is_unresolved,
            "breadcrumbs": item.get("breadcrumbs", []),
            "subcategory": item.get("subcategory"),
            "page_state": inventory_row.get("page_state"),
            "resolution_confidence": inventory_row.get("resolution_confidence") or item.get("resolution_confidence"),
            "resolution_evidence": inventory_row.get("resolution_evidence") or item.get("resolution_evidence", []),
            "properties": item.get("properties", {}),
            "description": item.get("description", ""),
            "extensions": item.get("extensions", []),
            "crawl_sources": inventory_row.get("crawl_sources", []),
            "raw_html_path": inventory_row.get("raw_html_path"),
            "embedding_text": embedding_text,
            "embedding_text_length": len(embedding_text),
            "embeddable": embeddable,
            "exclude_reason": exclude_reason,
        }
        docs.append(doc)

    docs.sort(key=lambda row: row["doc_id"])
    return docs


def split_text(text: str, max_chars: int, overlap_chars: int) -> list[tuple[int, int, str]]:
    if not text.strip():
        return []

    paragraphs = [part.strip() for part in text.split("\n\n") if part.strip()]

    def hard_split(segment: str, start_offset: int) -> list[tuple[int, int, str]]:
        pieces: list[tuple[int, int, str]] = []
        step = max(1, max_chars - overlap_chars)
        pos = 0
        while pos < len(segment):
            end = min(len(segment), pos + max_chars)
            chunk_text = segment[pos:end]
            pieces.append((start_offset + pos, start_offset + end, chunk_text))
            if end >= len(segment):
                break
            pos += step
        return pieces

    chunks: list[tuple[int, int, str]] = []
    current_parts: list[str] = []
    current_start = 0
    current_end = 0
    cursor = 0

    for paragraph in paragraphs:
        paragraph_start = text.find(paragraph, cursor)
        if paragraph_start == -1:
            paragraph_start = cursor
        paragraph_end = paragraph_start + len(paragraph)
        separator = "\n\n" if current_parts else ""
        current_text = separator.join(current_parts)
        candidate = current_text + separator + paragraph if current_parts else paragraph

        if len(paragraph) > max_chars and not current_parts:
            chunks.extend(hard_split(paragraph, paragraph_start))
            cursor = paragraph_end
            continue

        if current_parts and len(candidate) > max_chars:
            finalized_text = "\n\n".join(current_parts)
            chunks.append((current_start, current_end, finalized_text))

            if len(paragraph) > max_chars:
                chunks.extend(hard_split(paragraph, paragraph_start))
                current_parts = []
                current_start = 0
                current_end = 0
                cursor = paragraph_end
                continue

            current_parts = [paragraph]
            current_start = paragraph_start
            current_end = paragraph_end
        else:
            if not current_parts:
                current_start = paragraph_start
            current_parts.append(paragraph)
            current_end = paragraph_end

        cursor = paragraph_end

    if current_parts:
        finalized_text = "\n\n".join(current_parts)
        chunks.append((current_start, current_end, finalized_text))

    return chunks


def build_chunks(
    canonical_docs: list[dict[str, Any]],
    max_chars: int = 1400,
    overlap_chars: int = 200,
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for doc in canonical_docs:
        if not doc.get("embeddable"):
            continue

        text = doc.get("embedding_text", "")
        text_chunks = split_text(text, max_chars=max_chars, overlap_chars=overlap_chars)
        if not text_chunks:
            text_chunks = [(0, len(text), text)]

        for index, (char_start, char_end, chunk_text) in enumerate(text_chunks):
            chunks.append({
                "chunk_id": f"{doc['doc_id']}_chunk_{index:03d}",
                "doc_id": doc["doc_id"],
                "url": doc["url"],
                "category": doc["category"],
                "resolved_category": doc.get("resolved_category"),
                "title": doc.get("title"),
                "chunk_index": index,
                "chunk_text": chunk_text,
                "char_start": char_start,
                "char_end": char_end,
                "page_state": doc.get("page_state"),
                "resolution_confidence": doc.get("resolution_confidence"),
                "is_unresolved": doc.get("is_unresolved"),
                "source_item_id": doc.get("source_item_id"),
                "breadcrumbs": doc.get("breadcrumbs", []),
            })
    return chunks


def build_export_summary(
    canonical_docs: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
    audit_summary: dict[str, Any],
    failed_urls: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "doc_count": len(canonical_docs),
        "chunk_count": len(chunks),
        "unresolved_doc_count": sum(1 for doc in canonical_docs if doc["is_unresolved"]),
        "embeddable_doc_count": sum(1 for doc in canonical_docs if doc["embeddable"]),
        "excluded_doc_count": sum(1 for doc in canonical_docs if not doc["embeddable"]),
        "failed_url_count": len(failed_urls),
        "audit_hard_error_count": audit_summary.get("hard_error_count", 0),
        "audit_warning_count": audit_summary.get("warning_count", 0),
        "uses_audit_doc_ids": True,
        "includes_unresolved_docs": True,
        "default_excludes_unresolved_chunks": False,
    }


def export_embeddings(
    data_dir: Path = DATA_DIR,
    output_dir: Path = EXPORT_DIR,
    categories: list[str] | None = None,
    docs_only: bool = False,
    chunks_only: bool = False,
) -> dict[str, Any]:
    json_outputs = audit.load_json_outputs(data_dir)
    checkpoint = audit.load_checkpoint(data_dir)
    page_index = audit.load_page_index(data_dir)
    audit_summary = audit.load_json_file(data_dir / "audit" / "coverage_summary.json", {})
    url_inventory = load_url_inventory(data_dir)
    if not url_inventory:
        url_inventory = audit.build_url_inventory(checkpoint, page_index, json_outputs, categories)

    canonical_docs = build_canonical_documents_from_records(url_inventory, json_outputs, page_index, categories)
    chunks = build_chunks(canonical_docs) if not docs_only else []
    failed_urls = audit.build_failed_urls(checkpoint)
    summary = build_export_summary(canonical_docs, chunks, audit_summary, failed_urls)

    output_dir.mkdir(parents=True, exist_ok=True)
    if not chunks_only:
        write_jsonl(output_dir / "canonical_documents.jsonl", canonical_docs)
    if not docs_only:
        write_jsonl(output_dir / "chunks.jsonl", chunks)
    atomic_write_json(output_dir / "export_summary.json", summary)

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Export embedding-ready corpus from scraper outputs")
    parser.add_argument("--input-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=EXPORT_DIR)
    parser.add_argument("--categories", type=str, default=None)
    parser.add_argument("--docs-only", action="store_true")
    parser.add_argument("--chunks-only", action="store_true")
    args = parser.parse_args()

    categories = None
    if args.categories:
        categories = [part.strip() for part in args.categories.split(",") if part.strip()]

    summary = export_embeddings(
        data_dir=args.input_dir,
        output_dir=args.output_dir,
        categories=categories,
        docs_only=args.docs_only,
        chunks_only=args.chunks_only,
    )
    logger.info(
        "Embedding export complete: docs=%s chunks=%s unresolved=%s failed_urls=%s",
        summary["doc_count"],
        summary["chunk_count"],
        summary["unresolved_doc_count"],
        summary["failed_url_count"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
