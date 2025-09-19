const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
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

        const BACKEND_URL = process.env.BACKEND_URL;
        const channelId = interaction.channelId;
        const dmUserId = interaction.user.id;
        const reason = interaction.options.getString('reason') || 'Ended by the DM.';

        try {
            let sessionData;
            // 1. Try to get session from memory first
            if (interaction.client.activeCombats?.has(channelId)) {
                sessionData = interaction.client.activeCombats.get(channelId);
            } else {
                // 2. If not in memory, check the backend for an active session
                try {
                    const response = await axios.get(`${BACKEND_URL}/combatSession/channel/${channelId}/active`);
                    sessionData = response.data;
                    // If found, load it into memory to ensure consistency
                    if (!interaction.client.activeCombats) interaction.client.activeCombats = new Map();
                    interaction.client.activeCombats.set(channelId, sessionData);
                } catch (error) {
                    if (axios.isAxiosError(error) && error.response?.status === 404) {
                        return interaction.editReply('❌ There is no active combat session in this channel to end.');
                    }
                    throw error; // Re-throw other errors
                }
            }
            
            if (!sessionData) {
                 return interaction.editReply('❌ Could not find an active combat session in this channel.');
            }

            const sessionId = sessionData.id;

            // 3. Verify user is the DM
            if (sessionData.dmUserId !== dmUserId) {
                return interaction.editReply('❌ Only the DM who started the combat can end it.');
            }

            // 4. Send request to backend to update state
            await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, {
                state: 'ENDED',
                combatLogEntry: `--- Combat Ended: ${reason} ---`
            });

            // 5. Update in-memory state
            sessionData.state = 'ENDED';
            if (!sessionData.combatLog) sessionData.combatLog = [];
            sessionData.combatLog.push(`--- Combat Ended: ${reason} ---`);

            // 6. Update the display one last time
            await updateCombatDisplay(interaction.client, channelId);
            
            // 7. Remove from active combats map
            interaction.client.activeCombats.delete(channelId);

            await interaction.editReply('✅ Combat has been ended.');

        } catch (error) {
            console.error('Error ending combat:', error);
            let errorMessage = 'An error occurred while trying to end the combat.';
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = `Backend Error (${error.response.status}): ${error.response.data?.message || 'Failed to end session.'}`;
            }
            await interaction.editReply(`❌ ${errorMessage}`);
        }
    },
};
