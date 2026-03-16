/**
 * Tests for /regel command autocomplete handler
 */
const regelCommand = require('../commands/regel');

// Mock discord.js
jest.mock('discord.js', () => ({
    SlashCommandBuilder: jest.fn().mockImplementation(() => ({
        setName: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        addStringOption: jest.fn().mockReturnThis(),
        addIntegerOption: jest.fn().mockReturnThis(),
        addBooleanOption: jest.fn().mockReturnThis(),
    })),
    EmbedBuilder: jest.fn(),
}));

// Mock rulesClient
jest.mock('../utils/rulesClient', () => ({
    searchRules: jest.fn(),
    getRuleByTitle: jest.fn(),
    getRankedTitleMatches: jest.fn(),
}));

// Mock logger
jest.mock('../utils/logger', () => ({
    createLogger: jest.fn(() => ({
        error: jest.fn(),
        info: jest.fn(),
    })),
}));

const { getRankedTitleMatches } = require('../utils/rulesClient');

describe('regel command autocomplete', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('autocomplete returns cached category-aware title choices', () => {
        test('returns up to 25 matching titles from cache', async () => {
            const mockMatches = [
                { doc_id: 'doc_1', title: 'Finte I', title_lower: 'finte i', category: 'special_abilities_profane' },
                { doc_id: 'doc_2', title: 'Finte II', title_lower: 'finte ii', category: 'special_abilities_profane' },
                {
                    doc_id: 'doc_3',
                    title: 'Finte III',
                    title_lower: 'finte iii',
                    category: 'special_abilities_profane',
                },
            ];

            getRankedTitleMatches.mockReturnValue(mockMatches);

            const mockRespond = jest.fn();
            const mockInteraction = {
                options: {
                    getFocused: jest.fn().mockReturnValue('Finte'),
                    getString: jest.fn().mockReturnValue(null), // no category selected
                },
                client: {
                    rulePageTitleCache: [{ doc_id: 'cached', title: 'Cached' }],
                },
                respond: mockRespond,
            };

            await regelCommand.autocomplete(mockInteraction);

            expect(getRankedTitleMatches).toHaveBeenCalledWith('Finte', mockInteraction.client.rulePageTitleCache, {
                category: null,
            });
            expect(mockRespond).toHaveBeenCalledTimes(1);

            const respondedChoices = mockRespond.mock.calls[0][0];
            expect(respondedChoices).toHaveLength(3);
            expect(respondedChoices[0]).toEqual({ name: 'Finte I', value: 'Finte I' });
            expect(respondedChoices[1]).toEqual({ name: 'Finte II', value: 'Finte II' });
            expect(respondedChoices[2]).toEqual({ name: 'Finte III', value: 'Finte III' });
        });

        test('filters results by selected category', async () => {
            const mockMatches = [{ doc_id: 'doc_1', title: 'Drache', title_lower: 'drache', category: 'bestiarium' }];

            getRankedTitleMatches.mockReturnValue(mockMatches);

            const mockRespond = jest.fn();
            const mockInteraction = {
                options: {
                    getFocused: jest.fn().mockReturnValue('Drache'),
                    getString: jest.fn().mockReturnValue('bestiarium'), // category selected
                },
                client: {
                    rulePageTitleCache: [{ doc_id: 'cached', title: 'Cached' }],
                },
                respond: mockRespond,
            };

            await regelCommand.autocomplete(mockInteraction);

            expect(getRankedTitleMatches).toHaveBeenCalledWith('Drache', mockInteraction.client.rulePageTitleCache, {
                category: 'bestiarium',
            });

            const respondedChoices = mockRespond.mock.calls[0][0];
            expect(respondedChoices).toHaveLength(1);
            expect(respondedChoices[0]).toEqual({ name: 'Drache', value: 'Drache' });
        });

        test('limits results to 25 even when more matches exist', async () => {
            // Create 30 mock matches
            const mockMatches = Array.from({ length: 30 }, (_, i) => ({
                doc_id: `doc_${i}`,
                title: `Test Rule ${i}`,
                title_lower: `test rule ${i}`,
                category: 'rules',
            }));

            getRankedTitleMatches.mockReturnValue(mockMatches);

            const mockRespond = jest.fn();
            const mockInteraction = {
                options: {
                    getFocused: jest.fn().mockReturnValue('Test'),
                    getString: jest.fn().mockReturnValue(null),
                },
                client: {
                    rulePageTitleCache: [],
                },
                respond: mockRespond,
            };

            await regelCommand.autocomplete(mockInteraction);

            const respondedChoices = mockRespond.mock.calls[0][0];
            expect(respondedChoices).toHaveLength(25);
        });
    });

    describe('autocomplete returns an empty array on cache miss', () => {
        test('returns empty array when no matches found', async () => {
            getRankedTitleMatches.mockReturnValue([]);

            const mockRespond = jest.fn();
            const mockInteraction = {
                options: {
                    getFocused: jest.fn().mockReturnValue('NonexistentRule'),
                    getString: jest.fn().mockReturnValue(null),
                },
                client: {
                    rulePageTitleCache: [],
                },
                respond: mockRespond,
            };

            await regelCommand.autocomplete(mockInteraction);

            expect(mockRespond).toHaveBeenCalledWith([]);
        });

        test('returns empty array when cache is undefined', async () => {
            getRankedTitleMatches.mockReturnValue([]);

            const mockRespond = jest.fn();
            const mockInteraction = {
                options: {
                    getFocused: jest.fn().mockReturnValue('Test'),
                    getString: jest.fn().mockReturnValue(null),
                },
                client: {
                    // No rulePageTitleCache property
                },
                respond: mockRespond,
            };

            await regelCommand.autocomplete(mockInteraction);

            // Should use empty array as fallback
            expect(getRankedTitleMatches).toHaveBeenCalledWith('Test', [], { category: null });
            expect(mockRespond).toHaveBeenCalledWith([]);
        });

        test('returns empty array on error', async () => {
            getRankedTitleMatches.mockImplementation(() => {
                throw new Error('Cache error');
            });

            const mockRespond = jest.fn();
            const mockInteraction = {
                options: {
                    getFocused: jest.fn().mockReturnValue('Test'),
                    getString: jest.fn().mockReturnValue(null),
                },
                client: {
                    rulePageTitleCache: [],
                },
                respond: mockRespond,
            };

            await regelCommand.autocomplete(mockInteraction);

            expect(mockRespond).toHaveBeenCalledWith([]);
        });
    });

    describe('command structure', () => {
        test('exports autocomplete handler', () => {
            expect(regelCommand.autocomplete).toBeDefined();
            expect(typeof regelCommand.autocomplete).toBe('function');
        });

        test('exports execute handler', () => {
            expect(regelCommand.execute).toBeDefined();
            expect(typeof regelCommand.execute).toBe('function');
        });

        test('exports data with SlashCommandBuilder', () => {
            expect(regelCommand.data).toBeDefined();
        });
    });
});
