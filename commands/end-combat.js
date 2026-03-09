const { SlashCommandBuilder } = require('discord.js');
const { supabase, callEdgeFunction } = require('../utils/supabaseClient');
const { updateCombatDisplay } = require('../handlers/combatHandler');
const { createLogger } = require('../utils/logger');
const log = createLogger('end-combat');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('end-combat')
        .setDescription('Prematurely ends the current combat session (DM only).')
        .addStringOption(option =>
            option.setName('reason').setDescription('An optional reason for ending the combat.').setRequired(false)
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channelId = interaction.channelId;
        const dmUserId = interaction.user.id;
        const reason = interaction.options.getString('reason') || 'Ended by the DM.';

        try {
            let sessionData;

            if (interaction.client.activeCombats?.has(channelId)) {
                sessionData = interaction.client.activeCombats.get(channelId);
            } else {
                const { data, error } = await supabase
                    .from('combat_sessions')
                    .select('*, combatants(*)')
                    .eq('channel_id', channelId)
                    .in('state', ['SETUP', 'RUNNING', 'PAUSED'])
                    .single();

                if (error || !data) {
                    return interaction.editReply('❌ There is no active combat session in this channel to end.');
                }

                sessionData = {
                    ...data,
                    dmUserId: data.dm_user_id,
                    channelId: data.channel_id,
                    messageId: data.message_id,
                    combatLog: data.combat_log,
                    turnOrder: data.turn_order,
                    currentTurnIndex: data.current_turn_index,
                    combatants:
                        data.combatants?.map(c => ({
                            ...c,
                            maxHP: c.max_hp,
                            currentHP: c.current_hp,
                            initiativeRoll: c.initiative_roll,
                            initiativeBase: c.initiative_base,
                            playerId: c.player_id,
                            discordUserId: c.discord_user_id,
                            mobDefinitionId: c.mob_definition_id,
                            sessionId: c.session_id,
                            isActiveTurn: c.is_active_turn,
                        })) || [],
                };

                if (!interaction.client.activeCombats) interaction.client.activeCombats = new Map();
                interaction.client.activeCombats.set(channelId, sessionData);
            }

            if (!sessionData) {
                return interaction.editReply('❌ Could not find an active combat session in this channel.');
            }

            const sessionId = sessionData.id;

            if (sessionData.dm_user_id !== dmUserId) {
                return interaction.editReply('❌ Only the DM who started the combat can end it.');
            }

            await callEdgeFunction('end-combat', {
                sessionId,
                reason,
            });

            sessionData.state = 'ENDED';
            if (!sessionData.combat_log) sessionData.combat_log = [];
            sessionData.combat_log.push(`--- Combat Ended: ${reason} ---`);

            await updateCombatDisplay(interaction.client, channelId);

            interaction.client.activeCombats.delete(channelId);

            await interaction.editReply('✅ Combat has been ended.');
        } catch (error) {
            log.error({ error }, 'Error ending combat');
            await interaction.editReply(`❌ An error occurred: ${error.message || 'Failed to end combat.'}`);
        }
    },
};
