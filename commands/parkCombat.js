const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
const { updateCombatDisplay } = require('../handlers/combatHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('parkcombat')
        .setDescription('Pauses the current combat session in this channel (DM only).'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const BACKEND_URL = process.env.BACKEND_URL;
        const channelId = interaction.channelId;
        const dmUserId = interaction.user.id;

        try {
            // 1. Get active combat session from memory
            if (!interaction.client.activeCombats?.has(channelId)) {
                return interaction.editReply('❌ There is no active combat session in this channel to park.');
            }
            const sessionData = interaction.client.activeCombats.get(channelId);
            const sessionId = sessionData.id;

            // 2. Verify user is the DM
            if (sessionData.dmUserId !== dmUserId) {
                return interaction.editReply('❌ Only the DM who started the combat can park it.');
            }
            
            if (sessionData.state !== 'RUNNING') {
                return interaction.editReply(`❌ Combat is not in a running state. Current state: ${sessionData.state}.`);
            }

            // 3. Send request to backend to update state
            await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, {
                state: 'PAUSED'
            });

            // 4. Update in-memory state
            sessionData.state = 'PAUSED';
            
            // 5. Update the combat display
            await updateCombatDisplay(interaction.client, channelId);

            await interaction.editReply('✅ Combat has been paused. Use `/resumecombat` to continue.');

        } catch (error) {
            console.error('Error parking combat:', error);
            let errorMessage = 'An error occurred while trying to park the combat.';
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = `Backend Error (${error.response.status}): ${error.response.data?.message || 'Failed to park session.'}`;
            }
            await interaction.editReply(`❌ ${errorMessage}`);
        }
    },
};