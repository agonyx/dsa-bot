const {
    buildChunkRow,
    buildLegacyRuleRow,
    buildPageRow,
    buildLegacyTitle,
    deriveCanonicalSlug,
    sha256,
} = require('../utils/ruleImportTransforms');

describe('rule import transforms', () => {
    const doc = {
        doc_id: 'doc_123',
        source_item_id: 'rules_foo',
        url: 'https://dsa.ulisses-regelwiki.de/foo.html',
        url_hash: 'hash123',
        title: 'Foo Rule',
        category: 'rules',
        resolved_category: 'rules',
        subcategory: 'Basics',
        page_state: 'content',
        is_unresolved: false,
        resolution_confidence: 'high',
        breadcrumbs: ['DSA Regel-Wiki', 'Regeln'],
        properties: { Wirkung: 'Something' },
        description: 'Useful rule text.',
        extensions: [{ name: 'Ext', description: 'More' }],
        crawl_sources: ['rules'],
        raw_html_path: 'html/rules/foo.html',
        embedding_text: 'Title: Foo Rule\n\nDescription: Useful rule text.',
        embedding_text_length: 47,
    };

    const chunk = {
        chunk_id: 'doc_123_chunk_000',
        chunk_index: 0,
        title: 'Foo Rule',
        category: 'rules',
        resolved_category: 'rules',
        chunk_text: 'Title: Foo Rule\n\nDescription: Useful rule text.',
        char_start: 0,
        char_end: 47,
        page_state: 'content',
        resolution_confidence: 'high',
        is_unresolved: false,
        source_item_id: 'rules_foo',
        breadcrumbs: ['DSA Regel-Wiki', 'Regeln'],
    };

    test('deriveCanonicalSlug prefers doc_id', () => {
        expect(deriveCanonicalSlug(doc)).toBe('doc_123');
    });

    test('buildPageRow maps scraper document to rule_pages shape', () => {
        const row = buildPageRow(doc, {
            parserVersion: 'export_embeddings_v1',
            scraperVersion: 'dsa_scraper_v3',
            sourceSnapshotAt: '2026-03-16T13:46:37.750051Z',
        });

        expect(row.doc_id).toBe('doc_123');
        expect(row.source_url).toBe(doc.url);
        expect(row.normalized_content).toBe(doc.embedding_text);
        expect(row.content_hash).toBe(sha256(doc.embedding_text));
        expect(row.metadata.breadcrumbs).toEqual(doc.breadcrumbs);
        expect(row.metadata.properties).toEqual(doc.properties);
    });

    test('buildChunkRow maps scraper chunk to rule_chunks shape', () => {
        const row = buildChunkRow(chunk, 'page-uuid', { version: 2 });

        expect(row.page_id).toBe('page-uuid');
        expect(row.version).toBe(2);
        expect(row.chunk_id).toBe('doc_123_chunk_000');
        expect(row.chunk_text).toBe(chunk.chunk_text);
        expect(row.metadata.source_item_id).toBe('rules_foo');
    });

    test('buildLegacyTitle appends part numbers and doc id when needed', () => {
        expect(buildLegacyTitle(doc, 1, 3, 2)).toBe('Foo Rule (part 2/3) [doc_123]');
    });

    test('buildLegacyRuleRow preserves scraper metadata for fallback import', () => {
        const row = buildLegacyRuleRow(doc, chunk, {
            totalChunks: 2,
            duplicateTitleCount: 1,
            sourceSnapshotAt: '2026-03-16T13:46:37.750051Z',
        });

        expect(row.title).toBe('Foo Rule (part 1/2)');
        expect(row.content).toBe(chunk.chunk_text);
        expect(row.category).toBe('rules');
        expect(row.sourceUrl).toBe(doc.url);
        expect(row.metadata.doc_id).toBe('doc_123');
        expect(row.metadata.total_chunks).toBe(2);
    });
});
