// src/handlers/combatHandler.js

// Imports needed (using require)
const { Interaction, StringSelectMenuInteraction, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL;
if (!BACKEND_URL) {
    console.error("FATAL: BACKEND_URL environment variable is not set.");
    process.exit(1);
}

// --- Main Routing Functions (called by index.js) ---

async function handleCombatButton(interaction) { // No type annotation needed for JS
    const customId = interaction.customId;

    // Route based on KNOWN combat prefixes
    if (customId.startsWith('join_combat_')) {
        const sessionId = customId.substring('join_combat_'.length);
        console.log(`[Combat Handler] Routing Button: join_combat_`);
        await handleJoinCombatInteraction(interaction, sessionId);
    } else if (customId.startsWith('add_mob_modal_')) {
        const sessionId = customId.substring('add_mob_modal_'.length);
        console.log(`[Combat Handler] Routing Button: add_mob_modal_`);
        await showAddMobModal(interaction, sessionId);
    } else if (customId.startsWith('start_fight_')) {
        const sessionId = customId.substring('start_fight_'.length);
        console.log(`[Combat Handler] Routing Button: start_fight_`);
        await handleStartFightInteraction(interaction, sessionId);
    } else if (customId.startsWith('cancel_combat_')) {
        const sessionId = customId.substring('cancel_combat_'.length);
        console.log(`[Combat Handler] Routing Button: cancel_combat_`);
        await handleCancelCombatInteraction(interaction, sessionId);
    } else if (customId.startsWith('combat_action_')) {
        console.log(`[Combat Handler] Routing Button: combat_action_`);
        // Handle combat actions later
        await interaction.reply({ content: 'Combat actions not implemented yet.', ephemeral: true }).catch(console.error);
    } else {
        // *** CORRECTED: IGNORE unknown button prefixes ***
        console.log(`[Combat Handler] Ignoring button with unknown prefix: ${customId}`);
        // DO NOT acknowledge here (no deferUpdate)
    }
}

async function handleCombatSelectMenu(interaction) { // No type annotation needed for JS
    const customId = interaction.customId;

    // Route based on KNOWN combat prefixes
    if (customId.startsWith('select_char_join_')) {
        console.log(`[Combat Handler] Routing Select Menu: select_char_join_`);
        await handleCharacterSelectionInteraction(interaction);
    } else {
        // *** CORRECTED: IGNORE unknown select menu prefixes ***
        console.log(`[Combat Handler] Ignoring select menu with unknown prefix: ${customId}`);
        // DO NOT acknowledge here (no deferUpdate)
    }
}

async function handleCombatModalSubmit(interaction) { // No type annotation needed for JS
     const customId = interaction.customId;

     // Route based on KNOWN combat prefixes
     if (customId.startsWith('add_mob_submit_')) {
         const sessionId = customId.substring('add_mob_submit_'.length);
         console.log(`[Combat Handler] Routing Modal Submit: add_mob_submit_`);
         await handleAddMobSubmitInteraction(interaction, sessionId);
     } else {
         // *** CORRECTED: IGNORE unknown modal prefixes ***
         console.log(`[Combat Handler] Ignoring modal with unknown prefix: ${customId}`);
          // DO NOT acknowledge here (no deferUpdate)
     }
}

// --- Specific Handler Function Implementations (Join Combat Flow) ---
// (Paste the implementations for handleJoinCombatInteraction, handleCharacterSelectionInteraction, addCombatantPlayer from the previous response here)
async function handleJoinCombatInteraction(interaction, sessionId) {
    console.log(`Handling Join Combat for session ${sessionId} by user ${interaction.user.id}`);
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;
    try {
        console.log(`Workspaceing characters for discordId ${discordId} via GET ${BACKEND_URL}/player/discord/${discordId}`);
        const response = await axios.get(`${BACKEND_URL}/player/discord/${discordId}`);
        if (response.status === 200 && Array.isArray(response.data)) {
            const characters = response.data;
            if (characters.length === 0) {
                await interaction.editReply({ content: "❌ You don't have any characters registered to join combat with." }); return;
            }
            if (characters.length === 1) {
                const character = characters[0];
                if (!character.stats) { console.error("Character data missing stats:", character); await interaction.editReply({ content: '❌ Character data is missing required stats. Cannot join.'}); return; }
                console.log(`Auto-joining session ${sessionId} with char ID ${character.id}`);
                await addCombatantPlayer(interaction, sessionId, character);
            } else {
                console.log(`Multi-chars for ${discordId}, showing menu for session ${sessionId}.`);
                const options = characters.map(char => {
                    const label = char.name ? char.name.substring(0, 100) : `Character ID ${char.id}`;
                    const description = char.stats ? `HP: ${char.stats.le_current ?? '?'}/${char.stats.le_max ?? '?'} | INI: ${char.stats.initiative ?? '?'}`.substring(0, 100) : 'Stats unavailable';
                    return new StringSelectMenuOptionBuilder().setLabel(label).setValue(String(char.id)).setDescription(description);
                });
                const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_char_join_${sessionId}`).setPlaceholder('Choose character').addOptions(options.slice(0, 25));
                const row = new ActionRowBuilder().addComponents(selectMenu);
                await interaction.editReply({ content: 'Choose character:', components: [row], ephemeral: true });
            }
        } else {
             console.error(`Failed fetch characters for ${discordId}. Status: ${response.status}`, response.data);
             await interaction.editReply({ content: '❌ Could not fetch character list.' });
        }
    } catch (error) { /* ... error handling ... */
        console.error(`Error in handleJoinCombatInteraction for session ${sessionId}, user ${discordId}:`, error);
        let errorMessage = 'An error occurred joining.';
         if (axios.isAxiosError(error) && error.response) errorMessage = `Backend error (${error.response.status}): ${error.response.data?.message || JSON.stringify(error.response.data) || error.message}`;
         else if (error instanceof Error) errorMessage = error.message;
        await interaction.editReply({ content: `❌ ${errorMessage}` }).catch(console.error);
    }
}
async function handleCharacterSelectionInteraction(interaction) {
     const customId = interaction.customId;
     const sessionId = customId.substring('select_char_join_'.length);
     const selectedPlayerId = interaction.values[0];
     await interaction.deferUpdate({ ephemeral: true });
     console.log(`Handling selection session ${sessionId}. User ${interaction.user.id} selected player ${selectedPlayerId}`);
     try {
         console.log(`Workspaceing details for player ${selectedPlayerId} via GET ${BACKEND_URL}/player/${selectedPlayerId}`);
         const response = await axios.get(`${BACKEND_URL}/player/${selectedPlayerId}`);
         if (response.status === 200 && response.data) {
             const character = response.data;
             if (!character.stats) { console.error("Selected char missing stats:", character); await interaction.followUp({ content: '❌ Selected char missing stats.', ephemeral: true }); return; }
             await addCombatantPlayer(interaction, sessionId, character);
         } else {
              console.error(`Failed fetch details for player ${selectedPlayerId}. Status: ${response.status}`, response.data); await interaction.followUp({ content: `❌ Could not fetch char details.`, ephemeral: true });
         }
     } catch (error) { /* ... error handling ... */
         console.error(`Error fetching selected player details (ID: ${selectedPlayerId}):`, error);
         let errorMessage = 'An error occurred selecting char.';
          if (axios.isAxiosError(error) && error.response) errorMessage = `Backend error (${error.response.status}): ${error.response.data?.message || JSON.stringify(error.response.data) || error.message}`;
          else if (error instanceof Error) errorMessage = error.message;
         await interaction.followUp({ content: `❌ ${errorMessage}`, ephemeral: true });
     }
}
async function addCombatantPlayer(interaction, sessionId, player) {
    if (!player || !player.stats) { console.error("addCombatantPlayer invalid player:", player); const m = interaction.deferred||interaction.replied?interaction.followUp.bind(interaction):interaction.editReply.bind(interaction); await m({ content: '❌ Char data invalid.', ephemeral: true, components: [] }); return; }
    const maxHpField = 'le_max'; const currentHpField = 'le_current'; const initBaseField = 'initiative';
    const requiredStats = [maxHpField, currentHpField, initBaseField];
     for (const stat of requiredStats) { if (player.stats[stat] === undefined || player.stats[stat] === null) { console.error(`Player ${player.id} missing stat: ${stat}`); const m=interaction.deferred||interaction.replied?interaction.followUp.bind(interaction):interaction.editReply.bind(interaction); await m({ content: `❌ Missing stat '${stat}'.`, ephemeral: true, components: [] }); return; } }
    try {
        const combatantData = { sessionId, type: 'PLAYER', allegiance: 'PLAYER_SIDE', playerId: player.id, discordUserId: player.discordId, name: player.name, maxHP: player.stats[maxHpField], currentHP: player.stats[currentHpField], initiativeBase: player.stats[initBaseField] };
        console.log(`Attempting POST ${BACKEND_URL}/combatant with data:`, combatantData);
        const response = await axios.post(`${BACKEND_URL}/combatant`, combatantData);
        if (response.status === 201) {
             console.log(`Combatant ${player.name} added to session ${sessionId}.`);
             await interaction.editReply({ content: `✅ Joined as **${player.name}**!`, components: [] }).catch(async (e) => { console.warn("editReply failed, trying followUp:", e); await interaction.followUp({ content: `✅ Joined as **${player.name}**!`, components: [], ephemeral: true }); });
        } else { /* ... handle non-201 success ... */
             console.error(`Failed add combatant. Status: ${response.status}`, response.data); await interaction.editReply({ content: `❌ Failed add: Status ${response.status}.`, components: [] }).catch(async (e) => { await interaction.followUp({ content: `❌ Failed add: Status ${response.status}.`, components: [], ephemeral: true }); });
        }
    } catch (error) { /* ... error handling ... */
         console.error(`Error addCombatantPlayer API call session ${sessionId}, player ${player.id}:`, error); let errorMessage = 'An error occurred adding you.';
         if (axios.isAxiosError(error) && error.response) { if (error.response.status === 409) errorMessage = `Could not join: ${error.response.data?.message || 'Already in combat?'}`; else errorMessage = `Backend error (${error.response.status}): ${error.response.data?.message || JSON.stringify(error.response.data) || 'Unknown'}`; }
         else if (error instanceof Error) errorMessage = error.message;
         await interaction.editReply({ content: `❌ ${errorMessage}`, components: [] }).catch(async (e) => { await interaction.followUp({ content: `❌ ${errorMessage}`, components: [], ephemeral: true }); });
    }
}

// --- Placeholder stubs for other handlers ---
/**
 * Checks permissions and shows the modal for adding a mob.
 */
async function showAddMobModal(interaction, sessionId) {
    console.log(`Showing Add Mob Modal for session ${sessionId} by user ${interaction.user.id}`);

    // No initial defer/reply needed here because showModal() acknowledges.

    try {
        // --- 1. Fetch Session and Verify Permissions/State ---
        let session;
        try {
            console.log(`Workspaceing session ${sessionId} for Add Mob check.`);
            // Note: No need to fetch combatants here, just session info
            const response = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}`);
            if (!response.data) throw new Error(`Backend responded with status ${response.status} but no data.`);
            session = response.data;
        } catch (fetchError) {
            console.error(`Error fetching session ${sessionId} for Add Mob:`, fetchError);
             const errorMsg = (axios.isAxiosError(fetchError) && fetchError.response?.status === 404)
                ? '❌ Combat setup not found.'
                : '❌ Could not fetch combat setup details.';
            // Need to reply if showModal isn't called
            await interaction.reply({ content: errorMsg, ephemeral: true });
            return;
        }

        // Check if user is the DM
        if (session.dmUserId !== interaction.user.id) {
            console.log(`User ${interaction.user.id} attempted to add mob to session ${sessionId} but is not DM.`);
            await interaction.reply({ content: '❌ Only the DM can add mobs.', ephemeral: true });
            return;
        }

        // Check if session is in SETUP state
        if (session.state !== 'SETUP') {
            console.log(`Attempted to add mob to session ${sessionId} but state is ${session.state}.`);
            await interaction.reply({ content: `❌ Cannot add mobs. Combat state: ${session.state}.`, ephemeral: true });
            return;
        }

        // --- 2. Build and Show Modal ---
        const modal = new ModalBuilder()
            .setCustomId(`add_mob_submit_${sessionId}`) // Unique ID for the submission
            .setTitle(`Add Mob to Combat`);

        const mobNameInput = new TextInputBuilder()
            .setCustomId('mobNameInput') // We'll use this ID to get the value on submit
            .setLabel("Mob Template Name")
            .setPlaceholder("Enter exact name (e.g., Goblin, Orc Chieftain)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Optional: Add quantity later?
        // const quantityInput = new TextInputBuilder()...

        const firstActionRow = new ActionRowBuilder().addComponents(mobNameInput);
        // const secondActionRow = new ActionRowBuilder().addComponents(quantityInput);

        modal.addComponents(firstActionRow/*, secondActionRow*/);

        await interaction.showModal(modal);
        // Interaction is acknowledged by showModal()

    } catch (error) {
        console.error(`Error in showAddMobModal for session ${sessionId}:`, error);
        // Try to reply if possible (if showModal failed before acknowledging)
        if (!interaction.replied && !interaction.deferred) {
             await interaction.reply({ content: '❌ Failed to open the Add Mob form.', ephemeral: true }).catch(console.error);
        } else {
             // If already replied/deferred, maybe followUp, but might fail
             await interaction.followUp({ content: '❌ Failed to open the Add Mob form.', ephemeral: true }).catch(console.error);
        }
    }
}
async function handleStartFightInteraction(interaction, sessionId) {
    console.log(`Handling Start Fight for session ${sessionId} by user ${interaction.user.id}`);
    await interaction.reply({ content: `Start Fight (Session: ${sessionId}) - Not implemented yet.`, ephemeral: true });
}
/**
 * Handles the logic when the "Cancel Combat" button is clicked during setup.
 * @param {ButtonInteraction} interaction - The button interaction.
 * @param {string} sessionId - The ID of the combat session to cancel.
 */
async function handleCancelCombatInteraction(interaction, sessionId) {
    console.log(`Handling Cancel Combat for session ${sessionId} by user ${interaction.user.id}`);
    // Acknowledge ephemerally, allows easy follow-ups/edits for status
    await interaction.deferReply({ ephemeral: true });

    try {
        // --- 1. Fetch Session and Verify Permissions/State ---
        let session;
        try {
            console.log(`Workspaceing session ${sessionId} for cancellation check via GET ${BACKEND_URL}/combatSession/${sessionId}`);
            const response = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}`);
            // Check for non-200 status explicitly if needed, axios throws on 4xx/5xx by default
            if (!response.data) {
                // This case might be unlikely if axios throws, but good for robustness
                throw new Error(`Backend responded with status ${response.status} but no data.`);
            }
            session = response.data;
            console.log(`Workspaceed session state: ${session.state}, DM: ${session.dmUserId}`);
        } catch (fetchError) {
            console.error(`Error fetching session ${sessionId} for cancellation:`, fetchError);
             if (axios.isAxiosError(fetchError) && fetchError.response?.status === 404) {
                 // Session not found, maybe already cancelled/deleted
                 return interaction.editReply({ content: '❌ Combat setup not found (perhaps already cancelled or started?).' });
             }
             // Other fetch errors
            return interaction.editReply({ content: '❌ Could not fetch combat setup details from the backend.' });
        }

        // Check if user clicking is the DM stored on the session
        if (session.dmUserId !== interaction.user.id) {
            console.log(`User ${interaction.user.id} attempted to cancel session ${sessionId} but is not DM (${session.dmUserId}).`);
            return interaction.editReply({ content: '❌ Only the user who started the setup can cancel it.' });
        }

        // Check if session is still in SETUP state
        if (session.state !== 'SETUP') { // Use the exact string value for your SETUP state
            console.log(`Attempted to cancel session ${sessionId} but state is ${session.state}, not SETUP.`);
            return interaction.editReply({ content: `❌ Cannot cancel combat setup. Current state: ${session.state}.` });
        }

        // --- 2. API Call: Delete Session ---
        try {
            console.log(`Attempting to delete session ${sessionId} via DELETE ${BACKEND_URL}/combatSession/${sessionId}`);
            // DELETE request - response data might be minimal or empty on success
            const deleteResponse = await axios.delete(`${BACKEND_URL}/combatSession/${sessionId}`);

            // Axios typically considers 2xx successful. 204 No Content is common for DELETE.
            if (deleteResponse.status === 200 || deleteResponse.status === 204) {
                console.log(`Session ${sessionId} deleted successfully via API.`);

                // --- 3. Edit Original Discord Message ---
                if (session.messageId) { // Only proceed if we have a messageId stored
                    try {
                        // Fetch the original setup message using the stored ID
                        const originalMessage = await interaction.channel.messages.fetch(session.messageId);
                        if (originalMessage) {
                            await originalMessage.edit({
                                content: `*Combat setup initiated by <@${session.dmUserId}> was cancelled.*`, // Mention DM maybe?
                                embeds: [], // Remove embed
                                components: [] // Remove buttons
                            });
                            console.log(`Original setup message ${session.messageId} edited successfully.`);
                        } else {
                             console.warn(`Original message ${session.messageId} not found for session ${sessionId}.`);
                        }
                    } catch (msgError) {
                         // Common error: 10008 Unknown Message if message was deleted manually
                         if (msgError.code === 10008) {
                              console.warn(`Original message ${session.messageId} was likely deleted before cancellation edit.`);
                         } else {
                              console.error(`Failed to edit original message ${session.messageId} after cancelling session ${sessionId}:`, msgError);
                         }
                         // Notify DM that message cleanup failed but session was deleted
                         await interaction.followUp({ content: '⚠️ Session deleted, but failed to update the original setup message (it might have been deleted manually).', ephemeral: true }).catch(console.error);
                    }
                } else {
                     console.warn(`No messageId stored for session ${sessionId}, cannot edit original message.`);
                }


                // --- 4. Optional: Update In-Memory State ---
                // if (interaction.client.activeCombatSetups?.delete(session.channelId)) {
                //     console.log(`Removed session ${sessionId} from in-memory map for channel ${session.channelId}`);
                // }

                // --- 5. Send Confirmation ---
                await interaction.editReply({ content: '✅ Combat setup cancelled successfully.' });

            } else {
                 // Should be caught by Axios error handling, but just in case
                 console.error(`Unexpected success status ${deleteResponse.status} when deleting session ${sessionId}.`);
                 await interaction.editReply({ content: `❌ Failed to cancel setup. Backend responded unexpectedly (Status: ${deleteResponse.status}).` });
            }

        } catch (deleteError) { // Catch errors during the DELETE API call
            console.error(`Error calling DELETE /combatSession/${sessionId}:`, deleteError);
             let errorMsg = 'An error occurred trying to delete the combat setup on the backend.';
              if (axios.isAxiosError(deleteError) && deleteError.response) {
                    // Provide more specific backend error if available
                    errorMsg = `Backend error (${deleteError.response.status}): ${deleteError.response.data?.message || deleteError.response.data || 'Failed to delete session.'}`;
                     // Special case: If backend already deleted it (404)
                     if (deleteError.response.status === 404) {
                          errorMsg = 'Combat setup seems to have already been deleted or not found on backend.';
                          // Consider still trying to edit the message? Or just report this error.
                     }
              } else if (deleteError instanceof Error) {
                   errorMsg = deleteError.message;
              }
             await interaction.editReply({ content: `❌ ${errorMsg}` });
        }

    } catch (error) { // Catch errors from initial deferReply or outer logic/validation
        console.error(`Unhandled error in handleCancelCombatInteraction for session ${sessionId}:`, error);
        // Ensure the deferred reply is handled
        if (!interaction.replied && !interaction.deferred) {
            // This path shouldn't be reached if deferReply succeeded, but for safety:
            await interaction.reply({ content: 'An unexpected error occurred.', ephemeral: true }).catch(console.error);
        } else {
             await interaction.editReply({ content: 'An unexpected error occurred while processing cancellation.' }).catch(console.error);
        }
    }
}
/**
 * Handles the submission of the "Add Mob" modal.
 */
async function handleAddMobSubmitInteraction(interaction, sessionId) {
    // Acknowledge modal quickly - Ephemeral defer is good
    await interaction.deferReply({ ephemeral: true });

    const requestedMobName = interaction.fields.getTextInputValue('mobNameInput');
    // const quantity = parseInt(interaction.fields.getTextInputValue('quantityInput') || '1'); // Example if quantity added

    console.log(`Handling Add Mob Submit for session ${sessionId}. Mob name: "${requestedMobName}"`);

    try {
       // --- 1. Fetch Mob Template from Backend ---
       let mobTemplate;
       try {
           // URL encode the name in case it has spaces or special characters
           const encodedName = encodeURIComponent(requestedMobName);
           console.log(`Workspaceing mob template via GET ${BACKEND_URL}/mob/name/${encodedName}`);
           const response = await axios.get(`${BACKEND_URL}/mob/name/${encodedName}`);
           if (!response.data) throw new Error(`Backend responded with status ${response.status} but no data.`);
           mobTemplate = response.data;
           console.log(`Found mob template ID: ${mobTemplate.id}`);
       } catch (fetchError) {
            console.error(`Error fetching mob template "${requestedMobName}":`, fetchError);
             if (axios.isAxiosError(fetchError) && fetchError.response?.status === 404) {
                 return interaction.editReply({ content: `❌ Mob template named "${requestedMobName}" not found. Use \`/listmobs\` or ensure exact spelling.` });
             }
            return interaction.editReply({ content: '❌ Could not fetch mob template details from the backend.' });
       }

       // --- 2. Prepare Combatant Data ---
       // Validate required fields from template
       const requiredFields = ['id', 'name', 'baseMaxHP', 'baseInitiative']; // Add AT, PA, RS, TP if needed immediately by backend create? No, combatant entity only needs base stats now.
       for (const field of requiredFields) {
            if (mobTemplate[field] === undefined || mobTemplate[field] === null) {
                 console.error(`Mob template "${requestedMobName}" (ID: ${mobTemplate.id}) is missing required field: ${field}`);
                 return interaction.editReply({ content: `❌ Mob template "${requestedMobName}" is incomplete (missing ${field}). Cannot add.` });
            }
       }

       const combatantData = {
           sessionId: sessionId,
           type: 'NPC', // CombatantType.NPC
           allegiance: 'HOSTILE', // CombatantAllegiance.HOSTILE - Assuming mobs are hostile by default
           mobDefinitionId: mobTemplate.id, // Link to the template
           playerId: null,
           discordUserId: null,
           name: mobTemplate.name, // Use name from template
           maxHP: mobTemplate.baseMaxHP, // Copy base stats at creation
           currentHP: mobTemplate.baseMaxHP, // Start at full HP
           initiativeBase: mobTemplate.baseInitiative // Copy base initiative
           // AT, PA, RS, TP will be fetched from Mob definition during combat resolution
       };

       // --- 3. API Call POST /combatant ---
       console.log(`Attempting POST ${BACKEND_URL}/combatant with NPC data:`, combatantData);
       const response = await axios.post(`${BACKEND_URL}/combatant`, combatantData);

       if (response.status === 201) {
           console.log(`NPC Combatant ${mobTemplate.name} added successfully to session ${sessionId}.`);
           await interaction.editReply({ content: `✅ Added **${mobTemplate.name}** to the combat setup!` });

           // TODO: Update participant list on original setup message (Advanced)

       } else {
           console.error(`Failed to add NPC combatant. Backend responded with status: ${response.status}`, response.data);
           await interaction.editReply({ content: `❌ Failed to add mob. Backend responded with status ${response.status}.` });
       }

    } catch(error) {
        console.error(`Error in handleAddMobSubmitInteraction for session ${sessionId}:`, error);
        let errorMessage = 'An error occurred while adding the mob.';
         if (axios.isAxiosError(error) && error.response) {
              errorMessage = `Backend error (${error.response.status}): ${error.response.data?.message || JSON.stringify(error.response.data) || error.message}`;
         } else if (error instanceof Error) {
              errorMessage = error.message;
         }
        // Ensure the deferred reply is edited
        await interaction.editReply({ content: `❌ ${errorMessage}` }).catch(console.error);
    }
}

// --- Export the main handlers needed by index.js ---
module.exports = {
    handleCombatButton,
    handleCombatSelectMenu,
    handleCombatModalSubmit
};