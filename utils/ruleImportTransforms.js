const crypto = require('crypto');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function deriveCanonicalSlug(doc) {
    if (doc.doc_id) {
        return doc.doc_id;
    }

    const fallback = String(doc.url || doc.title || 'rule-page').toLowerCase();
    return fallback.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'rule-page';
}

function buildPageRow(doc, options = {}) {
    const normalizedContent = String(doc.embedding_text || '').trim();
    const sourceSnapshotAt = options.sourceSnapshotAt || null;
    const scraperVersion = options.scraperVersion || 'dsa_scraper_v3';
    const parserVersion = options.parserVersion || 'export_embeddings_v1';

    return {
        doc_id: doc.doc_id,
        source_item_id: doc.source_item_id || null,
        source_url: doc.url,
        url_hash: doc.url_hash || sha256(String(doc.url || '')),
        canonical_slug: deriveCanonicalSlug(doc),
        title: String(doc.title || doc.doc_id || 'Untitled Rule').trim(),
        category: String(doc.category || 'general').trim(),
        resolved_category: doc.resolved_category || null,
        subcategory: doc.subcategory || null,
        page_state: doc.page_state || null,
        is_unresolved: Boolean(doc.is_unresolved),
        resolution_confidence: doc.resolution_confidence || null,
        normalized_content: normalizedContent,
        content_hash: sha256(normalizedContent),
        parser_version: parserVersion,
        scraper_version: scraperVersion,
        source_snapshot_at: sourceSnapshotAt,
        version: 1,
        metadata: {
            breadcrumbs: Array.isArray(doc.breadcrumbs) ? doc.breadcrumbs : [],
            crawl_sources: Array.isArray(doc.crawl_sources) ? doc.crawl_sources : [],
            resolution_evidence: Array.isArray(doc.resolution_evidence) ? doc.resolution_evidence : [],
            properties: doc.properties && typeof doc.properties === 'object' ? doc.properties : {},
            description: doc.description || '',
            extensions: Array.isArray(doc.extensions) ? doc.extensions : [],
            raw_html_path: doc.raw_html_path || null,
            embedding_text_length: doc.embedding_text_length || normalizedContent.length,
        },
        last_seen_at: sourceSnapshotAt,
        deleted_at: null,
    };
}

function buildChunkRow(chunk, pageId, options = {}) {
    return {
        chunk_id: chunk.chunk_id,
        page_id: pageId,
        version: options.version || 1,
        chunk_index: chunk.chunk_index,
        title: chunk.title || null,
        category: String(chunk.category || 'general').trim(),
        resolved_category: chunk.resolved_category || null,
        heading: chunk.title || null,
        chunk_text: String(chunk.chunk_text || '').trim(),
        char_start: Number.isInteger(chunk.char_start) ? chunk.char_start : null,
        char_end: Number.isInteger(chunk.char_end) ? chunk.char_end : null,
        is_unresolved: Boolean(chunk.is_unresolved),
        metadata: {
            source_item_id: chunk.source_item_id || null,
            page_state: chunk.page_state || null,
            resolution_confidence: chunk.resolution_confidence || null,
            breadcrumbs: Array.isArray(chunk.breadcrumbs) ? chunk.breadcrumbs : [],
        },
        is_active: true,
    };
}

function buildLegacyTitle(doc, chunkIndex, totalChunks, duplicateTitleCount = 1) {
    let title = String(doc.title || doc.doc_id || 'Untitled Rule').trim();

    if (totalChunks > 1) {
        title += ` (part ${chunkIndex + 1}/${totalChunks})`;
    }

    if (duplicateTitleCount > 1) {
        title += ` [${doc.doc_id}]`;
    }

    return title;
}

function buildLegacyRuleRow(doc, chunk, context = {}) {
    const totalChunks = context.totalChunks || 1;
    const duplicateTitleCount = context.duplicateTitleCount || 1;
    const sourceSnapshotAt = context.sourceSnapshotAt || null;

    return {
        title: buildLegacyTitle(doc, chunk.chunk_index || 0, totalChunks, duplicateTitleCount),
        content: String(chunk.chunk_text || '').trim(),
        category: String(
            doc.resolved_category || doc.category || chunk.resolved_category || chunk.category || 'general'
        ).trim(),
        sourceUrl: doc.url,
        metadata: {
            imported_from: 'dsa_scraper_v3',
            doc_id: doc.doc_id,
            chunk_id: chunk.chunk_id,
            source_item_id: doc.source_item_id || chunk.source_item_id || null,
            chunk_index: chunk.chunk_index || 0,
            total_chunks: totalChunks,
            resolved_category: doc.resolved_category || chunk.resolved_category || null,
            subcategory: doc.subcategory || null,
            page_state: doc.page_state || chunk.page_state || null,
            is_unresolved: Boolean(doc.is_unresolved || chunk.is_unresolved),
            resolution_confidence: doc.resolution_confidence || chunk.resolution_confidence || null,
            breadcrumbs: Array.isArray(doc.breadcrumbs)
                ? doc.breadcrumbs
                : Array.isArray(chunk.breadcrumbs)
                  ? chunk.breadcrumbs
                  : [],
            crawl_sources: Array.isArray(doc.crawl_sources) ? doc.crawl_sources : [],
            raw_html_path: doc.raw_html_path || null,
            char_start: Number.isInteger(chunk.char_start) ? chunk.char_start : null,
            char_end: Number.isInteger(chunk.char_end) ? chunk.char_end : null,
            source_snapshot_at: sourceSnapshotAt,
        },
    };
}

module.exports = {
    buildChunkRow,
    buildLegacyRuleRow,
    buildPageRow,
    buildLegacyTitle,
    deriveCanonicalSlug,
    sha256,
};
