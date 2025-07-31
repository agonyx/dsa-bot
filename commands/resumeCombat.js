const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
const { updateCombatDisplay } = require('../handlers/combatHandler');

async function resumeSingleCombat(interaction, sessionToResume) {
    const { client, channelId } = interaction;
    const sessionId = sessionToResume.id;

    const response = await axios.put(`${process.env.BACKEND_URL}/combatSession/${sessionId}`, {
        state: 'RUNNING',
        combatLogEntry: '--- Combat Resumed ---'
    });
    const updatedSession = response.data;

    if (!client.activeCombats) {
        client.activeCombats = new Map();
    }
    client.activeCombats.set(channelId, updatedSession);

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
        const BACKEND_URL = process.env.BACKEND_URL;

        try {
            if (client.activeCombats?.has(channelId)) {
                return interaction.editReply('❌ A combat session is already active in this channel.');
            }

            const response = await axios.get(`${BACKEND_URL}/combatSession/channel/${channelId}?state=PAUSED`);
            const pausedSessions = response.data;

            if (!Array.isArray(pausedSessions) || pausedSessions.length === 0) {
                return interaction.editReply('❌ No paused combat sessions found in this channel to resume.');
            }

            const userSessions = pausedSessions.filter(s => s.dmUserId === user.id);

            if (userSessions.length === 0) {
                return interaction.editReply('❌ You are not the DM for any of the paused sessions in this channel.');
            }

            if (userSessions.length === 1) {
                return await resumeSingleCombat(interaction, userSessions[0]);
            }

            const options = userSessions.map(session => {
                const label = `Session ${session.id.substring(0, 8)}`;
                const description = `Paused on ${new Date(session.updatedAt).toLocaleString()}`;
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
            let errorMessage = 'An error occurred while trying to resume the combat.';
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 404) {
                    errorMessage = '❌ No paused combat sessions found in this channel to resume.';
                } else {
                    errorMessage = `Backend Error (${error.response.status}): ${error.response.data?.message || 'Failed to resume session.'}`;
                }
            }
            await interaction.editReply(`❌ ${errorMessage}`);
        }
    },
};