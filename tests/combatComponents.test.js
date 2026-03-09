const {
    createSetupEmbed,
    createSetupActionRows,
} = require('../utils/combatComponents');

describe('createSetupEmbed', () => {
    const sessionId = '12345678-1234-1234-1234-123456789abc';
    const dmUsername = 'TestDM';

    test('creates embed with correct title and description', () => {
        const embed = createSetupEmbed(sessionId, dmUsername);
        const data = embed.toJSON();

        expect(data.title).toBe('⚔️ Combat Setup Initiated ⚔️');
        expect(data.description).toContain('TestDM');
        expect(data.description).toContain('Join Combat');
        expect(data.description).toContain('Manage Participants');
    });

    test('includes truncated session ID in footer', () => {
        const embed = createSetupEmbed(sessionId, dmUsername);
        const data = embed.toJSON();

        expect(data.footer.text).toContain('12345678');
    });

    test('shows "None yet" for empty participants', () => {
        const embed = createSetupEmbed(sessionId, dmUsername, []);
        const data = embed.toJSON();

        const playersField = data.fields.find(f => f.name === '👤 Players Joined');
        const mobsField = data.fields.find(f => f.name === '👾 Mobs Added');

        expect(playersField.value).toBe('None yet.');
        expect(mobsField.value).toBe('None yet.');
    });

    test('displays player names in Players Joined field', () => {
        const participants = [
            { type: 'PLAYER', name: 'Alice' },
            { type: 'PLAYER', name: 'Bob' },
        ];
        const embed = createSetupEmbed(sessionId, dmUsername, participants);
        const data = embed.toJSON();

        const playersField = data.fields.find(f => f.name === '👤 Players Joined');
        expect(playersField.value).toBe('- Alice\n- Bob');
    });

    test('displays mob names in Mobs Added field', () => {
        const participants = [
            { type: 'NPC', name: 'Goblin' },
            { type: 'NPC', name: 'Orc' },
        ];
        const embed = createSetupEmbed(sessionId, dmUsername, participants);
        const data = embed.toJSON();

        const mobsField = data.fields.find(f => f.name === '👾 Mobs Added');
        expect(mobsField.value).toBe('- Goblin\n- Orc');
    });

    test('separates players and NPCs correctly', () => {
        const participants = [
            { type: 'PLAYER', name: 'Alice' },
            { type: 'NPC', name: 'Goblin' },
            { type: 'PLAYER', name: 'Bob' },
            { type: 'NPC', name: 'Orc' },
        ];
        const embed = createSetupEmbed(sessionId, dmUsername, participants);
        const data = embed.toJSON();

        const playersField = data.fields.find(f => f.name === '👤 Players Joined');
        const mobsField = data.fields.find(f => f.name === '👾 Mobs Added');

        expect(playersField.value).toBe('- Alice\n- Bob');
        expect(mobsField.value).toBe('- Goblin\n- Orc');
    });

    test('handles participants without names', () => {
        const participants = [
            { type: 'PLAYER', name: null },
            { type: 'NPC' },
        ];
        const embed = createSetupEmbed(sessionId, dmUsername, participants);
        const data = embed.toJSON();

        const playersField = data.fields.find(f => f.name === '👤 Players Joined');
        const mobsField = data.fields.find(f => f.name === '👾 Mobs Added');

        expect(playersField.value).toBe('- Unknown Player');
        expect(mobsField.value).toBe('- Unknown Mob');
    });

    test('has exactly 2 fields', () => {
        const embed = createSetupEmbed(sessionId, dmUsername, []);
        const data = embed.toJSON();

        expect(data.fields).toHaveLength(2);
    });

    test('fields are inline', () => {
        const embed = createSetupEmbed(sessionId, dmUsername, []);
        const data = embed.toJSON();

        data.fields.forEach(field => {
            expect(field.inline).toBe(true);
        });
    });
});

describe('createSetupActionRows', () => {
    const sessionId = '12345678-1234-1234-1234-123456789abc';

    test('returns exactly 2 action rows', () => {
        const rows = createSetupActionRows(sessionId, true);
        expect(rows).toHaveLength(2);
    });

    test('first row has Join, Add Mob, and Start buttons', () => {
        const rows = createSetupActionRows(sessionId, true);
        const firstRowComponents = rows[0].toJSON().components;

        expect(firstRowComponents).toHaveLength(3);
        expect(firstRowComponents[0].custom_id).toBe(`join_combat_${sessionId}`);
        expect(firstRowComponents[1].custom_id).toBe(`add_mob_modal_${sessionId}`);
        expect(firstRowComponents[2].custom_id).toBe(`start_fight_${sessionId}`);
    });

    test('second row has Leave, Manage, and Cancel buttons', () => {
        const rows = createSetupActionRows(sessionId, true);
        const secondRowComponents = rows[1].toJSON().components;

        expect(secondRowComponents).toHaveLength(3);
        expect(secondRowComponents[0].custom_id).toBe(`leave_setup_${sessionId}`);
        expect(secondRowComponents[1].custom_id).toBe(`manage_participants_${sessionId}`);
        expect(secondRowComponents[2].custom_id).toBe(`cancel_combat_${sessionId}`);
    });

    test('Start button is disabled when canStart is false', () => {
        const rows = createSetupActionRows(sessionId, false);
        const startButton = rows[0].toJSON().components[2];

        expect(startButton.disabled).toBe(true);
    });

    test('Start button is enabled when canStart is true', () => {
        const rows = createSetupActionRows(sessionId, true);
        const startButton = rows[0].toJSON().components[2];

        expect(startButton.disabled).toBe(false);
    });

    test('all buttons have correct styles', () => {
        const rows = createSetupActionRows(sessionId, true);
        const firstRow = rows[0].toJSON().components;
        const secondRow = rows[1].toJSON().components;

        // Join button - Success (3)
        expect(firstRow[0].style).toBe(3);
        // Add Mob button - Secondary (2)
        expect(firstRow[1].style).toBe(2);
        // Start button - Primary (1)
        expect(firstRow[2].style).toBe(1);

        // Leave button - Secondary (2)
        expect(secondRow[0].style).toBe(2);
        // Manage button - Primary (1)
        expect(secondRow[1].style).toBe(1);
        // Cancel button - Danger (4)
        expect(secondRow[2].style).toBe(4);
    });

    test('all buttons have labels', () => {
        const rows = createSetupActionRows(sessionId, true);
        const allComponents = [
            ...rows[0].toJSON().components,
            ...rows[1].toJSON().components,
        ];

        allComponents.forEach(component => {
            expect(component.label).toBeDefined();
            expect(component.label.length).toBeGreaterThan(0);
        });
    });

    test('all buttons have emojis', () => {
        const rows = createSetupActionRows(sessionId, true);
        const allComponents = [
            ...rows[0].toJSON().components,
            ...rows[1].toJSON().components,
        ];

        allComponents.forEach(component => {
            expect(component.emoji).toBeDefined();
            expect(component.emoji.name).toBeDefined();
        });
    });

    test('includes full session ID in custom_ids', () => {
        const rows = createSetupActionRows(sessionId, true);
        const allComponents = [
            ...rows[0].toJSON().components,
            ...rows[1].toJSON().components,
        ];

        allComponents.forEach(component => {
            expect(component.custom_id).toContain(sessionId);
        });
    });
});
