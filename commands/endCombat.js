const { SlashCommandBuilder } = require('discord.js');
const { supabase, callEdgeFunction } = require('../utils/supabaseClient');
const { updateCombatDisplay } = require('../handlers/combatHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('endcombat')
        .setDescription('Prematurely ends the current combat session (DM only).')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('An optional reason for ending the combat.')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channelId = interaction.channelId;
        const dmUserId = interaction.user.id;
        const reason = interaction.options.getString('reason') || 'Ended by the DM.';

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
                    return interaction.editReply('❌ There is no active combat session in this channel to end.');
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
                return interaction.editReply('❌ Only the DM who started the combat can end it.');
            }

            // 4. Update state using edge function
            await callEdgeFunction('end-combat', { 
                sessionId,
                reason 
            });

            // 5. Update in-memory state
            sessionData.state = 'ENDED';
            if (!sessionData.combat_log) sessionData.combat_log = [];
            sessionData.combat_log.push(`--- Combat Ended: ${reason} ---`);

            // 6. Update the display one last time
            await updateCombatDisplay(interaction.client, channelId);
            
            // 7. Remove from active combats map
            interaction.client.activeCombats.delete(channelId);

            await interaction.editReply('✅ Combat has been ended.');

        } catch (error) {
            console.error('Error ending combat:', error);
            await interaction.editReply(`❌ An error occurred: ${error.message || 'Failed to end combat.'}`);
        }
    },
};
