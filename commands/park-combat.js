const { SlashCommandBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { updateCombatDisplay } = require('../handlers/combatHandler');
const { createLogger } = require('../utils/logger');
const log = createLogger('park-combat');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('park-combat')
        .setDescription('Pauses the current combat session in this channel (DM only).'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channelId = interaction.channelId;
        const dmUserId = interaction.user.id;

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
                    return interaction.editReply('❌ There is no active combat session in this channel to park.');
                }

                sessionData = {
                    ...data,
                    dmUserId: data.dm_user_id,
                    channelId: data.channel_id,
                    messageId: data.message_id,
                    combatLog: data.combat_log,
                    turnOrder: data.turn_order,
                    currentTurnIndex: data.current_turn_index,
                    currentRound: data.current_round,
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
                sessionData.currentRound = sessionData.currentRound || 1;

                if (!interaction.client.activeCombats) interaction.client.activeCombats = new Map();
                interaction.client.activeCombats.set(channelId, sessionData);
            }

            if (!sessionData) {
                return interaction.editReply('❌ Could not find an active combat session in this channel.');
            }

            const sessionId = sessionData.id;

            if (sessionData.dm_user_id !== dmUserId) {
                return interaction.editReply('❌ Only the DM who started the combat can park it.');
            }

            if (sessionData.state !== 'RUNNING') {
                return interaction.editReply(
                    `❌ Combat is not in a running state. Current state: ${sessionData.state}.`
                );
            }

            const { error } = await supabase.from('combat_sessions').update({ state: 'PAUSED' }).eq('id', sessionId);

            if (error) throw error;

            sessionData.state = 'PAUSED';

            await updateCombatDisplay(interaction.client, channelId);

            await interaction.editReply('✅ Combat has been paused. Use `/resume-combat` to continue.');
        } catch (error) {
            log.error({ error }, 'Error parking combat');
            await interaction.editReply(`❌ An error occurred: ${error.message || 'Failed to park combat.'}`);
        }
    },
};
