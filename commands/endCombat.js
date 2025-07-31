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
            // 1. Get active combat session from memory
            if (!interaction.client.activeCombats?.has(channelId)) {
                return interaction.editReply('❌ There is no active combat session in this channel to end.');
            }
            const sessionData = interaction.client.activeCombats.get(channelId);
            const sessionId = sessionData.id;

            // 2. Verify user is the DM
            if (sessionData.dmUserId !== dmUserId) {
                return interaction.editReply('❌ Only the DM who started the combat can end it.');
            }

            // 3. Send request to backend to update state
            await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, {
                state: 'ENDED',
                combatLogEntry: `--- Combat Ended: ${reason} ---`
            });

            // 4. Update in-memory state
            sessionData.state = 'ENDED';
            if (!sessionData.combatLog) sessionData.combatLog = [];
            sessionData.combatLog.push(`--- Combat Ended: ${reason} ---`);

            // 5. Update the display one last time
            await updateCombatDisplay(interaction.client, channelId);
            
            // 6. Remove from active combats map
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
