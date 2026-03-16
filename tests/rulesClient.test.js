const { getRulePageTitles } = require('../utils/rulesClient');

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
