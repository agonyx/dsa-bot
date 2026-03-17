const { getRulePageTitles, getRankedTitleMatches, hybridSearch } = require('../utils/rulesClient');

// Set required environment variable before importing
process.env.OPENAI_API_KEY = 'test-api-key';

// Mock OpenAI before it's imported by rulesClient
jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
        embeddings: {
            create: jest.fn().mockResolvedValue({
                data: [{ embedding: new Array(1536).fill(0) }],
            }),
        },
    }));
});

// Mock the supabase client
jest.mock('../utils/supabaseClient', () => ({
    supabase: {
        from: jest.fn(),
        rpc: jest.fn(),
    },
}));

const { supabase } = require('../utils/supabaseClient');

describe('rulesClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getRulePageTitles', () => {
        test('returns normalized page titles from rule_pages', async () => {
            const mockData = [
                {
                    doc_id: 'doc_1',
                    title: 'Foo Rule',
                    category: 'rules',
                    resolved_category: 'combat',
                    source_url: 'https://example.com/foo',
                },
                {
                    doc_id: 'doc_2',
                    title: 'Bar Spell',
                    category: 'spells',
                    resolved_category: 'magic',
                    source_url: 'https://example.com/bar',
                },
            ];

            const mockQuery = {
                select: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
            };

            supabase.from.mockReturnValue(mockQuery);

            const result = await getRulePageTitles();

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                doc_id: 'doc_1',
                title: 'Foo Rule',
                title_lower: 'foo rule',
                category: 'rules',
                resolved_category: 'combat',
                source_url: 'https://example.com/foo',
            });
            expect(result[1]).toEqual({
                doc_id: 'doc_2',
                title: 'Bar Spell',
                title_lower: 'bar spell',
                category: 'spells',
                resolved_category: 'magic',
                source_url: 'https://example.com/bar',
            });
        });

        test('falls back to rule_documents when rule_pages is missing', async () => {
            const mockLegacyData = [
                {
                    id: 1,
                    title: 'Legacy Rule',
                    category: 'rules',
                    source_url: 'https://example.com/legacy',
                    metadata: { resolved_category: 'basics' },
                },
            ];

            const mockRulePagesQuery = {
                select: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } }),
            };

            const mockLegacyQuery = {
                select: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({ data: mockLegacyData, error: null }),
            };

            supabase.from.mockReturnValueOnce(mockRulePagesQuery).mockReturnValueOnce(mockLegacyQuery);

            const result = await getRulePageTitles();

            expect(result).toHaveLength(1);
            expect(result[0].doc_id).toBe('1');
            expect(result[0].title).toBe('Legacy Rule');
            expect(result[0].resolved_category).toBe('basics');
        });

        test('throws on unrecoverable database error', async () => {
            const mockQuery = {
                select: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest
                    .fn()
                    .mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'Database failure' } }),
            };

            supabase.from.mockReturnValue(mockQuery);

            await expect(getRulePageTitles()).rejects.toEqual({ code: 'OTHER', message: 'Database failure' });
        });
    });
});

describe('cache refresh behavior', () => {
    test('preserves existing cache on refresh failure', async () => {
        // Simulate the refresh pattern: existing cache should be preserved when getRulePageTitles throws
        const existingCache = [
            {
                doc_id: 'doc_1',
                title: 'Cached Rule',
                title_lower: 'cached rule',
                category: 'rules',
                resolved_category: null,
                source_url: 'https://example.com/cached',
            },
        ];

        // Simulate cache refresh failure
        const mockQuery = {
            select: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            order: jest
                .fn()
                .mockResolvedValue({ data: null, error: { code: 'CONNECTION_ERROR', message: 'Connection failed' } }),
        };

        supabase.from.mockReturnValue(mockQuery);

        // Simulate the refresh logic from index.js
        let rulePageTitleCache = [...existingCache];
        try {
            const titles = await getRulePageTitles();
            rulePageTitleCache = titles;
        } catch {
            // On error, preserve existing cache (do nothing)
        }

        // Cache should still contain the original data
        expect(rulePageTitleCache).toEqual(existingCache);
    });

    test('hydrates rule page title cache on successful fetch', async () => {
        const mockData = [
            {
                doc_id: 'doc_1',
                title: 'New Rule',
                category: 'rules',
                resolved_category: null,
                source_url: 'https://example.com/new',
            },
        ];

        const mockQuery = {
            select: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
        };

        supabase.from.mockReturnValue(mockQuery);

        // Simulate the refresh logic from index.js
        let rulePageTitleCache = [];
        try {
            const titles = await getRulePageTitles();
            rulePageTitleCache = titles;
        } catch {
            // On error, preserve existing cache
        }

        expect(rulePageTitleCache).toHaveLength(1);
        expect(rulePageTitleCache[0].doc_id).toBe('doc_1');
        expect(rulePageTitleCache[0].title_lower).toBe('new rule');
    });
});

describe('getRankedTitleMatches', () => {
    const mockCache = [
        {
            doc_id: 'doc_1',
            title: 'Finte I',
            title_lower: 'finte i',
            category: 'combat',
            resolved_category: 'kampf',
            source_url: 'https://example.com/finte-i',
        },
        {
            doc_id: 'doc_2',
            title: 'Finte II',
            title_lower: 'finte ii',
            category: 'combat',
            resolved_category: 'kampf',
            source_url: 'https://example.com/finte-ii',
        },
        {
            doc_id: 'doc_3',
            title: 'Finte III',
            title_lower: 'finte iii',
            category: 'combat',
            resolved_category: 'kampf',
            source_url: 'https://example.com/finte-iii',
        },
        {
            doc_id: 'doc_4',
            title: 'Ausweichen I',
            title_lower: 'ausweichen i',
            category: 'combat',
            resolved_category: 'kampf',
            source_url: 'https://example.com/ausweichen-i',
        },
        {
            doc_id: 'doc_5',
            title: 'Ausweichen II',
            title_lower: 'ausweichen ii',
            category: 'combat',
            resolved_category: 'kampf',
            source_url: 'https://example.com/ausweichen-ii',
        },
        {
            doc_id: 'doc_6',
            title: 'Drache',
            title_lower: 'drache',
            category: 'creatures',
            resolved_category: 'wesen',
            source_url: 'https://example.com/drache',
        },
        {
            doc_id: 'doc_7',
            title: 'Feuerdrache',
            title_lower: 'feuerdrache',
            category: 'creatures',
            resolved_category: 'wesen',
            source_url: 'https://example.com/feuerdrache',
        },
    ];

    test('ranks exact prefix and contains title matches', () => {
        // Query "finte" should match: Finte I (prefix), Finte II (prefix), Finte III (prefix)
        const result = getRankedTitleMatches('finte', mockCache);

        expect(result).toHaveLength(3);
        expect(result[0].match_type).toBe('prefix');
        expect(result[0].title).toBe('Finte I');
        expect(result[1].match_type).toBe('prefix');
        expect(result[1].title).toBe('Finte II');
        expect(result[2].match_type).toBe('prefix');
        expect(result[2].title).toBe('Finte III');
    });

    test('ranks exact match first then prefix then contains', () => {
        // Query "drache" should match: Drache (exact), Feuerdrache (contains)
        const result = getRankedTitleMatches('drache', mockCache);

        expect(result).toHaveLength(2);
        expect(result[0].match_type).toBe('exact');
        expect(result[0].title).toBe('Drache');
        expect(result[1].match_type).toBe('contains');
        expect(result[1].title).toBe('Feuerdrache');
    });

    test('filters ranked title matches by category', () => {
        // Query "finte" in category "creatures" should return empty
        const resultCreatures = getRankedTitleMatches('finte', mockCache, { category: 'creatures' });
        expect(resultCreatures).toHaveLength(0);

        // Query "finte" in category "combat" should return matches
        const resultCombat = getRankedTitleMatches('finte', mockCache, { category: 'combat' });
        expect(resultCombat).toHaveLength(3);
        expect(resultCombat[0].category).toBe('combat');
    });

    test('returns empty array for empty query', () => {
        const result = getRankedTitleMatches('', mockCache);
        expect(result).toHaveLength(0);
    });

    test('returns empty array for empty cache', () => {
        const result = getRankedTitleMatches('finte', []);
        expect(result).toHaveLength(0);
    });

    test('limits results to 3', () => {
        // Query "i" should match many items but only return 3
        const result = getRankedTitleMatches('i', mockCache);
        expect(result).toHaveLength(3);
    });

    test('deduplicates by doc_id', () => {
        const duplicateCache = [
            ...mockCache,
            {
                doc_id: 'doc_1', // duplicate doc_id
                title: 'Finte I Duplicate',
                title_lower: 'finte i duplicate',
                category: 'combat',
                resolved_category: 'kampf',
                source_url: 'https://example.com/finte-i-dup',
            },
        ];

        const result = getRankedTitleMatches('finte', duplicateCache);
        const docIds = result.map(r => r.doc_id);

        // doc_1 should only appear once
        expect(docIds.filter(id => id === 'doc_1')).toHaveLength(1);
    });

    test('match type is case-insensitive', () => {
        // Query "FINTE" should match "Finte I" (case-insensitive)
        const result = getRankedTitleMatches('FINTE', mockCache);

        expect(result).toHaveLength(3);
        expect(result[0].title).toBe('Finte I');
        expect(result[0].match_type).toBe('prefix');
    });
});

describe('hybridSearch', () => {
    const mockCache = [
        {
            doc_id: 'doc_1',
            title: 'Wuchtschlag',
            title_lower: 'wuchtschlag',
            category: 'combat',
            resolved_category: 'kampf',
            source_url: 'https://example.com/wuchtschlag',
        },
        {
            doc_id: 'doc_2',
            title: 'Wuchtschlag II',
            title_lower: 'wuchtschlag ii',
            category: 'combat',
            resolved_category: 'kampf',
            source_url: 'https://example.com/wuchtschlag-ii',
        },
        {
            doc_id: 'doc_3',
            title: 'Finte I',
            title_lower: 'finte i',
            category: 'combat',
            resolved_category: 'kampf',
            source_url: 'https://example.com/finte-i',
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock fetchPageContent chain for exact matches
        const mockPageQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
                data: {
                    doc_id: 'doc_1',
                    title: 'Wuchtschlag',
                    normalized_content: 'Wuchtschlag content...',
                    category: 'combat',
                    resolved_category: 'kampf',
                    source_url: 'https://example.com/wuchtschlag',
                },
                error: null,
            }),
        };
        supabase.from.mockImplementation(table => {
            if (table === 'rule_pages') {
                return mockPageQuery;
            }
            return { select: jest.fn().mockReturnThis() };
        });
    });

    test('keeps exact page first while preserving semantic matches', async () => {
        // Mock searchRules to return semantic results
        const mockSemanticResults = [
            {
                page_id: 'page-1',
                doc_id: 'doc_1',
                title: 'Wuchtschlag',
                category: 'combat',
                resolved_category: 'kampf',
                source_url: 'https://example.com/wuchtschlag',
                chunk_text: 'Wuchtschlag content...',
                similarity: 0.85,
            },
            {
                page_id: 'page-4',
                doc_id: 'doc_4',
                title: 'Attacke',
                category: 'combat',
                resolved_category: 'kampf',
                source_url: 'https://example.com/attacke',
                chunk_text: 'Attacke content...',
                similarity: 0.75,
            },
        ];

        // Mock the supabase RPC call for searchRules
        supabase.rpc.mockResolvedValue({
            data: mockSemanticResults,
            error: null,
        });

        const result = await hybridSearch('Wuchtschlag', mockCache, { limit: 3 });

        // Selected page should be the exact match
        expect(result.selectedPage).not.toBeNull();
        expect(result.selectedPage.title).toBe('Wuchtschlag');
        expect(result.selectedPage.match_type).toBe('exact');

        // Exact matches should contain the Wuchtschlag entries
        expect(result.exactMatches).toHaveLength(2);
        expect(result.exactMatches[0].match_type).toBe('exact');
        expect(result.exactMatches[0].title).toBe('Wuchtschlag');

        // Semantic matches should still be present (deduplicated)
        expect(result.semanticMatches.length).toBeGreaterThan(0);
        expect(result.semanticMatches[0].match_type).toBe('semantic');
    });

    test('deduplicates semantic matches by page', async () => {
        // Multiple chunks from the same page
        const mockSemanticResults = [
            {
                page_id: 'page-1',
                doc_id: 'doc_1',
                title: 'Wuchtschlag',
                category: 'combat',
                chunk_text: 'Wuchtschlag chunk 1...',
                similarity: 0.9,
            },
            {
                page_id: 'page-1', // Same page as first result
                doc_id: 'doc_1',
                title: 'Wuchtschlag',
                category: 'combat',
                chunk_text: 'Wuchtschlag chunk 2...',
                similarity: 0.85,
            },
            {
                page_id: 'page-2',
                doc_id: 'doc_2',
                title: 'Finte',
                category: 'combat',
                chunk_text: 'Finte content...',
                similarity: 0.8,
            },
        ];

        supabase.rpc.mockResolvedValue({
            data: mockSemanticResults,
            error: null,
        });

        const result = await hybridSearch('test', mockCache, { limit: 5 });

        // Semantic results should be deduplicated to one per page
        const pageIds = result.semanticMatches.map(r => r.page_id);
        const uniquePageIds = new Set(pageIds);
        expect(pageIds.length).toBe(uniquePageIds.size);

        // Should only have 2 unique pages
        expect(result.semanticMatches).toHaveLength(2);
        expect(result.semanticMatches[0].page_id).toBe('page-1');
        expect(result.semanticMatches[1].page_id).toBe('page-2');
    });

    test('selects first semantic result when no exact match exists', async () => {
        const mockSemanticResults = [
            {
                page_id: 'page-1',
                doc_id: 'doc_1',
                title: 'Combat Rules',
                category: 'combat',
                chunk_text: 'Combat content...',
                similarity: 0.8,
            },
            {
                page_id: 'page-2',
                doc_id: 'doc_2',
                title: 'Magic Rules',
                category: 'magic',
                chunk_text: 'Magic content...',
                similarity: 0.7,
            },
        ];

        supabase.rpc.mockResolvedValue({
            data: mockSemanticResults,
            error: null,
        });

        // Query that won't match any titles exactly
        const result = await hybridSearch('kampf regeln', mockCache, { limit: 3 });

        // No exact matches
        expect(result.exactMatches).toHaveLength(0);

        // Selected page should be the first semantic result
        expect(result.selectedPage).not.toBeNull();
        expect(result.selectedPage.title).toBe('Combat Rules');
        expect(result.selectedPage.match_type).toBe('semantic');
    });

    test('respects category filter for both exact and semantic matches', async () => {
        const mockSemanticResults = [
            {
                page_id: 'page-1',
                doc_id: 'doc_1',
                title: 'Combat Rule',
                category: 'combat',
                chunk_text: 'Combat content...',
                similarity: 0.8,
            },
        ];

        supabase.rpc.mockResolvedValue({
            data: mockSemanticResults,
            error: null,
        });

        // Filter by 'creatures' category which has no matches in mockCache
        const result = await hybridSearch('Wuchtschlag', mockCache, {
            category: 'creatures',
            limit: 3,
        });

        // No exact matches in creatures category
        expect(result.exactMatches).toHaveLength(0);
    });

    test('caps exact matches at 3 entries', async () => {
        const largeCache = [
            { doc_id: 'doc_1', title: 'Test I', title_lower: 'test i', category: 'test' },
            { doc_id: 'doc_2', title: 'Test II', title_lower: 'test ii', category: 'test' },
            { doc_id: 'doc_3', title: 'Test III', title_lower: 'test iii', category: 'test' },
            { doc_id: 'doc_4', title: 'Test IV', title_lower: 'test iv', category: 'test' },
            { doc_id: 'doc_5', title: 'Test V', title_lower: 'test v', category: 'test' },
        ];

        supabase.rpc.mockResolvedValue({ data: [], error: null });

        const result = await hybridSearch('Test', largeCache, { limit: 3 });

        // Exact matches capped at 3
        expect(result.exactMatches.length).toBeLessThanOrEqual(3);
    });

    test('returns null selectedPage when no matches exist', async () => {
        supabase.rpc.mockResolvedValue({ data: [], error: null });

        const result = await hybridSearch('nonexistent query', [], { limit: 3 });

        expect(result.selectedPage).toBeNull();
        expect(result.exactMatches).toHaveLength(0);
        expect(result.semanticMatches).toHaveLength(0);
    });

    test('preserves semantic results when query matches exact title', async () => {
        // Exact match query should still return semantic results
        const mockSemanticResults = [
            {
                page_id: 'page-1',
                doc_id: 'doc_1',
                title: 'Wuchtschlag',
                category: 'combat',
                chunk_text: 'Wuchtschlag content...',
                similarity: 0.9,
            },
            {
                page_id: 'page-2',
                doc_id: 'doc_4',
                title: 'Related Combat Rule',
                category: 'combat',
                chunk_text: 'Related content...',
                similarity: 0.7,
            },
        ];

        supabase.rpc.mockResolvedValue({
            data: mockSemanticResults,
            error: null,
        });

        const result = await hybridSearch('Wuchtschlag', mockCache, { limit: 3 });

        // Should have exact match as selected page
        expect(result.selectedPage.match_type).toBe('exact');

        // Should still have semantic matches (not just the exact match page)
        expect(result.semanticMatches.length).toBeGreaterThan(0);
    });
});
