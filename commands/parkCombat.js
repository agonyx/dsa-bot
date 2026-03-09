const { SlashCommandBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { updateCombatDisplay } = require('../handlers/combatHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('parkcombat')
        .setDescription('Pauses the current combat session in this channel (DM only).'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channelId = interaction.channelId;
        const dmUserId = interaction.user.id;

        try {
            let sessionData;
            
            // 1. Try to get session from memory first
            if (interaction.client.activeCombats?.has(channelId)) {
                sessionData = interaction.client.activeCombats.get(channelId);
            } else {
                // 2. If not in memory, check the database for an active session
                const { data, error } = await supabase
                    .from('combat_sessions')
                    .select('*, combatants(*)')
                    .eq('channel_id', channelId)
                    .in('state', ['SETUP', 'RUNNING', 'PAUSED'])
                    .single();

                if (error || !data) {
                    return interaction.editReply('❌ There is no active combat session in this channel to park.');
                }
                
                // Convert snake_case to camelCase for in-memory compatibility
                sessionData = {
                    ...data,
                    dmUserId: data.dm_user_id,
                    channelId: data.channel_id,
                    messageId: data.message_id,
                    combatLog: data.combat_log,
                    turnOrder: data.turn_order,
                    currentTurnIndex: data.current_turn_index,
                    combatants: data.combatants?.map(c => ({
                        ...c,
                        maxHP: c.max_hp,
                        currentHP: c.current_hp,
                        initiativeRoll: c.initiative_roll,
                        initiativeBase: c.initiative_base,
                        playerId: c.player_id,
                        discordUserId: c.discord_user_id,
                        mobDefinitionId: c.mob_definition_id,
                        sessionId: c.session_id,
                        isActiveTurn: c.is_active_turn
                    })) || []
                };
                
                // If found, load it into memory
                if (!interaction.client.activeCombats) interaction.client.activeCombats = new Map();
                interaction.client.activeCombats.set(channelId, sessionData);
            }
            
            if (!sessionData) {
                return interaction.editReply('❌ Could not find an active combat session in this channel.');
            }
            
            const sessionId = sessionData.id;

            // 3. Verify user is the DM
            if (sessionData.dm_user_id !== dmUserId) {
                return interaction.editReply('❌ Only the DM who started the combat can park it.');
            }
            
            if (sessionData.state !== 'RUNNING') {
                return interaction.editReply(`❌ Combat is not in a running state. Current state: ${sessionData.state}.`);
            }

            // 4. Update state in database
            const { error } = await supabase
                .from('combat_sessions')
                .update({ state: 'PAUSED' })
                .eq('id', sessionId);

            if (error) throw error;

            // 5. Update in-memory state
            sessionData.state = 'PAUSED';
            
            // 6. Update the combat display
            await updateCombatDisplay(interaction.client, channelId);

            await interaction.editReply('✅ Combat has been paused. Use `/resumecombat` to continue.');

        } catch (error) {
            console.error('Error parking combat:', error);
            await interaction.editReply(`❌ An error occurred: ${error.message || 'Failed to park combat.'}`);
        }
    },
};
