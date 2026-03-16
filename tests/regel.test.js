/**
 * Tests for /regel command autocomplete and execute handlers
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
    EmbedBuilder: jest.fn().mockImplementation(() => ({
        setColor: jest.fn().mockReturnThis(),
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        setTimestamp: jest.fn().mockReturnThis(),
    })),
    ActionRowBuilder: jest.fn().mockImplementation(() => ({
        addComponents: jest.fn().mockReturnThis(),
    })),
    ButtonBuilder: jest.fn().mockImplementation(() => ({
        setLabel: jest.fn().mockReturnThis(),
        setStyle: jest.fn().mockReturnThis(),
        setURL: jest.fn().mockReturnThis(),
    })),
    ButtonStyle: {
        Link: 5,
    },
}));

// Mock rulesClient
jest.mock('../utils/rulesClient', () => ({
    searchRules: jest.fn(),
    getRuleByTitle: jest.fn(),
    getRankedTitleMatches: jest.fn(),
    hybridSearch: jest.fn(),
}));

// Mock logger
jest.mock('../utils/logger', () => ({
    createLogger: jest.fn(() => ({
        error: jest.fn(),
        info: jest.fn(),
    })),
}));

const { getRankedTitleMatches, hybridSearch } = require('../utils/rulesClient');

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

describe('regel command execute', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function createMockInteraction(options = {}) {
        return {
            options: {
                getString: jest.fn().mockImplementation(key => options[key] || null),
                getInteger: jest.fn().mockImplementation(key => options[key] || null),
                getBoolean: jest.fn().mockImplementation(key => options[key] || false),
            },
            client: {
                rulePageTitleCache: options.cache || [],
            },
            user: {
                username: 'TestUser',
                avatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
            },
            deferReply: jest.fn().mockResolvedValue(undefined),
            editReply: jest.fn().mockResolvedValue(undefined),
        };
    }

    describe('execute renders a selected page preview with exact and semantic sections', () => {
        test('creates primary embed with selected page from exact match', async () => {
            const mockHybridResult = {
                selectedPage: {
                    doc_id: 'doc_1',
                    title: 'Finte I',
                    source_url: 'https://example.com/finte-i',
                    chunk_text: 'Finte I ist eine Kampfsonderfertigkeit...',
                    similarity: 1.0,
                },
                exactMatches: [{ doc_id: 'doc_1', title: 'Finte I', source_url: 'https://example.com/finte-i' }],
                semanticMatches: [
                    {
                        doc_id: 'doc_2',
                        title: 'Finte II',
                        source_url: 'https://example.com/finte-ii',
                        similarity: 0.85,
                    },
                ],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Finte I',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            expect(hybridSearch).toHaveBeenCalledWith('Finte I', [], {
                category: null,
                limit: 3,
                threshold: 0.4,
            });

            // Verify editReply was called
            expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);

            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            expect(replyCall.embeds).toBeDefined();
            expect(replyCall.embeds).toHaveLength(1);

            // Verify components include link button
            expect(replyCall.components).toBeDefined();
            expect(replyCall.components).toHaveLength(1);
        });

        test('creates primary embed with selected page from semantic match when no exact match', async () => {
            const mockHybridResult = {
                selectedPage: {
                    doc_id: 'doc_1',
                    title: 'Wundschwelle',
                    source_url: 'https://example.com/wundschwelle',
                    normalized_content: 'Die Wundschwelle bestimmt...',
                    similarity: 0.72,
                },
                exactMatches: [],
                semanticMatches: [
                    {
                        doc_id: 'doc_1',
                        title: 'Wundschwelle',
                        source_url: 'https://example.com/wundschwelle',
                        similarity: 0.72,
                    },
                    {
                        doc_id: 'doc_2',
                        title: 'Wundschwelle II',
                        source_url: 'https://example.com/wundschwelle-ii',
                        similarity: 0.65,
                    },
                ],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Wundschwelle',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);

            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            expect(replyCall.embeds).toBeDefined();
            expect(replyCall.components).toBeDefined();
        });

        test('includes both exact and semantic fields in embed', async () => {
            const mockHybridResult = {
                selectedPage: {
                    doc_id: 'doc_1',
                    title: 'Finte',
                    source_url: 'https://example.com/finte',
                    chunk_text: 'Finte ist eine Kampftechnik.',
                },
                exactMatches: [
                    { doc_id: 'doc_1', title: 'Finte', source_url: 'https://example.com/finte' },
                    { doc_id: 'doc_2', title: 'Finte II', source_url: 'https://example.com/finte-ii' },
                ],
                semanticMatches: [
                    { doc_id: 'doc_3', title: 'Attacke', source_url: 'https://example.com/attacke', similarity: 0.6 },
                ],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Finte',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            // Verify addFields was called (through EmbedBuilder mock)
            const { EmbedBuilder } = require('discord.js');
            const embedInstance = EmbedBuilder.mock.results[0].value;
            expect(embedInstance.addFields).toHaveBeenCalled();
        });

        test('uses hyperlink format for title when source_url exists', async () => {
            const mockHybridResult = {
                selectedPage: {
                    doc_id: 'doc_1',
                    title: 'Drache',
                    source_url: 'https://example.com/drache',
                    chunk_text: 'Drachen sind mächtige Kreaturen...',
                },
                exactMatches: [],
                semanticMatches: [],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Drache',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            const { EmbedBuilder } = require('discord.js');
            const embedInstance = EmbedBuilder.mock.results[0].value;

            // setTitle should be called with markdown link format
            expect(embedInstance.setTitle).toHaveBeenCalledWith('[Drache](https://example.com/drache)');
        });

        test('uses plain title when no source_url', async () => {
            const mockHybridResult = {
                selectedPage: {
                    doc_id: 'doc_1',
                    title: 'Unknown Rule',
                    source_url: null,
                    chunk_text: 'Some content...',
                },
                exactMatches: [],
                semanticMatches: [],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Unknown',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            const { EmbedBuilder } = require('discord.js');
            const embedInstance = EmbedBuilder.mock.results[0].value;

            expect(embedInstance.setTitle).toHaveBeenCalledWith('Unknown Rule');

            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            // No components when no source_url
            expect(replyCall.components).toBeUndefined();
        });

        test('truncates content to 1500 characters at word boundary', async () => {
            const longContent = 'A'.repeat(2000);
            const mockHybridResult = {
                selectedPage: {
                    doc_id: 'doc_1',
                    title: 'Long Rule',
                    source_url: 'https://example.com/long',
                    chunk_text: longContent,
                },
                exactMatches: [],
                semanticMatches: [],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Long',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            const { EmbedBuilder } = require('discord.js');
            const embedInstance = EmbedBuilder.mock.results[0].value;

            // setDescription should be called with truncated content
            const setDescriptionCall = embedInstance.setDescription.mock.calls[0][0];
            expect(setDescriptionCall.length).toBeLessThanOrEqual(1501); // 1500 + '…'
        });
    });

    describe('execute preserves no-result and unavailable branches', () => {
        test('shows no-result embed when hybridSearch returns no selectedPage', async () => {
            const mockHybridResult = {
                selectedPage: null,
                exactMatches: [],
                semanticMatches: [],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'NonexistentRule12345',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);

            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            expect(replyCall.embeds).toBeDefined();
            expect(replyCall.embeds).toHaveLength(1);

            // Verify the embed has no-result styling (gray color)
            const { EmbedBuilder } = require('discord.js');
            const embedInstance = EmbedBuilder.mock.results[0].value;
            expect(embedInstance.setColor).toHaveBeenCalledWith(0x95a5a6);
        });

        test('shows no-result embed with category filter info', async () => {
            const mockHybridResult = {
                selectedPage: null,
                exactMatches: [],
                semanticMatches: [],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Nonexistent',
                kategorie: 'bestiarium',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            expect(hybridSearch).toHaveBeenCalledWith('Nonexistent', [], {
                category: 'bestiarium',
                limit: 3,
                threshold: 0.4,
            });
        });

        test('shows API key error message when OPENAI_API_KEY missing', async () => {
            const apiError = new Error('OPENAI_API_KEY not configured');
            hybridSearch.mockRejectedValue(apiError);

            const mockInteraction = createMockInteraction({
                suche: 'Test',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Regelsuche nicht verfügbar — API-Schlüssel fehlt.',
            });
        });

        test('shows generic error message on other failures', async () => {
            const genericError = new Error('Database connection failed');
            hybridSearch.mockRejectedValue(genericError);

            const mockInteraction = createMockInteraction({
                suche: 'Test',
                anzahl: 3,
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Fehler bei der Regelsuche. Bitte versuche es erneut.',
            });
        });
    });

    describe('execute preserves visibility behavior', () => {
        test('defers reply as ephemeral when visible is false', async () => {
            const mockHybridResult = {
                selectedPage: { doc_id: 'doc_1', title: 'Test', chunk_text: 'Content' },
                exactMatches: [],
                semanticMatches: [],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Test',
                visible: false,
            });

            await regelCommand.execute(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        });

        test('defers reply as public when visible is true', async () => {
            const mockHybridResult = {
                selectedPage: { doc_id: 'doc_1', title: 'Test', chunk_text: 'Content' },
                exactMatches: [],
                semanticMatches: [],
            };

            hybridSearch.mockResolvedValue(mockHybridResult);

            const mockInteraction = createMockInteraction({
                suche: 'Test',
                visible: true,
            });

            await regelCommand.execute(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: false });
        });
    });
});
