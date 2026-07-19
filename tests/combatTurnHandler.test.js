/**
 * Tests for combatTurnHandler active-combat renderer.
 * Covers createCombatEmbed() and row builders for running/paused/ended states.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const mockUpdatePayloads = [];
const mockSelectSingle = jest.fn(() => Promise.resolve({ data: { combat_log: [] }, error: null }));
const mockEq = jest.fn(() => Promise.resolve({ error: null }));

jest.mock('../utils/supabaseClient', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    single: mockSelectSingle,
                })),
            })),
            update: jest.fn(payload => {
                mockUpdatePayloads.push(payload);
                return { eq: mockEq };
            }),
        })),
    },
}));

const {
    createCombatEmbed,
    createPlayerActionRow,
    createManagementActionRow,
    nextTurn,
} = require('../handlers/combatTurnHandler');
const { createNpcDmActionRow } = require('../handlers/npcHandler');

function mkCombatant(overrides = {}) {
    return {
        id: `combatant-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Test Combatant',
        type: 'PLAYER',
        allegiance: 'PLAYER_SIDE',
        maxHP: 30,
        currentHP: 30,
        initiativeRoll: 15,
        discordUserId: 'user-123',
        playerId: null,
        mobDefinitionId: null,
        effects: [],
        ...overrides,
    };
}

function mkSession(overrides = {}) {
    const combatants = overrides.combatants || [];
    const turnOrder = overrides.turnOrder || combatants.map(c => c.id);

    return {
        id: 'sess12345678',
        state: 'RUNNING',
        combatants,
        turnOrder,
        currentTurnIndex: overrides.currentTurnIndex ?? 0,
        combatLog: overrides.combatLog || ['Combat started.'],
        dmUserId: 'dm-123',
        messageId: 'msg-123',
        channelId: 'channel-123',
        ...overrides,
    };
}

function fixtureStandardHeroesTurn() {
    const players = [
        mkCombatant({
            id: 'p1',
            name: 'Aldric',
            type: 'PLAYER',
            allegiance: 'PLAYER_SIDE',
            currentHP: 25,
            maxHP: 30,
            initiativeRoll: 18,
        }),
        mkCombatant({
            id: 'p2',
            name: 'Brynn',
            type: 'PLAYER',
            allegiance: 'PLAYER_SIDE',
            currentHP: 30,
            maxHP: 30,
            initiativeRoll: 14,
        }),
    ];
    const enemies = [
        mkCombatant({
            id: 'e1',
            name: 'Goblin Scout',
            type: 'NPC',
            allegiance: 'HOSTILE',
            currentHP: 12,
            maxHP: 15,
            initiativeRoll: 16,
        }),
        mkCombatant({
            id: 'e2',
            name: 'Goblin Warrior',
            type: 'NPC',
            allegiance: 'HOSTILE',
            currentHP: 20,
            maxHP: 20,
            initiativeRoll: 12,
        }),
    ];

    return mkSession({
        combatants: [...players, ...enemies],
        turnOrder: ['p1', 'e1', 'p2', 'e2'],
        currentTurnIndex: 0,
        combatLog: ['--- Combat Started! ---', "--- Aldric's Turn ---", 'Aldric attacks Goblin Scout. (Roll: 12/10)'],
    });
}

function fixtureNpcTurn() {
    return mkSession({
        ...fixtureStandardHeroesTurn(),
        currentTurnIndex: 1,
    });
}

function fixturePausedSession() {
    return mkSession({
        ...fixtureStandardHeroesTurn(),
        state: 'PAUSED',
        combatLog: ['--- Combat Started! ---', '--- Combat Resumed ---'],
    });
}

function fixtureEndedSession() {
    return mkSession({
        combatants: [
            mkCombatant({
                id: 'p1',
                name: 'Aldric',
                type: 'PLAYER',
                allegiance: 'PLAYER_SIDE',
                currentHP: 5,
                maxHP: 30,
                initiativeRoll: 18,
            }),
            mkCombatant({
                id: 'e1',
                name: 'Goblin Scout',
                type: 'NPC',
                allegiance: 'HOSTILE',
                currentHP: 0,
                maxHP: 15,
                initiativeRoll: 16,
            }),
        ],
        turnOrder: ['p1', 'e1'],
        currentTurnIndex: -1,
        state: 'ENDED',
        combatLog: ['Goblin Scout defeated!', '--- Combat Ended: The players are victorious! ---'],
    });
}

function fixtureOverflowFight() {
    const players = Array.from({ length: 8 }, (_, i) =>
        mkCombatant({
            id: `overflow-player-${i + 1}`,
            name: `Overflow Hero ${i + 1}`,
            type: 'PLAYER',
            allegiance: 'PLAYER_SIDE',
            maxHP: 30,
            currentHP: i < 3 ? 0 : 30,
            initiativeRoll: 20 - i,
        })
    );

    const enemies = Array.from({ length: 8 }, (_, i) =>
        mkCombatant({
            id: `overflow-enemy-${i + 1}`,
            name: `Overflow Enemy ${i + 1}`,
            type: 'NPC',
            allegiance: 'HOSTILE',
            maxHP: 20,
            currentHP: i < 2 ? 0 : 20,
            initiativeRoll: 18 - i,
        })
    );

    return mkSession({
        combatants: [...players, ...enemies],
        turnOrder: [players[0].id, enemies[0].id, players[1].id, enemies[1].id],
        currentTurnIndex: 0,
        combatLog: ['--- Combat Started! ---', "--- Overflow Hero 1's Turn ---"],
    });
}

function fixtureLongNameCombatants() {
    return mkSession({
        combatants: [
            mkCombatant({
                id: 'p1',
                name: 'Sir Aldric Maximilian Bartholomew III',
                type: 'PLAYER',
                allegiance: 'PLAYER_SIDE',
                currentHP: 28,
                maxHP: 30,
                initiativeRoll: 17,
            }),
            mkCombatant({
                id: 'e1',
                name: 'Grognak the Terrible, Destroyer of Worlds',
                type: 'NPC',
                allegiance: 'HOSTILE',
                currentHP: 45,
                maxHP: 50,
                initiativeRoll: 15,
            }),
        ],
        turnOrder: ['p1', 'e1'],
        currentTurnIndex: 0,
        combatLog: ["--- Sir Aldric Maximilian Bartholomew III's Turn ---"],
    });
}

function createMockClient(session, channelId = 'channel-123') {
    const edit = jest.fn(() => Promise.resolve());
    const fetchMessage = jest.fn(() => Promise.resolve({ edit }));
    const fetchChannel = jest.fn(() =>
        Promise.resolve({
            isTextBased: () => true,
            messages: { fetch: fetchMessage },
        })
    );

    return {
        activeCombats: new Map([[channelId, session]]),
        channels: { fetch: fetchChannel },
        __mocks: { edit, fetchMessage, fetchChannel },
    };
}

beforeEach(() => {
    mockUpdatePayloads.length = 0;
    mockSelectSingle.mockClear();
    mockEq.mockClear();
    mockSelectSingle.mockResolvedValue({ data: { combat_log: [] }, error: null });
    mockEq.mockResolvedValue({ error: null });
});

describe('createCombatEmbed', () => {
    test('renders a state-first running combat layout', () => {
        const embed = createCombatEmbed(fixtureStandardHeroesTurn()).toJSON();

        expect(embed.title).toContain('Combat Status - RUNNING');
        expect(embed.fields.map(field => field.name)).toEqual(
            expect.arrayContaining(['🎯 Active Turn', '⏭️ Up Next', '🛡️ Heroes', '⚔️ Hostiles', '📜 Recent Events'])
        );
    });

    test('spotlights the active actor with health bar and side', () => {
        const embed = createCombatEmbed(fixtureStandardHeroesTurn()).toJSON();
        const spotlightField = embed.fields.find(field => field.name === '🎯 Active Turn');

        expect(spotlightField.value).toContain('Aldric');
        expect(spotlightField.value).toContain('Heroes');
        expect(spotlightField.value).toContain('HP [');
    });

    test('shows next, on deck, and then entries in up-next preview', () => {
        const embed = createCombatEmbed(fixtureStandardHeroesTurn()).toJSON();
        const upNextField = embed.fields.find(field => field.name === '⏭️ Up Next');

        expect(upNextField.value).toContain('Next:');
        expect(upNextField.value).toContain('On Deck:');
        expect(upNextField.value).toContain('Then:');
        expect(upNextField.value).toContain('Goblin Scout');
        expect(upNextField.value).toContain('Brynn');
        expect(upNextField.value).toContain('Goblin Warrior');
    });

    test('marks the active combatant in the roster', () => {
        const embed = createCombatEmbed(fixtureStandardHeroesTurn()).toJSON();
        const heroesField = embed.fields.find(field => field.name.includes('Heroes'));

        expect(heroesField.value).toContain('▸ Aldric');
    });

    test('keeps heroes and hostiles inline for tactical scanning', () => {
        const embed = createCombatEmbed(fixtureStandardHeroesTurn()).toJSON();
        const heroesField = embed.fields.find(field => field.name.includes('Heroes'));
        const hostilesField = embed.fields.find(field => field.name.includes('Hostiles'));

        expect(heroesField.inline).toBe(true);
        expect(hostilesField.inline).toBe(true);
    });

    test('formats compact recent events from raw log entries', () => {
        const embed = createCombatEmbed(fixtureStandardHeroesTurn()).toJSON();
        const eventsField = embed.fields.find(field => field.name === '📜 Recent Events');

        expect(eventsField.value).toContain('Combat started');
        expect(eventsField.value).toContain('Turn: Aldric');
        expect(eventsField.value).toContain('Aldric attacks Goblin Scout. (Roll: 12/10)');
    });

    test('supports optional persisted round display without inferring it', () => {
        const embed = createCombatEmbed({ ...fixtureStandardHeroesTurn(), currentRound: 3 }).toJSON();
        expect(embed.title).toContain('Round 3');
    });

    test('does not show spotlight or up-next when paused', () => {
        const embed = createCombatEmbed(fixturePausedSession()).toJSON();

        expect(embed.description).toContain('paused');
        expect(embed.fields.find(field => field.name === '🎯 Active Turn')).toBeUndefined();
        expect(embed.fields.find(field => field.name === '⏭️ Up Next')).toBeUndefined();
    });

    test('does not show spotlight or up-next when ended', () => {
        const embed = createCombatEmbed(fixtureEndedSession()).toJSON();
        const hostilesField = embed.fields.find(field => field.name.includes('Hostiles'));

        expect(embed.description).toContain('concluded');
        expect(embed.fields.find(field => field.name === '🎯 Active Turn')).toBeUndefined();
        expect(embed.fields.find(field => field.name === '⏭️ Up Next')).toBeUndefined();
        expect(hostilesField.value).toContain('| DOWN');
    });

    test('shows overflow summary while staying under Discord field limits', () => {
        const embed = createCombatEmbed(fixtureOverflowFight()).toJSON();
        const heroesField = embed.fields.find(field => field.name.includes('Heroes'));
        const hostilesField = embed.fields.find(field => field.name.includes('Hostiles'));

        expect(heroesField.value).toContain('+3 more | active 5 | down 3');
        expect(hostilesField.value).toContain('+3 more | active 6 | down 2');
        expect(heroesField.value.length).toBeLessThanOrEqual(1024);
        expect(hostilesField.value.length).toBeLessThanOrEqual(1024);
    });

    test('truncates long names in spotlight and roster', () => {
        const embed = createCombatEmbed(fixtureLongNameCombatants()).toJSON();
        const spotlightField = embed.fields.find(field => field.name === '🎯 Active Turn');
        const heroesField = embed.fields.find(field => field.name.includes('Heroes'));

        expect(spotlightField.value).toContain('Sir Aldric Maximilian...');
        expect(heroesField.value).toContain('Sir Aldric Maximilian...');
    });

    test('keeps serialized embed comfortably under total limits', () => {
        const serialized = JSON.stringify(createCombatEmbed(fixtureOverflowFight()).toJSON());
        expect(serialized.length).toBeLessThan(4000);
    });

    test('handles an empty combat log', () => {
        const embed = createCombatEmbed(mkSession({ combatLog: [] })).toJSON();
        const eventsField = embed.fields.find(field => field.name === '📜 Recent Events');

        expect(eventsField.value).toContain('No events yet');
    });
});

describe('createPlayerActionRow', () => {
    const sessionId = 'test-session-123';
    const actorId = 'actor-456';

    test('contains exactly 3 buttons with required prefixes', () => {
        const components = createPlayerActionRow(sessionId, actorId).toJSON().components;

        expect(components).toHaveLength(3);
        expect(components.find(component => component.label === 'Attack').custom_id).toBe(
            `caa_${sessionId}_${actorId}`
        );
        expect(components.find(component => component.label === 'Skill/Action').custom_id).toBe(
            `cas_${sessionId}_${actorId}`
        );
        expect(components.find(component => component.label === 'End Turn').custom_id).toBe(
            `cet_${sessionId}_${actorId}`
        );
    });
});

describe('nextTurn', () => {
    test('increments currentRound when turn order wraps', async () => {
        const session = mkSession({
            currentRound: 1,
            currentTurnIndex: 2,
            combatants: [
                mkCombatant({ id: 'p1', name: 'Aldric', allegiance: 'PLAYER_SIDE', type: 'PLAYER', currentHP: 25 }),
                mkCombatant({ id: 'e1', name: 'Goblin', allegiance: 'HOSTILE', type: 'NPC', currentHP: 12 }),
                mkCombatant({ id: 'p2', name: 'Brynn', allegiance: 'PLAYER_SIDE', type: 'PLAYER', currentHP: 20 }),
            ],
            turnOrder: ['p1', 'e1', 'p2'],
        });
        const client = createMockClient(session);

        await nextTurn(client, 'channel-123');

        const updatedSession = client.activeCombats.get('channel-123');
        expect(updatedSession.currentTurnIndex).toBe(0);
        expect(updatedSession.currentRound).toBe(2);

        const persistedTurnUpdate = mockUpdatePayloads.find(payload => payload.current_turn_index === 0);
        expect(persistedTurnUpdate).toEqual(expect.objectContaining({ current_turn_index: 0, current_round: 2 }));
    });

    test('keeps currentRound unchanged on mid-round advance', async () => {
        const session = mkSession({
            currentRound: 2,
            currentTurnIndex: 0,
            combatants: [
                mkCombatant({ id: 'p1', name: 'Aldric', allegiance: 'PLAYER_SIDE', type: 'PLAYER', currentHP: 25 }),
                mkCombatant({ id: 'e1', name: 'Goblin', allegiance: 'HOSTILE', type: 'NPC', currentHP: 12 }),
                mkCombatant({ id: 'p2', name: 'Brynn', allegiance: 'PLAYER_SIDE', type: 'PLAYER', currentHP: 20 }),
            ],
            turnOrder: ['p1', 'e1', 'p2'],
        });
        const client = createMockClient(session);

        await nextTurn(client, 'channel-123');

        const updatedSession = client.activeCombats.get('channel-123');
        expect(updatedSession.currentTurnIndex).toBe(1);
        expect(updatedSession.currentRound).toBe(2);

        const persistedTurnUpdate = mockUpdatePayloads.find(payload => payload.current_turn_index === 1);
        expect(persistedTurnUpdate).toEqual(expect.objectContaining({ current_turn_index: 1, current_round: 2 }));
    });
});

describe('createManagementActionRow', () => {
    const sessionId = 'test-session-mgmt';

    test('contains park and end session buttons with expected prefixes', () => {
        const components = createManagementActionRow(sessionId).toJSON().components;

        expect(components).toHaveLength(2);
        expect(components.find(component => component.label === 'Park Session').custom_id).toBe(
            `park_combat_${sessionId}`
        );
        expect(components.find(component => component.label === 'End Session').custom_id).toBe(
            `end_combat_${sessionId}`
        );
    });
});

describe('createNpcDmActionRow', () => {
    const sessionId = 'test-session-789';
    const npcActorId = 'npc-actor-012';

    test('keeps NPC controls and shared management buttons intact', () => {
        const rows = createNpcDmActionRow(sessionId, npcActorId);
        const actionIds = rows[0].toJSON().components.map(component => component.custom_id);
        const managementIds = rows[1].toJSON().components.map(component => component.custom_id);

        expect(actionIds).toEqual(
            expect.arrayContaining([
                `dmnpc_action_attack_${sessionId}_${npcActorId}`,
                `dmnpc_action_skill_${sessionId}_${npcActorId}`,
                `dmnpc_action_endturn_${sessionId}_${npcActorId}`,
            ])
        );
        expect(managementIds).toEqual(expect.arrayContaining([`park_combat_${sessionId}`, `end_combat_${sessionId}`]));
    });
});
