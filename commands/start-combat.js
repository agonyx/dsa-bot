const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createSetupEmbed, createSetupActionRows } = require('../utils/combatComponents');
const { createLogger } = require('../utils/logger');
const log = createLogger('start-combat');

async function executeStartCombat(interaction) {
    try {
        await interaction.deferReply();
    } catch (deferError) {
        log.error({ error: deferError }, 'Failed to defer reply');
        return;
    }

    const channelId = interaction.channelId;
    const dmUserId = interaction.user.id;
    const dmUsername = interaction.user.username;

    try {
        const { data: existingSession } = await supabase
            .from('combat_sessions')
            .select('id')
            .eq('channel_id', channelId)
            .in('state', ['SETUP', 'RUNNING', 'PAUSED'])
            .single();

        if (existingSession) {
            return interaction.editReply({
                content: 'An active combat session already exists in this channel.',
                ephemeral: true,
            });
        }

        const { data: session, error } = await supabase
            .from('combat_sessions')
            .insert({
                channel_id: channelId,
                dm_user_id: dmUserId,
                state: 'SETUP',
            })
            .select()
            .single();

        if (error || !session) {
            log.error({ error }, 'Failed to create session');
            return interaction.editReply({
                content: `Failed to create combat session.`,
                ephemeral: true,
            });
        }

        const sessionId = session.id;
        log.info({ sessionId }, 'Combat session created successfully');

        const setupEmbed = createSetupEmbed(sessionId, dmUsername, [], false);
        const initialActionRows = createSetupActionRows(sessionId, false);

        const setupMessage = await interaction.editReply({
            embeds: [setupEmbed],
            components: initialActionRows,
            fetchReply: true,
        });

        const { error: updateError } = await supabase
            .from('combat_sessions')
            .update({ message_id: setupMessage.id })
            .eq('id', sessionId);

        if (updateError) {
            log.error(
                { error: updateError, sessionId, messageId: setupMessage.id },
                'Failed to update session with message ID'
            );
            await interaction.followUp({
                content: '⚠️ Session created, but failed to store message link. Combat might not update correctly.',
                ephemeral: true,
            });
        }
    } catch (error) {
        log.error({ error }, 'Error in executeStartCombat function');
        try {
            await interaction.editReply({
                content: `❌ An error occurred while starting combat setup: ${error.message}`,
                ephemeral: true,
            });
        } catch (replyError) {
            log.error({ error: replyError }, 'Failed to send error reply');
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start-combat')
        .setDescription('Initiates the setup phase for a new combat encounter in this channel.')
        .setDMPermission(false),
    execute: executeStartCombat,
};
