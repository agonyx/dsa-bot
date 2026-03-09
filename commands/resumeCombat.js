const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { updateCombatDisplay } = require('../handlers/combatHandler');

async function resumeSingleCombat(interaction, sessionToResume) {
    const { client, channelId } = interaction;
    const sessionId = sessionToResume.id;

    const { data: updatedSession, error } = await supabase
        .from('combat_sessions')
        .update({ 
            state: 'RUNNING',
            combat_log: [...(sessionToResume.combat_log || []), '--- Combat Resumed ---']
        })
        .eq('id', sessionId)
        .select('*, combatants(*)')
        .single();

    if (error) throw error;

    if (!client.activeCombats) {
        client.activeCombats = new Map();
    }
    
    // Convert snake_case to camelCase for in-memory compatibility
    const memorySession = {
        ...updatedSession,
        dmUserId: updatedSession.dm_user_id,
        channelId: updatedSession.channel_id,
        messageId: updatedSession.message_id,
        combatLog: updatedSession.combat_log,
        turnOrder: updatedSession.turn_order,
        currentTurnIndex: updatedSession.current_turn_index,
        combatants: updatedSession.combatants?.map(c => ({
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
    client.activeCombats.set(channelId, memorySession);

    await updateCombatDisplay(client, channelId);
    await interaction.editReply('✅ Combat has been resumed.');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resumecombat')
        .setDescription('Resumes a parked combat session in this channel (DM only).'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { client, channelId, user } = interaction;

        try {
            if (client.activeCombats?.has(channelId)) {
                return interaction.editReply('❌ A combat session is already active in this channel.');
            }

            const { data: pausedSessions, error } = await supabase
                .from('combat_sessions')
                .select('*, combatants(*)')
                .eq('channel_id', channelId)
                .eq('state', 'PAUSED');

            if (error) throw error;

            if (!pausedSessions || pausedSessions.length === 0) {
                return interaction.editReply('❌ No paused combat sessions found in this channel to resume.');
            }

            const userSessions = pausedSessions.filter(s => s.dm_user_id === user.id);

            if (userSessions.length === 0) {
                return interaction.editReply('❌ You are not the DM for any of the paused sessions in this channel.');
            }

            if (userSessions.length === 1) {
                return await resumeSingleCombat(interaction, userSessions[0]);
            }

            const options = userSessions.map(session => {
                const label = `Session ${session.id.substring(0, 8)}`;
                const description = `Paused on ${new Date(session.updated_at).toLocaleString()}`;
                return { label, description, value: session.id };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('resume_session_select')
                .setPlaceholder('Choose a session to resume...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.editReply({
                content: 'Multiple paused sessions found. Please choose which one to resume:',
                components: [row],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error resuming combat:', error);
            await interaction.editReply(`❌ An error occurred: ${error.message || 'Failed to resume combat.'}`);
        }
    },
};
