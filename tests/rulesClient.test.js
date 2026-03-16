const { getRulePageTitles, getRankedTitleMatches } = require('../utils/rulesClient');

// Mock OpenAI before it's imported by rulesClient
jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
        embeddings: {
            create: jest.fn(),
        },
    }));
});

// Mock the supabase client
jest.mock('../utils/supabaseClient', () => ({
    supabase: {
        from: jest.fn(),
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
