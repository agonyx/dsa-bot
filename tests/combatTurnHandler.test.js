/**
 * Tests for combatTurnHandler active-combat renderer
 * Covers createCombatEmbed() and row builders for running/paused/ended states
 */

// Set required environment variables before any imports
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

// Mock supabase before importing handlers
jest.mock('../utils/supabaseClient', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    single: jest.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
            update: jest.fn(() => ({
                eq: jest.fn(() => Promise.resolve({ error: null })),
            })),
        })),
    },
}));

const {
    createCombatEmbed,
    createPlayerActionRow,
    createManagementActionRow,
} = require('../handlers/combatTurnHandler');
const { createNpcDmActionRow } = require('../handlers/npcHandler');

// ============================================================
// FIXTURE FACTORIES
// ============================================================

/**
 * Creates a minimal valid combatant object
 */
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

/**
 * Creates a minimal valid session object
 */
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

// ============================================================
// FIXTURES
// ============================================================

/** Standard player turn - 2 players, 2 enemies, player's turn */
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
    const combatants = [...players, ...enemies];
    // Turn order: Aldric (18) -> Goblin Scout (16) -> Brynn (14) -> Goblin Warrior (12)
    const turnOrder = ['p1', 'e1', 'p2', 'e2'];

    return mkSession({
        combatants,
        turnOrder,
        currentTurnIndex: 0, // Aldric's turn
        combatLog: ['Combat started.', "--- Aldric's Turn ---"],
    });
}

/** NPC turn - same as above but it's the goblin's turn */
function fixtureNpcTurn() {
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
    const combatants = [...players, ...enemies];
    const turnOrder = ['p1', 'e1', 'p2', 'e2'];

    return mkSession({
        combatants,
        turnOrder,
        currentTurnIndex: 1, // Goblin Scout's turn
        combatLog: ['Combat started.', "--- Aldric's Turn ---", 'Aldric attacks Goblin Scout. (Roll: 12/10)'],
    });
}

/** Paused session */
function fixturePausedSession() {
    const players = [
        mkCombatant({
            id: 'p1',
            name: 'Aldric',
            type: 'PLAYER',
            allegiance: 'PLAYER_SIDE',
            currentHP: 22,
            maxHP: 30,
            initiativeRoll: 18,
        }),
    ];
    const enemies = [
        mkCombatant({
            id: 'e1',
            name: 'Goblin Scout',
            type: 'NPC',
            allegiance: 'HOSTILE',
            currentHP: 8,
            maxHP: 15,
            initiativeRoll: 16,
        }),
    ];

    return mkSession({
        combatants: [...players, ...enemies],
        turnOrder: ['p1', 'e1'],
        currentTurnIndex: 0,
        state: 'PAUSED',
        combatLog: ['Combat started.', "--- Aldric's Turn ---", 'Combat paused by DM.'],
    });
}

/** Ended session */
function fixtureEndedSession() {
    const players = [
        mkCombatant({
            id: 'p1',
            name: 'Aldric',
            type: 'PLAYER',
            allegiance: 'PLAYER_SIDE',
            currentHP: 5,
            maxHP: 30,
            initiativeRoll: 18,
        }),
    ];
    const enemies = [
        mkCombatant({
            id: 'e1',
            name: 'Goblin Scout',
            type: 'NPC',
            allegiance: 'HOSTILE',
            currentHP: 0,
            maxHP: 15,
            initiativeRoll: 16,
        }),
    ];

    return mkSession({
        combatants: [...players, ...enemies],
        turnOrder: ['p1', 'e1'],
        currentTurnIndex: -1,
        state: 'ENDED',
        combatLog: [
            'Combat started.',
            "--- Aldric's Turn ---",
            'Aldric attacks Goblin Scout. (Roll: 15/10) -> HIT!',
            "--- Goblin Scout's Turn ---",
            'Goblin Scout defeated!',
            '--- Combat Ended: The players are victorious! ---',
        ],
    });
}

/** Crowded fight - 12 combatants (6 per side) */
function fixtureCrowdedFight() {
    const players = Array.from({ length: 6 }, (_, i) =>
        mkCombatant({
            id: `player-${i + 1}`,
            name: `Hero ${i + 1}`,
            type: 'PLAYER',
            allegiance: 'PLAYER_SIDE',
            maxHP: 30,
            currentHP: Math.max(0, 30 - i * 3),
            initiativeRoll: 20 - i,
        })
    );

    const enemies = Array.from({ length: 6 }, (_, i) =>
        mkCombatant({
            id: `enemy-${i + 1}`,
            name: `Enemy ${i + 1}`,
            type: 'NPC',
            allegiance: 'HOSTILE',
            maxHP: 20,
            currentHP: Math.max(0, 20 - i * 2),
            initiativeRoll: 18 - i,
        })
    );

    const combatants = [...players, ...enemies];
    // Interleave turn order
    const turnOrder = [];
    for (let i = 0; i < 6; i++) {
        turnOrder.push(players[i].id);
        turnOrder.push(enemies[i].id);
    }

    return mkSession({
        combatants,
        turnOrder,
        currentTurnIndex: 0,
        combatLog: ['Combat started.', "--- Hero 1's Turn ---"],
    });
}

/** Long-name combatants - names that could overflow */
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
        combatLog: ['Combat started.', "--- Sir Aldric Maximilian Bartholomew III's Turn ---"],
    });
}

/** Critical-health party - all players under 33% HP */
function fixtureCriticalHealthParty() {
    return mkSession({
        combatants: [
            mkCombatant({
                id: 'p1',
                name: 'Wounded Aldric',
                type: 'PLAYER',
                allegiance: 'PLAYER_SIDE',
                currentHP: 5,
                maxHP: 30,
                initiativeRoll: 18,
            }),
            mkCombatant({
                id: 'p2',
                name: 'Dying Brynn',
                type: 'PLAYER',
                allegiance: 'PLAYER_SIDE',
                currentHP: 3,
                maxHP: 30,
                initiativeRoll: 14,
            }),
            mkCombatant({
                id: 'e1',
                name: 'Healthy Dragon',
                type: 'NPC',
                allegiance: 'HOSTILE',
                currentHP: 100,
                maxHP: 100,
                initiativeRoll: 20,
            }),
        ],
        turnOrder: ['e1', 'p1', 'p2'],
        currentTurnIndex: 1, // Wounded Aldric's turn
        combatLog: [
            'Combat started.',
            "--- Healthy Dragon's Turn ---",
            'Dragon breathes fire! Aldric takes 25 damage!',
        ],
    });
}

/** Overflow fight - 16 combatants (8 per side) to test overflow summary */
function fixtureOverflowFight() {
    const players = Array.from({ length: 8 }, (_, i) =>
        mkCombatant({
            id: `overflow-player-${i + 1}`,
            name: `Overflow Hero ${i + 1}`,
            type: 'PLAYER',
            allegiance: 'PLAYER_SIDE',
            maxHP: 30,
            currentHP: i < 3 ? 0 : 30, // First 3 are down
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
            currentHP: i < 2 ? 0 : 20, // First 2 are down
            initiativeRoll: 18 - i,
        })
    );

    const combatants = [...players, ...enemies];
    const turnOrder = [players[0].id, enemies[0].id, players[1].id, enemies[1].id];

    return mkSession({
        combatants,
        turnOrder,
        currentTurnIndex: 0,
        combatLog: ['Combat started.', "--- Overflow Hero 1's Turn ---"],
    });
}

// ============================================================
// TESTS: createCombatEmbed
// ============================================================

describe('createCombatEmbed', () => {
    describe('standard player turn', () => {
        test('includes active-turn marker for current combatant', () => {
            const session = fixtureStandardHeroesTurn();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            // Active combatant (Aldric) should have turn indicator
            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            expect(playerField.value).toContain('> Aldric');
        });

        test('includes recent events section', () => {
            const session = fixtureStandardHeroesTurn();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const eventsField = data.fields.find(f => f.name.includes('Recent Events'));
            expect(eventsField).toBeDefined();
            expect(eventsField.value).toContain('Combat started');
        });

        test('shows both Heroes and Hostiles teams', () => {
            const session = fixtureStandardHeroesTurn();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            expect(data.fields.some(f => f.name.includes('Heroes'))).toBe(true);
            expect(data.fields.some(f => f.name.includes('Hostiles'))).toBe(true);
        });

        test('displays HP bars with values', () => {
            const session = fixtureStandardHeroesTurn();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            expect(playerField.value).toContain('HP [████-] 25/30');
        });

        test('includes session ID in footer', () => {
            const session = fixtureStandardHeroesTurn();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            expect(data.footer.text).toContain('sess1234');
        });
    });

    describe('NPC turn', () => {
        test('marks NPC as active turn', () => {
            const session = fixtureNpcTurn();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const hostileField = data.fields.find(f => f.name.includes('Hostiles'));
            expect(hostileField.value).toContain('> Goblin Scout');
        });

        test('shows current turn in description', () => {
            const session = fixtureNpcTurn();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            expect(data.description).toContain('Active Turn:** Goblin Scout');
        });
    });

    describe('paused session', () => {
        test('shows PAUSED state in title', () => {
            const session = fixturePausedSession();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            expect(data.title).toContain('Combat Status - PAUSED');
        });

        test('still shows combatant lists', () => {
            const session = fixturePausedSession();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            expect(data.fields.some(f => f.name.includes('Heroes'))).toBe(true);
            expect(data.fields.some(f => f.name.includes('Hostiles'))).toBe(true);
        });
    });

    describe('ended session', () => {
        test('shows ENDED state in title', () => {
            const session = fixtureEndedSession();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            expect(data.title).toContain('Combat Status - ENDED');
        });

        test('shows concluded description', () => {
            const session = fixtureEndedSession();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            expect(data.description).toContain('concluded');
        });

        test('shows defeated combatant with | DOWN', () => {
            const session = fixtureEndedSession();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const hostileField = data.fields.find(f => f.name.includes('Hostiles'));
            expect(hostileField.value).toContain('| DOWN');
        });
    });

    describe('crowded fight (12 combatants)', () => {
        test('renders all 12 combatants without throwing', () => {
            const session = fixtureCrowdedFight();
            expect(() => createCombatEmbed(session)).not.toThrow();
        });

        test('serialized payload is within reasonable size', () => {
            const session = fixtureCrowdedFight();
            const embed = createCombatEmbed(session);
            const serialized = JSON.stringify(embed.toJSON());

            // Discord embed total characters limit is 6000
            // This single embed should be well under that
            expect(serialized.length).toBeLessThan(4000);
        });

        test('contains both teams with correct counts', () => {
            const session = fixtureCrowdedFight();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            const hostileField = data.fields.find(f => f.name.includes('Hostiles'));

            // Should have 6 heroes mentioned in some form
            expect(playerField.value).toContain('Hero 1');
            expect(playerField.value).toContain('Hero 6');

            // Should have 6 enemies
            expect(hostileField.value).toContain('Enemy 1');
            expect(hostileField.value).toContain('Enemy 6');
        });

        test('has active-turn marker on first combatant', () => {
            const session = fixtureCrowdedFight();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            expect(playerField.value).toContain('> Hero 1');
        });
    });

    describe('overflow fight (16 combatants - 8 per side)', () => {
        test('renders without throwing', () => {
            const session = fixtureOverflowFight();
            expect(() => createCombatEmbed(session)).not.toThrow();
        });

        test('shows overflow summary line for players', () => {
            const session = fixtureOverflowFight();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            // Should have summary line: +3 more | active X | down Y
            expect(playerField.value).toContain('+3 more');
            expect(playerField.value).toContain('active 5');
            expect(playerField.value).toContain('down 3');
        });

        test('shows overflow summary line for hostiles', () => {
            const session = fixtureOverflowFight();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const hostileField = data.fields.find(f => f.name.includes('Hostiles'));
            // Should have summary line: +3 more | active X | down Y
            expect(hostileField.value).toContain('+3 more');
            expect(hostileField.value).toContain('active 6');
            expect(hostileField.value).toContain('down 2');
        });

        test('shows first 5 combatants sorted by initiative', () => {
            const session = fixtureOverflowFight();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            // Top 5 by initiative: Hero 1-5 (initiative 20, 19, 18, 17, 16)
            expect(playerField.value).toContain('Overflow Hero 1');
            expect(playerField.value).toContain('Overflow Hero 5');
            // Should NOT contain Hero 6, 7, 8 (they're in the overflow)
            expect(playerField.value).not.toContain('Overflow Hero 6');
        });

        test('field value stays under Discord 1024 char limit', () => {
            const session = fixtureOverflowFight();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            const hostileField = data.fields.find(f => f.name.includes('Hostiles'));

            // Code block markers add some chars but content should stay under limit
            expect(playerField.value.length).toBeLessThanOrEqual(1024);
            expect(hostileField.value.length).toBeLessThanOrEqual(1024);
        });
    });

    describe('long-name combatants', () => {
        test('truncates long names to 24 characters with ellipsis', () => {
            const session = fixtureLongNameCombatants();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            // Description should show truncated name (24 chars max)
            expect(data.description).toContain('Sir Aldric Maximilian...');
        });

        test('renders successfully with long names', () => {
            const session = fixtureLongNameCombatants();
            expect(() => createCombatEmbed(session)).not.toThrow();
        });

        test('field shows truncated names', () => {
            const session = fixtureLongNameCombatants();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            // Name should be truncated in the field
            expect(playerField.value).toContain('Sir Aldric Maximilian...');
        });
    });

    describe('critical-health party', () => {
        test('uses critical color for low party HP', () => {
            const session = fixtureCriticalHealthParty();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            // running-critical = 0xc92a2a
            // Average HP is (5+3)/60 = 13.3%, so should be critical
            expect(data.color).toBe(0xc92a2a);
        });

        test('shows correct HP bars for critical combatants', () => {
            const session = fixtureCriticalHealthParty();
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            expect(playerField.value).toContain('HP [█----] 5/30');
            expect(playerField.value).toContain('HP [█----] 3/30');
        });
    });

    describe('edge cases', () => {
        test('handles empty combatants array', () => {
            const session = mkSession({ combatants: [], turnOrder: [] });
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            expect(data.title).toContain('Combat Status - RUNNING');
        });

        test('handles empty combat log', () => {
            const session = mkSession({ combatLog: [] });
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const eventsField = data.fields.find(f => f.name.includes('Recent Events'));
            expect(eventsField.value).toContain('No events yet');
        });

        test('handles dead combatant (0 HP)', () => {
            const session = mkSession({
                combatants: [mkCombatant({ id: 'p1', name: 'Dead Hero', currentHP: 0, maxHP: 30 })],
                turnOrder: ['p1'],
            });
            const embed = createCombatEmbed(session);
            const data = embed.toJSON();

            const playerField = data.fields.find(f => f.name.includes('Heroes'));
            // Should show 0 HP with empty bar
            expect(playerField.value).toContain('HP [-----] 0/30');
            // Should have | DOWN status
            expect(playerField.value).toContain('| DOWN');
        });
    });
});

// ============================================================
// TESTS: createPlayerActionRow
// ============================================================

describe('createPlayerActionRow', () => {
    const sessionId = 'test-session-123';
    const actorId = 'actor-456';

    test('creates exactly 1 action row', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        expect(row).toBeDefined();
    });

    test('contains exactly 3 buttons', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        const components = row.toJSON().components;

        expect(components).toHaveLength(3);
    });

    test('Attack button uses caa_ prefix', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        const components = row.toJSON().components;

        const attackButton = components.find(c => c.label === 'Attack');
        expect(attackButton.custom_id).toBe(`caa_${sessionId}_${actorId}`);
    });

    test('Skill/Action button uses cas_ prefix', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        const components = row.toJSON().components;

        const skillButton = components.find(c => c.label === 'Skill/Action');
        expect(skillButton.custom_id).toBe(`cas_${sessionId}_${actorId}`);
    });

    test('End Turn button uses cet_ prefix', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        const components = row.toJSON().components;

        const endTurnButton = components.find(c => c.label === 'End Turn');
        expect(endTurnButton.custom_id).toBe(`cet_${sessionId}_${actorId}`);
    });

    test('all buttons have emojis', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        const components = row.toJSON().components;

        components.forEach(btn => {
            expect(btn.emoji).toBeDefined();
            expect(btn.emoji.name).toBeDefined();
        });
    });

    test('Attack button has Danger style', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        const components = row.toJSON().components;

        const attackButton = components.find(c => c.label === 'Attack');
        expect(attackButton.style).toBe(4); // ButtonStyle.Danger
    });

    test('Skill/Action button has Primary style', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        const components = row.toJSON().components;

        const skillButton = components.find(c => c.label === 'Skill/Action');
        expect(skillButton.style).toBe(1); // ButtonStyle.Primary
    });

    test('End Turn button has Secondary style', () => {
        const row = createPlayerActionRow(sessionId, actorId);
        const components = row.toJSON().components;

        const endTurnButton = components.find(c => c.label === 'End Turn');
        expect(endTurnButton.style).toBe(2); // ButtonStyle.Secondary
    });
});

// ============================================================
// TESTS: createManagementActionRow
// ============================================================

describe('createManagementActionRow', () => {
    const sessionId = 'test-session-mgmt';

    test('creates exactly 1 action row', () => {
        const row = createManagementActionRow(sessionId);
        expect(row).toBeDefined();
    });

    test('contains exactly 2 buttons', () => {
        const row = createManagementActionRow(sessionId);
        const components = row.toJSON().components;

        expect(components).toHaveLength(2);
    });

    test('Park Session uses park_combat_ prefix', () => {
        const row = createManagementActionRow(sessionId);
        const components = row.toJSON().components;

        const parkButton = components.find(c => c.label === 'Park Session');
        expect(parkButton.custom_id).toBe(`park_combat_${sessionId}`);
    });

    test('End Session uses end_combat_ prefix', () => {
        const row = createManagementActionRow(sessionId);
        const components = row.toJSON().components;

        const endButton = components.find(c => c.label === 'End Session');
        expect(endButton.custom_id).toBe(`end_combat_${sessionId}`);
    });

    test('Park Session has Secondary style', () => {
        const row = createManagementActionRow(sessionId);
        const components = row.toJSON().components;

        const parkButton = components.find(c => c.label === 'Park Session');
        expect(parkButton.style).toBe(2); // ButtonStyle.Secondary
    });

    test('End Session has Danger style', () => {
        const row = createManagementActionRow(sessionId);
        const components = row.toJSON().components;

        const endButton = components.find(c => c.label === 'End Session');
        expect(endButton.style).toBe(4); // ButtonStyle.Danger
    });

    test('all buttons have emojis', () => {
        const row = createManagementActionRow(sessionId);
        const components = row.toJSON().components;

        components.forEach(btn => {
            expect(btn.emoji).toBeDefined();
            expect(btn.emoji.name).toBeDefined();
        });
    });
});

// ============================================================
// TESTS: createNpcDmActionRow
// ============================================================

describe('createNpcDmActionRow', () => {
    const sessionId = 'test-session-789';
    const npcActorId = 'npc-actor-012';

    test('creates exactly 2 action rows', () => {
        const rows = createNpcDmActionRow(sessionId, npcActorId);
        expect(rows).toHaveLength(2);
    });

    describe('first row (NPC actions)', () => {
        test('contains exactly 3 buttons', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[0].toJSON().components;

            expect(components).toHaveLength(3);
        });

        test('NPC Attack uses dmnpc_action_attack_ prefix', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[0].toJSON().components;

            const attackButton = components.find(c => c.label === 'NPC Attack');
            expect(attackButton.custom_id).toBe(`dmnpc_action_attack_${sessionId}_${npcActorId}`);
        });

        test('NPC Skill/Action uses dmnpc_action_skill_ prefix', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[0].toJSON().components;

            const skillButton = components.find(c => c.label === 'NPC Skill/Action');
            expect(skillButton.custom_id).toBe(`dmnpc_action_skill_${sessionId}_${npcActorId}`);
        });

        test('NPC End Turn uses dmnpc_action_endturn_ prefix', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[0].toJSON().components;

            const endTurnButton = components.find(c => c.label === 'NPC End Turn');
            expect(endTurnButton.custom_id).toBe(`dmnpc_action_endturn_${sessionId}_${npcActorId}`);
        });

        test('NPC Attack has Danger style', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[0].toJSON().components;

            const attackButton = components.find(c => c.label === 'NPC Attack');
            expect(attackButton.style).toBe(4); // ButtonStyle.Danger
        });

        test('NPC Skill/Action has Primary style', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[0].toJSON().components;

            const skillButton = components.find(c => c.label === 'NPC Skill/Action');
            expect(skillButton.style).toBe(1); // ButtonStyle.Primary
        });

        test('NPC End Turn has Secondary style', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[0].toJSON().components;

            const endTurnButton = components.find(c => c.label === 'NPC End Turn');
            expect(endTurnButton.style).toBe(2); // ButtonStyle.Secondary
        });
    });

    describe('second row (session management)', () => {
        test('contains exactly 2 buttons', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[1].toJSON().components;

            expect(components).toHaveLength(2);
        });

        test('Park Session uses park_combat_ prefix', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[1].toJSON().components;

            const parkButton = components.find(c => c.label === 'Park Session');
            expect(parkButton.custom_id).toBe(`park_combat_${sessionId}`);
        });

        test('End Session uses end_combat_ prefix', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[1].toJSON().components;

            const endButton = components.find(c => c.label === 'End Session');
            expect(endButton.custom_id).toBe(`end_combat_${sessionId}`);
        });

        test('Park Session has Secondary style', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[1].toJSON().components;

            const parkButton = components.find(c => c.label === 'Park Session');
            expect(parkButton.style).toBe(2); // ButtonStyle.Secondary
        });

        test('End Session has Danger style', () => {
            const rows = createNpcDmActionRow(sessionId, npcActorId);
            const components = rows[1].toJSON().components;

            const endButton = components.find(c => c.label === 'End Session');
            expect(endButton.style).toBe(4); // ButtonStyle.Danger
        });
    });
});

// ============================================================
// TESTS: Control Contract Summary
// ============================================================

describe('Control Contract Summary', () => {
    test('all required custom_id prefixes are present in player turn (action + management rows)', () => {
        const sessionId = 'sess-test';
        const actorId = 'actor-test';
        const playerRow = createPlayerActionRow(sessionId, actorId);
        const managementRow = createManagementActionRow(sessionId);

        // Combine both rows as updateCombatDisplay does for player turns
        const allCustomIds = [
            ...playerRow.toJSON().components.map(c => c.custom_id),
            ...managementRow.toJSON().components.map(c => c.custom_id),
        ];

        // Player action prefixes
        expect(allCustomIds.some(id => id.startsWith('caa_'))).toBe(true);
        expect(allCustomIds.some(id => id.startsWith('cas_'))).toBe(true);
        expect(allCustomIds.some(id => id.startsWith('cet_'))).toBe(true);
        // Shared management prefixes
        expect(allCustomIds.some(id => id.startsWith('park_combat_'))).toBe(true);
        expect(allCustomIds.some(id => id.startsWith('end_combat_'))).toBe(true);
    });

    test('all required custom_id prefixes are present in NPC turn', () => {
        const sessionId = 'sess-test';
        const npcActorId = 'npc-test';
        const rows = createNpcDmActionRow(sessionId, npcActorId);
        const allCustomIds = rows.flatMap(r => r.toJSON().components.map(c => c.custom_id));

        expect(allCustomIds.some(id => id.startsWith('dmnpc_action_attack_'))).toBe(true);
        expect(allCustomIds.some(id => id.startsWith('dmnpc_action_skill_'))).toBe(true);
        expect(allCustomIds.some(id => id.startsWith('dmnpc_action_endturn_'))).toBe(true);
        expect(allCustomIds.some(id => id.startsWith('park_combat_'))).toBe(true);
        expect(allCustomIds.some(id => id.startsWith('end_combat_'))).toBe(true);
    });

    test('player and NPC turns have identical management buttons', () => {
        const sessionId = 'sess-test';
        const actorId = 'actor-test';
        const npcActorId = 'npc-test';

        const playerManagementRow = createManagementActionRow(sessionId);
        const npcRows = createNpcDmActionRow(sessionId, npcActorId);
        const npcManagementRow = npcRows[1];

        const playerMgmtIds = playerManagementRow
            .toJSON()
            .components.map(c => c.custom_id)
            .sort();
        const npcMgmtIds = npcManagementRow
            .toJSON()
            .components.map(c => c.custom_id)
            .sort();

        expect(playerMgmtIds).toEqual(npcMgmtIds);
    });
});
