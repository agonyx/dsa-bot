// src/commands/combat/startcombat.js

// --- Imports ---
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
const { createSetupEmbed, createSetupActionRows } = require('../utils/combatComponents'); 
// --- Constants ---

// --- Main Execution Function ---
/**
 * Executes the combat setup command logic.
 * @param {Interaction} interaction - The command interaction.
 */
async function executeStartCombat(interaction) {
    const BACKEND_URL = process.env.BACKEND_URL;
    if (!BACKEND_URL) {
        console.error("Error: BACKEND_URL environment variable is not set.");
        // Handle missing env var appropriately
    }
    // Optional: Permission checks...

    try {
        await interaction.deferReply();
    } catch (deferError) {
         console.error("Failed to defer reply:", deferError);
         return;
    }

    const channelId = interaction.channelId;
    const dmUserId = interaction.user.id;
    const dmUsername = interaction.user.username;

    let sessionId;

    try {
        // --- 1. API Call: Create Combat Session ---
        // *** FIX: Changed endpoint path from /api/combats to /combatSession ***
        console.log(`Attempting POST ${BACKEND_URL}/combatSession`);
        const response = await axios.post(`${BACKEND_URL}/combatSession`, {
            channelId: channelId,
            dmUserId: dmUserId
        });

        if (response.status === 201 && response.data && response.data.id) {
            sessionId = response.data.id;
            console.log(`Combat session created successfully. Session ID: ${sessionId}`);

            const setupEmbed = createSetupEmbed(sessionId, dmUsername, []); // Initial empty participants

            // *** Use the helper function ***
            // Initially, combat cannot start (0 participants)
            const initialActionRows = createSetupActionRows(sessionId, false);

            const setupMessage = await interaction.editReply({
                embeds: [setupEmbed],
                components: initialActionRows, // Use the rows from the helper
                fetchReply: true
            });

            // --- 3. API Call: Update Session with Message ID ---
            try {
                // *** FIX: Changed endpoint path from /api/combats/:id to /combatSession/:id ***
                console.log(`Attempting PUT ${BACKEND_URL}/combatSession/${sessionId}`);
                await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, {
                    messageId: setupMessage.id
                });
                console.log(`Session ${sessionId} updated with message ID.`);
            } catch (updateError) {
                console.error(`Failed to update session ${sessionId} with message ID ${setupMessage.id}:`, updateError);
                await interaction.followUp({ content: '⚠️ Session created, but failed to store message link. Combat might not update correctly.', ephemeral: true });
            }

            // --- 4. Optional: Update Bot In-Memory State ---
            // ... (your logic here if using in-memory map) ...

        } else {
             console.error("Failed to create session, unexpected backend response:", response.status, response.data);
             await interaction.editReply({ content: `Failed to create combat session. Backend responded with status ${response.status}.`, ephemeral: true });
        }

    } catch (error) {
         console.error('Error in executeStartCombat function:', error);
         let errorMessage = 'An error occurred while starting combat setup.';
         if (axios.isAxiosError(error)) {
             if (error.response) {
                 console.error(`Backend error details: Status=${error.response.status}, Data=${JSON.stringify(error.response.data)}`);
                 if (error.response.status === 409) { // Conflict
                     errorMessage = typeof error.response.data === 'string' && error.response.data.length > 0 ? error.response.data : 'An active combat session already exists in this channel.';
                 } else if (error.response.status === 404) { // Not Found - Should not happen for POST / but maybe PUT later
                     errorMessage = `Backend endpoint not found (${error.config?.method?.toUpperCase()} ${error.config?.url}). Please check backend routes.`;
                 }
                  else { // Other backend errors
                     const responseData = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
                      errorMessage = `Backend error (${error.response.status}): ${responseData || error.message}`;
                 }
             } else if (error.request) { // No response received
                 console.error('Backend did not respond:', error.request);
                 errorMessage = 'Could not connect to the backend service to start combat.';
             } else { // Axios setup error
                 console.error('Axios setup error:', error.message);
                 errorMessage = `Error configuring request: ${error.message}`;
             }
         } else if (error instanceof Error) { // Non-Axios errors
             errorMessage = error.message;
         }

         try {
             await interaction.editReply({ content: `❌ ${errorMessage}`, ephemeral: true });
         } catch (replyError) {
              console.error("Failed to send error reply:", replyError);
         }
    }
}

// --- module.exports ---
module.exports = {
    data: new SlashCommandBuilder()
        .setName('startcombat')
        .setDescription('Initiates the setup phase for a new combat encounter in this channel.')
        .setDMPermission(false),
    execute: executeStartCombat
};
