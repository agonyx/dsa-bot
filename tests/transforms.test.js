const { combatantToMemory, combatantToDb, sessionToMemory, sessionToDb } = require('../utils/transforms');

describe('combatantToMemory', () => {
    test('converts snake_case to camelCase', () => {
        const dbCombatant = {
            id: '123',
            name: 'Goblin',
            max_hp: 20,
            current_hp: 15,
            initiative_roll: 12,
            initiative_base: 8,
            player_id: 'player-1',
            discord_user_id: 'discord-123',
            mob_definition_id: 'mob-1',
            session_id: 'session-1',
            is_active_turn: true,
        };

        const result = combatantToMemory(dbCombatant);

        expect(result.maxHP).toBe(20);
        expect(result.currentHP).toBe(15);
        expect(result.initiativeRoll).toBe(12);
        expect(result.initiativeBase).toBe(8);
        expect(result.playerId).toBe('player-1');
        expect(result.discordUserId).toBe('discord-123');
        expect(result.mobDefinitionId).toBe('mob-1');
        expect(result.sessionId).toBe('session-1');
        expect(result.isActiveTurn).toBe(true);
    });

    test('preserves other properties', () => {
        const dbCombatant = {
            id: '123',
            name: 'Goblin',
            max_hp: 20,
            extraField: 'preserved',
        };

        const result = combatantToMemory(dbCombatant);

        expect(result.id).toBe('123');
        expect(result.name).toBe('Goblin');
        expect(result.extraField).toBe('preserved');
    });

    test('returns null for null input', () => {
        expect(combatantToMemory(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
        expect(combatantToMemory(undefined)).toBeNull();
    });

    test('handles missing optional fields', () => {
        const dbCombatant = {
            id: '123',
            name: 'Test',
        };

        const result = combatantToMemory(dbCombatant);

        expect(result.maxHP).toBeUndefined();
        expect(result.playerId).toBeUndefined();
    });

    test('handles empty object', () => {
        const result = combatantToMemory({});
        expect(result).toEqual({});
    });
});

describe('combatantToDb', () => {
    test('converts camelCase to snake_case', () => {
        const memoryCombatant = {
            id: '123',
            name: 'Goblin',
            maxHP: 20,
            currentHP: 15,
            initiativeRoll: 12,
            initiativeBase: 8,
            playerId: 'player-1',
            discordUserId: 'discord-123',
            mobDefinitionId: 'mob-1',
            sessionId: 'session-1',
            isActiveTurn: true,
        };

        const result = combatantToDb(memoryCombatant);

        expect(result.max_hp).toBe(20);
        expect(result.current_hp).toBe(15);
        expect(result.initiative_roll).toBe(12);
        expect(result.initiative_base).toBe(8);
        expect(result.player_id).toBe('player-1');
        expect(result.discord_user_id).toBe('discord-123');
        expect(result.mob_definition_id).toBe('mob-1');
        expect(result.session_id).toBe('session-1');
        expect(result.is_active_turn).toBe(true);
    });

    test('preserves other properties', () => {
        const memoryCombatant = {
            id: '123',
            name: 'Goblin',
            maxHP: 20,
            extraField: 'preserved',
        };

        const result = combatantToDb(memoryCombatant);

        expect(result.id).toBe('123');
        expect(result.name).toBe('Goblin');
        expect(result.extraField).toBe('preserved');
    });

    test('returns null for null input', () => {
        expect(combatantToDb(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
        expect(combatantToDb(undefined)).toBeNull();
    });

    test('handles missing optional fields', () => {
        const memoryCombatant = {
            id: '123',
            name: 'Test',
        };

        const result = combatantToDb(memoryCombatant);

        expect(result.max_hp).toBeUndefined();
        expect(result.player_id).toBeUndefined();
    });
});

describe('sessionToMemory', () => {
    test('converts session with combatants', () => {
        const dbSession = {
            id: 'session-1',
            dm_user_id: 'dm-123',
            channel_id: 'channel-1',
            message_id: 'message-1',
            combat_log: ['turn 1', 'turn 2'],
            turn_order: ['a', 'b', 'c'],
            current_turn_index: 0,
            combatants: [
                { id: 'c1', max_hp: 20 },
                { id: 'c2', max_hp: 30 },
            ],
        };

        const result = sessionToMemory(dbSession);

        expect(result.dmUserId).toBe('dm-123');
        expect(result.channelId).toBe('channel-1');
        expect(result.messageId).toBe('message-1');
        expect(result.combatLog).toEqual(['turn 1', 'turn 2']);
        expect(result.turnOrder).toEqual(['a', 'b', 'c']);
        expect(result.currentTurnIndex).toBe(0);
        expect(result.currentRound).toBeUndefined();
        expect(result.combatants).toHaveLength(2);
        expect(result.combatants[0].maxHP).toBe(20);
        expect(result.combatants[1].maxHP).toBe(30);
    });

    test('maps current_round to currentRound', () => {
        const result = sessionToMemory({ id: 'session-1', current_round: 3 });

        expect(result.currentRound).toBe(3);
    });

    test('handles empty combatants array', () => {
        const dbSession = {
            id: 'session-1',
            combatants: [],
        };

        const result = sessionToMemory(dbSession);

        expect(result.combatants).toEqual([]);
    });

    test('handles missing combatants as empty array', () => {
        const dbSession = {
            id: 'session-1',
        };

        const result = sessionToMemory(dbSession);

        expect(result.combatants).toEqual([]);
    });

    test('returns null for null input', () => {
        expect(sessionToMemory(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
        expect(sessionToMemory(undefined)).toBeNull();
    });

    test('preserves other session properties', () => {
        const dbSession = {
            id: 'session-1',
            status: 'active',
            created_at: '2024-01-01',
        };

        const result = sessionToMemory(dbSession);

        expect(result.status).toBe('active');
        expect(result.created_at).toBe('2024-01-01');
    });
});

describe('sessionToDb', () => {
    test('converts session to db format', () => {
        const memorySession = {
            id: 'session-1',
            dmUserId: 'dm-123',
            channelId: 'channel-1',
            messageId: 'message-1',
            combatLog: ['turn 1'],
            turnOrder: ['a', 'b'],
            currentTurnIndex: 1,
        };

        const result = sessionToDb(memorySession);

        expect(result.dm_user_id).toBe('dm-123');
        expect(result.channel_id).toBe('channel-1');
        expect(result.message_id).toBe('message-1');
        expect(result.combat_log).toEqual(['turn 1']);
        expect(result.turn_order).toEqual(['a', 'b']);
        expect(result.current_turn_index).toBe(1);
        expect(result.current_round).toBeUndefined();
    });

    test('maps currentRound to current_round', () => {
        const result = sessionToDb({ id: 'session-1', currentRound: 5 });

        expect(result.current_round).toBe(5);
    });

    test('returns null for null input', () => {
        expect(sessionToDb(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
        expect(sessionToDb(undefined)).toBeNull();
    });

    test('preserves other properties', () => {
        const memorySession = {
            id: 'session-1',
            status: 'active',
            dmUserId: 'dm-123',
        };

        const result = sessionToDb(memorySession);

        expect(result.id).toBe('session-1');
        expect(result.status).toBe('active');
    });

    test('does not convert combatants (handled separately)', () => {
        const memorySession = {
            id: 'session-1',
            dmUserId: 'dm-123',
            combatants: [{ id: 'c1' }],
        };

        const result = sessionToDb(memorySession);

        // combatants array is preserved as-is via spread
        expect(result.combatants).toEqual([{ id: 'c1' }]);
    });
});

describe('Round-trip conversions', () => {
    test('combatantToDb(combatantToMemory(x)) preserves snake_case fields', () => {
        const original = {
            id: '123',
            name: 'Test',
            max_hp: 20,
            current_hp: 15,
            player_id: 'p1',
        };

        const memory = combatantToMemory(original);
        const backToDb = combatantToDb(memory);

        expect(backToDb.max_hp).toBe(20);
        expect(backToDb.current_hp).toBe(15);
        expect(backToDb.player_id).toBe('p1');
    });

    test('combatantToMemory(combatantToDb(x)) preserves camelCase fields', () => {
        const original = {
            id: '123',
            name: 'Test',
            maxHP: 20,
            currentHP: 15,
            playerId: 'p1',
        };

        const db = combatantToDb(original);
        const backToMemory = combatantToMemory(db);

        expect(backToMemory.maxHP).toBe(20);
        expect(backToMemory.currentHP).toBe(15);
        expect(backToMemory.playerId).toBe('p1');
    });
});
