const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createSetupEmbed, createSetupActionRows } = require('../utils/combatComponents'); 

async function executeStartCombat(interaction) {
    try {
        await interaction.deferReply();
    } catch (deferError) {
        console.error("Failed to defer reply:", deferError);
        return;
    }

    const channelId = interaction.channelId;
    const dmUserId = interaction.user.id;
    const dmUsername = interaction.user.username;

    try {
        // Check if there's already an active session in this channel
        const { data: existingSession } = await supabase
            .from('combat_sessions')
            .select('id')
            .eq('channel_id', channelId)
            .in('state', ['SETUP', 'RUNNING', 'PAUSED'])
            .single();

        if (existingSession) {
            return interaction.editReply({ 
                content: 'An active combat session already exists in this channel.', 
                ephemeral: true 
            });
        }

        // Create Combat Session
        const { data: session, error } = await supabase
            .from('combat_sessions')
            .insert({
                channel_id: channelId,
                dm_user_id: dmUserId,
                state: 'SETUP'
            })
            .select()
            .single();

        if (error || !session) {
            console.error("Failed to create session:", error);
            return interaction.editReply({ 
                content: `Failed to create combat session.`, 
                ephemeral: true 
            });
        }

        const sessionId = session.id;
        console.log(`Combat session created successfully. Session ID: ${sessionId}`);

        const setupEmbed = createSetupEmbed(sessionId, dmUsername, []);
        const initialActionRows = createSetupActionRows(sessionId, false);

        const setupMessage = await interaction.editReply({
            embeds: [setupEmbed],
            components: initialActionRows,
            fetchReply: true
        });

        // Update Session with Message ID
        const { error: updateError } = await supabase
            .from('combat_sessions')
            .update({ message_id: setupMessage.id })
            .eq('id', sessionId);

        if (updateError) {
            console.error(`Failed to update session ${sessionId} with message ID ${setupMessage.id}:`, updateError);
            await interaction.followUp({ 
                content: '⚠️ Session created, but failed to store message link. Combat might not update correctly.', 
                ephemeral: true 
            });
        }

    } catch (error) {
        console.error('Error in executeStartCombat function:', error);
        try {
            await interaction.editReply({ 
                content: `❌ An error occurred while starting combat setup: ${error.message}`, 
                ephemeral: true 
            });
        } catch (replyError) {
            console.error("Failed to send error reply:", replyError);
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('startcombat')
        .setDescription('Initiates the setup phase for a new combat encounter in this channel.')
        .setDMPermission(false),
    execute: executeStartCombat
};
