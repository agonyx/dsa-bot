// src/handlers/combatHandler.js -- CORRECTED

const { Interaction, StringSelectMenuInteraction, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonStyle } = require('discord.js');
const { createSetupEmbed, createSetupActionRows } = require('../utils/combatComponents'); 
const axios = require('axios');
const { ButtonBuilder } = require('@discordjs/builders');
const { resolveAttack, parseAndRollDamage, applySoak, resolveDefense, rollDice } = require('../utils/combatUtils');
resolveAttack
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL;
if (!BACKEND_URL) {
    console.error("FATAL: BACKEND_URL environment variable is not set.");
    process.exit(1);
}


// --- Main Routing Functions (called by index.js) ---
async function handleCombatButton(interaction) {
    const customId = interaction.customId;
    console.log(`[Combat Handler] Button: ${customId}`);

    // Route based on prefix
    if (customId.startsWith('join_combat_')) {
        const sessionId = customId.substring('join_combat_'.length);
        await handleJoinCombatInteraction(interaction, sessionId);
    } else if (customId.startsWith('add_mob_modal_')) {
        const sessionId = customId.substring('add_mob_modal_'.length);
        await showAddMobModal(interaction, sessionId);
    } else if (customId.startsWith('start_fight_')) {
        const sessionId = customId.substring('start_fight_'.length);
        await handleStartFightInteraction(interaction, sessionId);
    } else if (customId.startsWith('cancel_combat_')) {
        const sessionId = customId.substring('cancel_combat_'.length);
        await handleCancelCombatInteraction(interaction, sessionId);
    } else if (customId.startsWith('leave_setup_')) { // Route for leave button
        const sessionId = customId.substring('leave_setup_'.length);
        await handleLeaveSetupInteraction(interaction, sessionId);
    }else if (customId.startsWith('manage_participants_')) {
        const sessionId = customId.substring('manage_participants_'.length);
        console.log(`[Combat Handler] Routing -> Manage Participants`);
        // Ensure you have the handleManageParticipantsInteraction function defined in this file
        await handleManageParticipantsInteraction(interaction, sessionId);
    } else if (customId.startsWith('combat_action_attack_')) {
        // Format: combat_action_attack_{sessionId}_{actorCombatantId}
        const parts = customId.split('_');
        if (parts.length === 5) { // Ensure correct format
            const sessionId = parts[3];
            const actorId = parts[4];
            console.log(`[Combat Handler] Routing -> Attack Action (Session: ${sessionId}, Actor: ${actorId})`);
            await handleCombatActionAttack(interaction, sessionId, actorId); // Call the new handler
        } else {
             console.error(`[Combat Handler] Invalid attack button customId format: ${customId}`);
             await interaction.reply({ content: "Error: Invalid action button data.", ephemeral: true }).catch(console.error);
        }
    }else if (customId.startsWith('caa_')) { // Combat Action Attack
        const parts = customId.split('_');
        if (parts.length === 3) { const sessionId = parts[1]; const actorId = parts[2]; await handleCombatActionAttack(interaction, sessionId, actorId); }
        else { console.error("Invalid caa button ID"); /* handle error */ }
    }
    else if (customId.startsWith('cad_')) { /* ... Handle Defend ... */ await interaction.reply({content:'Defend WIP', ephemeral: true});}
    else if (customId.startsWith('cas_')) { /* ... Handle Skill ... */ await interaction.reply({content:'Skill WIP', ephemeral: true});}
    else if (customId.startsWith('cet_')) { /* ... Handle End Turn ... */ await interaction.reply({content:'End Turn WIP', ephemeral: true});}
     else if (customId.startsWith('combat_action_')) {
        await interaction.reply({ content: 'Combat actions not implemented yet.', ephemeral: true }).catch(console.error);
    }
     else {
        console.log(`[Combat Handler] Ignoring button with unknown prefix: ${customId}`);
        // Do not acknowledge here
    }
}
/**
 * Handles the click on the "Attack" action button during combat.
 * Verifies turn, then shows target selection menu. (Simplified Option Creation)
 * @param {ButtonInteraction} interaction - The button interaction.
 * @param {string} sessionId - The combat session ID.
 * @param {string} actorId - The combatant ID of the character initiating the attack.
 */
async function handleCombatActionAttack(interaction, sessionId, actorId) {
    console.log(`[Attack Action ${sessionId}] Handling for Actor ${actorId} by User ${interaction.user.id}`);
    // Defer ephemerally - we will reply with the target menu or an error
    // Use deferReply here because errors need an immediate reply context
    await interaction.deferReply({ ephemeral: true });

    try {
        // --- 1. Get Current Combat State from Memory ---
        if (!interaction.client.activeCombats) { return interaction.editReply({ content: '❌ Error: Combat state map missing!' }); }
        const sessionData = interaction.client.activeCombats.get(interaction.channelId);
        if (!sessionData || sessionData.id !== sessionId) { return interaction.editReply({ content: '❌ Error: Could not find active combat data.' }); }
        if (sessionData.state !== 'RUNNING') { return interaction.editReply({ content: `❌ Cannot attack: Combat is not running.` }); }
        if (!sessionData.turnOrder || sessionData.turnOrder.length === 0 || sessionData.currentTurnIndex === undefined) { return interaction.editReply({ content: `❌ Cannot attack: Turn order issue.` }); }

        // --- 2. Verify State and Turn ---
        const activeCombatantId = sessionData.turnOrder[sessionData.currentTurnIndex];
        const actorCombatant = sessionData.combatants?.find(c => c.id === actorId);
        if (!actorCombatant) { return interaction.editReply({ content: `❌ Error: Cannot find your combatant data.` }); }
        if (actorId !== activeCombatantId) { const active = sessionData.combatants?.find(c=>c.id===activeCombatantId); return interaction.editReply({ content: `❌ It's not your turn! It's **${active?.name || 'Unknown'}**'s turn.` }); }
        if (actorCombatant.type === 'PLAYER' && actorCombatant.discordUserId !== interaction.user.id) { return interaction.editReply({ content: `❌ You cannot control **${actorCombatant.name}**.` }); }

        // --- 3. Find Valid Targets ---
        const potentialTargets = sessionData.combatants?.filter(c => c.id !== actorId && c.currentHP > 0 && c.allegiance !== actorCombatant.allegiance );
        if (!potentialTargets || potentialTargets.length === 0) { return interaction.editReply({ content: 'ℹ️ No valid targets available to attack!' }); }

        // --- 4. Build Target Selection Menu (Simplified Options) ---
        const targetOptions = potentialTargets.map(target => {
            // Create label (ensure it's within 100 chars)
            const label = `${target.name} (${target.currentHP}/${target.maxHP} HP)`.substring(0, 100);
            // *** Use Builder with ONLY Label and Value ***
            return new StringSelectMenuOptionBuilder()
                .setLabel(label)
                .setValue(target.id); // Target combatant UUID
        });

        const targetSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`ctsa_${sessionId}_${actorId}`) // Use shortened ID
            .setPlaceholder('Choose a target to attack...')
            .addOptions(targetOptions.slice(0, 25)); // Add the array of builders

        const row = new ActionRowBuilder().addComponents(targetSelectMenu); // Type needed for TS, not JS

        // --- 5. Reply with the Menu ---
        await interaction.editReply({
            content: `**${actorCombatant.name}'s Turn:** Choose a target to attack!`,
            components: [row],
            ephemeral: true
        });
        console.log(`[Attack Action ${sessionId}] Presented target selection to Actor ${actorId}`);

    } catch (error) {
        console.error(`[Attack Action ${sessionId}] Error for Actor ${actorId}:`, error);
        if (!interaction.replied && !interaction.deferred) { await interaction.reply({ content: '❌ Error preparing attack.', ephemeral: true}).catch(console.error); }
        else { await interaction.editReply({ content: '❌ An error occurred while preparing your attack action.', components: [], embeds: [] }).catch(console.error); }
    }
}

async function handleCombatSelectMenu(interaction) {
    const customId = interaction.customId;
    console.log(`[Combat Handler] Select Menu Received: ${customId}`); // Consistent log message

    // Check for Combat Target Selection (Attack) using the NEW prefix
    if (customId.startsWith('ctsa_')) { // *** FIX: Check for 'ctsa_' prefix ***
        // Format: ctsa_{sessionId}_{actorId}
        const parts = customId.split('_');
        // *** FIX: Check for 3 parts and correct indices ***
        if (parts.length === 3) {
            const sessionId = parts[1]; // Index 1 is sessionId
            const actorId = parts[2];   // Index 2 is actorId
            console.log(`[Combat Handler] Routing -> Attack Target Select (Session: ${sessionId}, Actor: ${actorId})`);
            // Ensure handleCombatTargetSelectAttack function exists and is implemented
            await handleCombatTargetSelectAttack(interaction, sessionId, actorId);
        } else {
            // Log error and try to update the interaction to prevent "Interaction Failed"
            console.error(`Invalid ctsa_ customId format: ${customId}`);
            await interaction.update({ content: 'Error: Invalid target selection data format.', components: [], ephemeral: true }).catch(console.error);
        }
    }
    // Check for Remove Participant selection
    else if (customId.startsWith('remove_participant_select_')) {
        const sessionId = customId.substring('remove_participant_select_'.length);
        console.log(`[Combat Handler] Routing -> Remove Participant Select`);
        await handleRemoveParticipantSelectInteraction(interaction, sessionId); // Assumes this exists
    }
    // Ignore other / legacy select menus
    else {
        console.log(`[Combat Handler] Ignoring select menu with unknown prefix: ${customId}`);
        // DO NOT acknowledge here - let command-specific handlers manage if needed
    }
}
/**
 * Creates Action Row with buttons for the DM to control an NPC's turn.
 * @param {string} sessionId - The combat session ID.
 * @param {string} npcActorId - The combatant ID of the NPC whose turn it is.
 * @returns {ActionRowBuilder}
 */
function createNpcDmActionRow(sessionId, npcActorId) {
    const npcAttackButton = new ButtonBuilder()
        // Use a distinct prefix for DM controlling NPC actions
        .setCustomId(`dmnpc_action_attack_${sessionId}_${npcActorId}`)
        .setLabel("NPC Attack") // Clearly label it as NPC action
        .setStyle(ButtonStyle.Danger)
        .setEmoji({ name: "⚔️" });

    const npcDefendButton = new ButtonBuilder()
        .setCustomId(`dmnpc_action_defend_${sessionId}_${npcActorId}`)
        .setLabel("NPC Defend")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ name: "🛡️" });

    const npcSkillButton = new ButtonBuilder()
        .setCustomId(`dmnpc_action_skill_${sessionId}_${npcActorId}`)
        .setLabel("NPC Skill/Action")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ name: "✨" });
        // .setDisabled(true); // Example

    const npcEndTurnButton = new ButtonBuilder()
        .setCustomId(`dmnpc_action_endturn_${sessionId}_${npcActorId}`)
        .setLabel("NPC End Turn")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ name: "⏩" });

    return new ActionRowBuilder().addComponents(npcAttackButton, npcDefendButton, npcSkillButton, npcEndTurnButton);
}
/**
 * Handles the target selection for an attack action.
 * Resolves the attack (including defense/soak), updates state, updates display.
 * @param {StringSelectMenuInteraction} interaction - The select menu interaction.
 * @param {string} sessionId - The combat session ID.
 * @param {string} actorId - The combatant ID of the attacker.
 */
// In handlers/combatHandler.js

// (Ensure requires/imports/helpers like getEffectiveCombatStats, resolveAttack, resolveDefense, applySoak, addLogEntry, updateCombatDisplay are present)

async function handleCombatTargetSelectAttack(interaction, sessionId, actorId) {
    await interaction.deferUpdate({ ephemeral: true });
    const targetId = interaction.values[0];
    console.log(`[Combat Attack ${sessionId}] Actor ${actorId} selected Target ${targetId}`);

    if (!interaction.client.activeCombats?.has(interaction.channelId)) { return interaction.followUp({ content: '❌ Error: Active combat data not found!', ephemeral: true }); }
    const sessionData = interaction.client.activeCombats.get(interaction.channelId);
    if (!sessionData || sessionData.id !== sessionId || sessionData.state !== 'RUNNING') { return interaction.followUp({ content: '❌ Error: Combat is not active or session mismatch.', ephemeral: true }); }

    const attacker = sessionData.combatants.find(c => c.id === actorId);
    const target = sessionData.combatants.find(c => c.id === targetId);
    const activeCombatantId = sessionData.turnOrder[sessionData.currentTurnIndex];
    // Basic validation
    if (actorId !== activeCombatantId) { return interaction.followUp({ content: `❌ It's not your turn!`, ephemeral: true }); }
    if (attacker?.type === 'PLAYER' && attacker.discordUserId !== interaction.user.id) { return interaction.followUp({ content: `❌ Not your character.`, ephemeral: true }); }
    if (!attacker || !target) { return interaction.followUp({ content: `❌ Attacker/Target data missing.`, ephemeral: true }); }
    if (target.currentHP <= 0) { return interaction.followUp({ content: `❌ ${target.name} is already defeated!`, ephemeral: true }); }
    if (attacker.allegiance === target.allegiance) { return interaction.followUp({ content: `❌ Cannot attack own side.`, ephemeral: true }); }

    try {
        console.log(`[Combat Attack ${sessionId}] Resolving: ${attacker.name} vs ${target.name}`);
        const logSummaryParts = []; // Build a summary log entry
        let finalDamage = 0;
        let hitConnected = false;

        // --- Step 1: Get Effective Stats (USING PLACEHOLDER) ---
        const attackerStats = await getEffectiveCombatStats(attacker);
        const targetStats = await getEffectiveCombatStats(target);
        console.log(`  Stats | Attacker AT:${attackerStats.currentAT} TP:${attackerStats.currentTP} | Target PA:${targetStats.currentPA} RS:${targetStats.currentRS}`);
        if (attackerStats.currentAT === undefined || !attackerStats.currentTP || targetStats.currentPA === undefined || targetStats.currentRS === undefined) {
             throw new Error(`Missing effective combat stats.`);
        }

        // --- Step 2: Resolve Attack Roll ---
        const attackResult = resolveAttack(attackerStats.currentAT);
        logSummaryParts.push(`${attacker.name} attacks ${target.name}. (Roll: ${attackResult.roll}/${attackerStats.currentAT})`);
        if (attackResult.confirmRoll !== null) { logSummaryParts.push(`(Confirm: ${attackResult.confirmRoll})`); }

        // --- Step 3: Process Outcome ---
        switch (attackResult.outcome) {
            case 'BOTCH':
                logSummaryParts.push(`-> **BOTCH!**`); break;
            case 'NORMAL_MISS':
                 if (attackResult.roll === 20) logSummaryParts.push(`-> Botch Averted.`);
                 logSummaryParts.push(`-> **Miss!**`); break;
            case 'CRITICAL_SUCCESS':
            case 'NORMAL_HIT':
                 if (attackResult.roll === 1 && attackResult.outcome === 'NORMAL_HIT') { logSummaryParts.push(`-> Crit Failed.`); }
                 else if (attackResult.outcome === 'CRITICAL_SUCCESS'){ logSummaryParts.push(`-> **CRITICAL HIT!**`); }
                 else { logSummaryParts.push(`-> Hit!`); }
                 hitConnected = true; // Assume hit connects unless parried

                 // Resolve Defense
                 const defenseResult = resolveDefense(targetStats.currentPA);
                 logSummaryParts.push(`| ${target.name} Parry: ${defenseResult.roll}/${targetStats.currentPA}.`);
                 if (defenseResult.success) { logSummaryParts.push(`**Parried!**`); hitConnected = false; }
                 else { logSummaryParts.push(`Parry Failed.`); /* Proceed to damage */ }
                break;
        }

        // --- Step 3b/c: Calculate Damage/Soak & Update HP (only if hit connected) ---
        if (hitConnected) {
             let rolledDamage = 0;
             try { rolledDamage = parseAndRollDamage(attackerStats.currentTP); } catch(e) { console.error(e); }
             if (attackResult.outcome === 'CRITICAL_SUCCESS') rolledDamage *= 2;
             finalDamage = applySoak(rolledDamage, targetStats.currentRS);
             logSummaryParts.push(`| ${rolledDamage} TP - ${targetStats.currentRS} RS = **${finalDamage} DMG!**`);

             const newHP = Math.max(0, target.currentHP - finalDamage);
             if (newHP !== target.currentHP) {
                 try { await axios.put(`${BACKEND_URL}/combatant/${target.id}`, { currentHP: newHP }); target.currentHP = newHP; logSummaryParts.push(`| ${target.name} HP: ${newHP}/${target.maxHP}.`); if(newHP <= 0) { logSummaryParts.push(`**Defeated!**`); } }
                 catch(e) { console.error("HP Update Fail:", e); logSummaryParts.push("(HP Update ERR!)"); }
             } else { logSummaryParts.push("No damage taken."); }
        }

        // --- Step 4: Update Combat Log ---
        const finalLogEntry = logSummaryParts.join(' ');
        await addLogEntry(interaction.client, interaction.channelId, sessionId, finalLogEntry);

        // --- Step 5: Update Display ---
        // Removed the debug logs before this call
        await updateCombatDisplay(interaction.client, interaction.channelId);

        // --- Step 6: NO Ephemeral Feedback ---

        console.log(`[Combat Attack ${sessionId}] Action resolved for ${actorId}. Turn NOT advanced.`);

    } catch (error) { // Catch errors during action resolution
        console.error(`[Combat Attack ${sessionId}] Error resolving attack by ${actorId} on ${targetId}:`, error);
        await interaction.followUp({ content: '❌ An error occurred while resolving the attack.', ephemeral: true });
    }
}


/**
 * Adds a log entry to the in-memory state and (eventually) sends it to the backend.
 * Includes logging direct from map after modification attempt.
 * @param {Client} client - The Discord client instance.
 * @param {string} channelId - The channel ID where combat is active.
 * @param {string} sessionId - The combat session ID.
 * @param {string} entry - The log message string.
 */
async function addLogEntry(client, channelId, sessionId, entry) {
    const functionName = `[Log ${sessionId}]`;
    console.log(`${functionName} ADDING: "${entry}" for Channel ${channelId}`); // Log entry

    if (!client.activeCombats) {
         console.warn(`${functionName} client.activeCombats map missing.`);
         return;
    }
    if (!client.activeCombats.has(channelId)) {
         console.warn(`${functionName} No active combat in map for channel ${channelId}.`);
         return;
    }

    // Get the object reference from the Map
    const sessionDataRef = client.activeCombats.get(channelId);

    // Validate the retrieved object
    if (!sessionDataRef || typeof sessionDataRef !== 'object' || sessionDataRef.id !== sessionId) {
        console.warn(`${functionName} Session data in map invalid/mismatch for channel ${channelId}.`);
        return;
    }

    // Ensure combatLog array exists and is an array
    if (!sessionDataRef.combatLog || !Array.isArray(sessionDataRef.combatLog)) {
        sessionDataRef.combatLog = [];
        console.log(`${functionName} Initialized in-memory combatLog array.`);
    }

    // --- Modify the array directly on the object reference ---
    try {
        sessionDataRef.combatLog.push(entry); // Attempt push
        console.log(`${functionName} Pushed entry. Temp array length: ${sessionDataRef.combatLog.length}`);
    } catch (pushError) {
         console.error(`${functionName} Error during combatLog.push:`, pushError);
         return; // Stop if push itself fails
    }
    // --- End modification ---

    // Trim log
    const MAX_LOG_LENGTH = 20;
    if(sessionDataRef.combatLog.length > MAX_LOG_LENGTH) {
         sessionDataRef.combatLog = sessionDataRef.combatLog.slice(-MAX_LOG_LENGTH);
         console.log(`${functionName} Log trimmed to ${MAX_LOG_LENGTH} entries.`);
    }

    // --- Re-fetch from map and Log state AFTER push attempt ---
    // This confirms if the object IN THE MAP was actually modified
    const updatedSessionInMap = client.activeCombats.get(channelId);
    if (updatedSessionInMap && updatedSessionInMap.combatLog && Array.isArray(updatedSessionInMap.combatLog)) {
        console.log(`${functionName} === VERIFY MAP AFTER PUSH ===`);
        console.log(`${functionName} Map log length: ${updatedSessionInMap.combatLog.length}`);
        console.log(`${functionName} Map last 5 entries:`, updatedSessionInMap.combatLog.slice(-5));
        console.log(`${functionName} ============================`);
    } else {
        console.error(`${functionName} AFTER PUSH - Failed to re-fetch session or valid log array from map!`);
    }

    // TODO: Backend API call to persist the log entry...
    // console.warn(`addLogEntry needs backend API call!`);
}


async function getEffectiveCombatStats(combatant) {
    console.warn(`getEffectiveCombatStats for ${combatant.name} not fully implemented! Using placeholders.`);
    // Placeholder: In reality, fetch Player+Weapon/Stats API or Mob API data here
    if (combatant.type === 'PLAYER') {
        // Example: Fetch player data, find equipped weapon AT/TP, get PA/RS from stats/items
         // const playerResponse = await axios.get(`${BACKEND_URL}/player/${combatant.playerId}?relations=weapons,stats,items`);
         // const player = playerResponse.data;
         // const weapon = player.weapons.find(w => w.isEquipped...);
         // const shield = player.items.find(i => i.isEquipped && i.type === 'SHIELD'); // Assuming items have type/isEquipped
         // const armor = player.items.find(i => i.isEquipped && i.type === 'ARMOR');
         return { currentAT: 12, currentPA: 6, currentRS: 2, currentTP: '1w6+4' }; // HARDCODED PLACEHOLDERS
    } else if (combatant.type === 'NPC') {
         // Example: Fetch mob definition data
         // const mobResponse = await axios.get(`${BACKEND_URL}/mob/id/${combatant.mobDefinitionId}`);
         // const mob = mobResponse.data;
         // return { currentAT: mob.baseAttackValue, currentPA: mob.baseParryValue, currentRS: mob.baseArmorSoak, currentTP: mob.baseDamageTP };
         return { currentAT: 10, currentPA: 5, currentRS: 1, currentTP: '1w6+2' }; // HARDCODED PLACEHOLDERS
    }
    return { currentAT: 0, currentPA: 0, currentRS: 0, currentTP: '1w6' }; // Default fallback
}




async function nextTurn(client, channelId) {
     console.warn(`nextTurn not fully implemented!`);
     // TODO:
     // 1. Get session from client.activeCombats using channelId
     // 2. If !session or state !== RUNNING, return.
     // 3. Find current actor, set isActiveTurn = false (in memory & API PUT /combatant/:id)
     // 4. Increment currentTurnIndex (with wrap around using modulo session.turnOrder.length)
     // 5. Find new actor, set isActiveTurn = true (in memory & API PUT /combatant/:id)
     // 6. Update session currentTurnIndex in memory (and API PUT /combatSession/:id ?) - maybe save full state less often?
     // 7. Check for win/loss conditions?
     // 8. Potentially call updateCombatDisplay implicitly here or return session state?
     // For now, just log.
     const sessionData = client.activeCombats?.get(channelId);
     if(sessionData?.turnOrder?.length > 0){
          sessionData.currentTurnIndex = (sessionData.currentTurnIndex + 1) % sessionData.turnOrder.length;
          console.log(`Advanced turn for session ${sessionData.id}. New index: ${sessionData.currentTurnIndex}`);
          // In real implementation, save this index change to backend too.
     }

}

/**
 * Fetches the latest combat state from the in-memory map for the channel
 * and updates the main combat Discord message (embed and action buttons).
 * @param {Client} client - The Discord client instance (to access activeCombats).
 * @param {string} channelId - The ID of the channel where combat is happening.
 */
/**
 * Fetches the latest combat state from the in-memory map for the channel
 * and updates the main combat Discord message (embed and action buttons).
 * @param {Client} client - The Discord client instance (to access activeCombats).
 * @param {string} channelId - The ID of the channel where combat is happening.
 */
async function updateCombatDisplay(client, channelId) {
    const functionName = `[Display Update ${channelId}]`;
    console.log(`${functionName} Attempting update.`);

    // 1. Get State from Memory
    if (!client.activeCombats?.has(channelId)) {
        console.error(`${functionName} No active combat found in memory map.`);
        return;
    }
    const sessionData = client.activeCombats.get(channelId);
    if (!sessionData || !sessionData.id || !sessionData.state || !sessionData.messageId) {
        console.error(`${functionName} Session data in map is invalid/missing fields.`, sessionData);
        client.activeCombats.delete(channelId);
        return;
    }
    const sessionId = sessionData.id;

    console.log(`${functionName} Updating for Session ${sessionId}. State: ${sessionData.state}, Turn Index: ${sessionData.currentTurnIndex}`);

    try {
        // 2. Fetch Channel & Message Objects
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased()) {
            console.error(`${functionName} Channel ${channelId} invalid. Removing session.`);
            client.activeCombats.delete(channelId);
            return;
        }
        const message = await channel.messages.fetch(sessionData.messageId).catch(() => null);
        if (!message) {
            console.warn(`${functionName} Message ${sessionData.messageId} not found. Removing session.`);
            client.activeCombats.delete(channelId);
            return;
        }

        // 3. Build Embed using latest sessionData from memory
        const combatEmbed = createCombatEmbed(sessionData); // Use helper

        // 4. Determine Current Actor & Build Action Row(s)
        let actionRows = [];
        if (sessionData.state === 'RUNNING' && Array.isArray(sessionData.turnOrder) && sessionData.turnOrder.length > sessionData.currentTurnIndex && sessionData.currentTurnIndex >= 0) {
            const activeCombatantId = sessionData.turnOrder[sessionData.currentTurnIndex];
            const activeCombatant = sessionData.combatants?.find(c => c.id === activeCombatantId);

            if (activeCombatant) {
                if (activeCombatant.currentHP > 0) { // Only show actions if not defeated
                    console.log(`${functionName} Current turn: ${activeCombatant.name} (Type: ${activeCombatant.type})`);
                    if (activeCombatant.type === 'PLAYER') {
                        actionRows = [createPlayerActionRow(sessionId, activeCombatantId)]; // Use helper
                    } else if (activeCombatant.type === 'NPC') {
                        actionRows = [createNpcDmActionRow(sessionId, activeCombatantId)]; // Use helper
                    }
                } else {
                     console.log(`${functionName} Current turn combatant ${activeCombatant.name} is defeated.`);
                     // No actions displayed, turn should advance via nextTurn logic soon
                }
            } else {
                 console.error(`${functionName} Active combatant ID ${activeCombatantId} not found!`);
                 combatEmbed.addFields({ name: "⚠️ Turn Error", value: "Combatant data missing!", inline: false });
            }
        } else if (sessionData.state === 'ENDED') {
             console.log(`${functionName} Combat ended state.`);
             // Optionally adjust embed further for ended state
             if (!combatEmbed.data.footer?.text?.startsWith('Combat Ended')) { // Avoid duplicate footers
                combatEmbed.setFooter({ text: `Combat Ended | Session ID: ${sessionId.substring(0, 8)}...` });
             }
        }
        // For SETUP state or invalid turn index, actionRows remains []

        // 5. Edit Message
        console.log(`${functionName} Editing message ${sessionData.messageId}`);
        await message.edit({
            content: ' ', // Clear previous content
            embeds: [combatEmbed],
            components: actionRows // Set components (can be empty array)
        });
        console.log(`${functionName} Message edit successful.`);

    } catch (error) {
        console.error(`${functionName} Failed to update display:`, error);
        if (error.code === 10008) { // Unknown Message
            console.warn(`${functionName} Original message ${sessionData.messageId} deleted. Removing from active combats.`);
            client.activeCombats.delete(channelId);
        } else if (error.code === 50013) { // Missing Permissions
             console.error(`${functionName} Bot lacks permissions for message ${sessionData.messageId} in channel ${channelId}.`);
             // TODO: Notify DM?
        }
    }
}
async function handleCombatModalSubmit(interaction) {
     const customId = interaction.customId;
     console.log(`[Combat Handler] Modal Submit: ${customId}`);

     if (customId.startsWith('add_mob_submit_')) {
         const sessionId = customId.substring('add_mob_submit_'.length);
         await handleAddMobSubmitInteraction(interaction, sessionId);
     } else {
          console.log(`[Combat Handler] Ignoring modal with unknown prefix: ${customId}`);
           // DO NOT acknowledge here
     }
}

// --- Specific Handler Function Implementations ---


/**
 * Handles the initial "Join Combat" button click. Uses deferUpdate.
 */
async function handleJoinCombatInteraction(interaction, sessionId) {
    console.log(`Handling Join Combat for session ${sessionId} by user ${interaction.user.id}`);
    // Use deferUpdate to prevent "Thinking..." and avoid needing a final reply on success
    await interaction.deferUpdate({ ephemeral: true });

    const discordId = interaction.user.id;

    try {
        // Fetch User's SELECTED Character
        console.log(`Workspaceing SELECTED character for discordId ${discordId} via GET ${BACKEND_URL}/player/selected/${discordId}`);
        const response = await axios.get(`${BACKEND_URL}/player/selected/${discordId}`);

        if (response.status === 200 && response.data) {
            const character = response.data;
            if (!character.stats) {
                // Use followUp since we deferred update
                await interaction.followUp({ content: '❌ Your selected character data is missing required stats information. Cannot join combat.', ephemeral: true });
                return;
            }
            console.log(`Attempting join session ${sessionId} with selected char ID ${character.id}`);
            await addCombatantPlayer(interaction, sessionId, character); // Calls helper

        } else { // Should be caught by catch block usually
             console.error(`Could not retrieve selected character info. Status ${response.status}`);
             // Use followUp since we deferred update
             await interaction.followUp({ content: '❌ Could not retrieve your selected character information.', ephemeral: true });
        }

    } catch (error) {
        console.error(`Error handleJoinCombatInteraction session ${sessionId}, user ${discordId}:`, error);
        let errorMessage = 'An error occurred while trying to join.';
        if (axios.isAxiosError(error) && error.response) {
             if (error.response.status === 404) { errorMessage = '❌ No character selected. Use `/choosecharacter` first.'; }
             else { errorMessage = `❌ Backend error (${error.response.status}): ${error.response.data?.message || error.message}`; } // Use error.message as fallback
        } else if (error instanceof Error) { errorMessage = `❌ Error: ${error.message}`; }
        // Use followUp since we deferred update
        await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(console.error); // Catch potential error sending followUp
    }
}

/**
 * Helper function to add a player combatant via API AND update the setup message.
 * Does NOT send a final ephemeral reply on success. Uses followUp for errors.
 */
/**
 * Helper function to add a player combatant via API AND update the setup message
 * with potentially updated button states (e.g., enabling Start Fight).
 */
async function addCombatantPlayer(interaction, sessionId, player) {
    // --- Validation ---
    if (!player || !player.stats) {
        console.error("addCombatantPlayer invalid player:", player);
        await interaction.followUp({ content: '❌ Character data is invalid or missing stats. Cannot join.', ephemeral: true, components:[]}).catch(console.error);
        return;
    }
    const maxHpField = 'le_max'; const currentHpField = 'le_current'; const initBaseField = 'initiative';
    const requiredStats = [maxHpField, currentHpField, initBaseField];
    for (const stat of requiredStats) {
        if (player.stats[stat] === undefined || player.stats[stat] === null) {
            console.error(`Player ${player.id} missing required stat: stats.${stat}`);
            await interaction.followUp({ content: `❌ Character is missing required stat '${stat}'. Cannot join combat.`, ephemeral: true, components:[]}).catch(console.error);
            return;
        }
    }
    // --- End Validation ---

    try {
        // --- Prepare Data ---
        const combatantData = {
            sessionId, type: 'PLAYER', allegiance: 'PLAYER_SIDE',
            playerId: player.id, discordUserId: player.discordId, name: player.name,
            maxHP: player.stats[maxHpField], currentHP: player.stats[currentHpField],
            initiativeBase: player.stats[initBaseField]
        };
        console.log(`Attempting POST ${BACKEND_URL}/combatant:`, combatantData);

        // --- API Call ---
        const response = await axios.post(`${BACKEND_URL}/combatant`, combatantData);

        // --- Handle Success ---
        if (response.status === 201) {
            console.log(`Combatant ${player.name} added to session ${sessionId}.`);

            // --- Update Public Setup Message ---
            try {
                 console.log(`Updating setup message for ${sessionId} after player join.`);
                 // Fetch session data WITH combatants AND messageId
                 const sessionResponse = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}?relations=combatants`);
                 const updatedSession = sessionResponse.data;

                 if (updatedSession?.messageId && updatedSession?.combatants) {
                    const channel = await interaction.client.channels.fetch(updatedSession.channelId).catch(() => null);
                    if (channel?.isTextBased()) {
                        const originalMessage = await channel.messages.fetch(updatedSession.messageId).catch(() => null);
                        if (originalMessage) {
                            // Get DM username for embed
                            let dmUser = await interaction.client.users.fetch(updatedSession.dmUserId).catch(() => null);
                            const dmUsername = dmUser ? dmUser.username : updatedSession.dmUserId;

                            // Create the updated embed
                            const newEmbed = createSetupEmbed(sessionId, dmUsername, updatedSession.combatants);

                            // *** NEW: Determine if start is possible & rebuild rows ***
                            // Condition: Session must be SETUP and have >= 2 participants
                            const canStart = updatedSession.state === 'SETUP' && updatedSession.combatants?.length >= 2;
                            // Get the updated rows using the helper function
                            const newActionRows = createSetupActionRows(sessionId, canStart); // Assumes helper exists

                            // Edit message with new embed AND potentially updated button states
                            await originalMessage.edit({
                                embeds: [newEmbed],
                                components: newActionRows // Use the dynamically generated rows
                            });
                            console.log(`Successfully updated setup message ${updatedSession.messageId} (Start enabled: ${canStart})`);

                        } else { console.warn(`Original message ${updatedSession.messageId} not found.`); }
                    } else { console.warn(`Channel ${updatedSession.channelId} not found/not text.`); }
                 } else { console.warn(`Missing data needed to update message for session ${sessionId}.`); }
            } catch(updateError) {
                 console.error(`Failed to update original setup message for ${sessionId}:`, updateError);
                 // Don't send another message to user here, just log error
            }

            // --- NO FINAL EPHEMERAL REPLY/EDIT ---
            // Interaction was deferUpdate, no need to explicitly close.

        } else { // Handle non-201 success from POST /combatant
             console.error(`Failed add combatant. Status: ${response.status}`, response.data);
             await interaction.followUp({ content: `❌ Failed add: Status ${response.status}.`, ephemeral: true, components: [] });
        }
    } catch (error) { // Catch errors from POST /combatant call
         console.error(`Error addCombatantPlayer API call session ${sessionId}, player ${player.id}:`, error);
         let errorMessage = 'An error occurred adding you to combat.';
         if (axios.isAxiosError(error) && error.response) {
              if (error.response.status === 409) { errorMessage = `❌ Could not join: ${error.response.data || 'Already in combat!'}`; }
              else { errorMessage = `❌ Backend error (${error.response.status})`; }
         } else if (error instanceof Error) { errorMessage = `❌ Error: ${error.message}`; }
         await interaction.followUp({ content: errorMessage, ephemeral: true, components: [] });
    }
}
async function handleCancelCombatInteraction(interaction, sessionId) { /* ... Implementation as before ... */
    console.log(`Handling Cancel Combat for session ${sessionId} by user ${interaction.user.id}`); await interaction.deferReply({ ephemeral: true });
    try { const sessionResponse = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}`); const session = sessionResponse.data; if (!session) throw new Error("Not found"); if (session.dmUserId !== interaction.user.id) throw new Error("Not DM"); if (session.state !== 'SETUP') throw new Error(`Wrong state ${session.state}`);
        await axios.delete(`${BACKEND_URL}/combatSession/${sessionId}`); console.log(`Session ${sessionId} deleted.`);
        if(session.messageId) { const channel = await interaction.client.channels.fetch(session.channelId).catch(()=>{}); if(channel?.isTextBased()) { const msg = await channel.messages.fetch(session.messageId).catch(()=>{}); if(msg) await msg.edit({content:`*Setup cancelled.*`, embeds:[], components:[]}).catch(e=>console.warn("Msg edit fail on cancel",e)); }}
        await interaction.editReply({ content: '✅ Combat setup cancelled.' });
    } catch(error) { let msg = "Error cancelling."; if (error instanceof Error) msg = error.message; await interaction.editReply(`❌ ${msg}`); }
}

async function showAddMobModal(interaction, sessionId) { /* ... Implementation as before ... */
    console.log(`Showing Add Mob Modal for session ${sessionId} by user ${interaction.user.id}`);
    try { const sessionResponse = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}`); const session = sessionResponse.data; if (!session) {await interaction.reply({content:"Not found", ephemeral:true}); return;} if (session.dmUserId !== interaction.user.id) {await interaction.reply({content:"DM only", ephemeral:true}); return;} if (session.state !== 'SETUP') {await interaction.reply({content:`State is ${session.state}`, ephemeral:true}); return;}
         const modal = new ModalBuilder().setCustomId(`add_mob_submit_${sessionId}`).setTitle(`Add Mob`); const input = new TextInputBuilder().setCustomId('mobNameInput').setLabel("Mob Template Name").setStyle(TextInputStyle.Short).setRequired(true); modal.addComponents(new ActionRowBuilder().addComponents(input)); await interaction.showModal(modal);
    } catch(error) { if (!interaction.replied && !interaction.deferred) { await interaction.reply({ content: "Failed show modal.", ephemeral: true }).catch(console.error); } }
}

/**
 * Handles the submission of the "Add Mob" modal.
 * Fetches mob template, creates NPC combatant via API, updates setup message,
 * and clears deferred state invisibly on success.
 */
// In handlers/combatHandler.js

// (Ensure createSetupEmbed and createSetupActionRows helpers are defined)
// (Ensure axios, BACKEND_URL etc. are defined/required)

async function handleAddMobSubmitInteraction(interaction, sessionId) {
    // Use deferUpdate consistently
    await interaction.deferUpdate({ ephemeral: true }); // Acknowledge modal submit without "Thinking..."

    const requestedMobName = interaction.fields.getTextInputValue('mobNameInput');
    console.log(`Handling Add Mob Submit for session ${sessionId}. Mob name: "${requestedMobName}"`);

    try {
       // --- 1. Fetch Mob Template from Backend ---
       let mobTemplate;
       try {
           const encodedName = encodeURIComponent(requestedMobName);
           // *** FIXED TYPO BELOW ***
           console.log(`Workspaceing mob template via GET ${BACKEND_URL}/mob/name/${encodedName}`);
           const response = await axios.get(`${BACKEND_URL}/mob/name/${encodedName}`);
           if (!response.data?.id) throw new Error("Mob template found but missing required fields.");
           mobTemplate = response.data;
           console.log(`Found mob template ID: ${mobTemplate.id}`);
       } catch (fetchError) {
            console.error(`Error fetching mob template "${requestedMobName}":`, fetchError);
             if (axios.isAxiosError(fetchError) && fetchError.response?.status === 404) {
                 return interaction.followUp({ content: `❌ Mob template named "**${requestedMobName}**" not found. Use \`/listmobs\` or ensure exact spelling.`, ephemeral: true });
             }
           return interaction.followUp({ content: '❌ Could not fetch mob template details from the backend.', ephemeral: true });
       }

       // --- 2. Prepare Combatant Data ---
       const requiredFields = ['id', 'name', 'baseMaxHP', 'baseInitiative'];
       for (const field of requiredFields) {
            if (mobTemplate[field] === undefined || mobTemplate[field] === null) {
                 console.error(`Mob template incomplete: missing ${field}`);
                return interaction.followUp({ content: `❌ Mob template "${requestedMobName}" is incomplete (missing ${field}). Cannot add.`, ephemeral: true });
            }
       }
       const combatantData = {
           sessionId: sessionId, type: 'NPC', allegiance: 'HOSTILE',
           mobDefinitionId: mobTemplate.id, playerId: null, discordUserId: null,
           name: mobTemplate.name, maxHP: mobTemplate.baseMaxHP,
           currentHP: mobTemplate.baseMaxHP, initiativeBase: mobTemplate.baseInitiative
       };

       // --- 3. API Call POST /combatant ---
       console.log(`Attempting POST ${BACKEND_URL}/combatant with NPC data:`, combatantData);
       const response = await axios.post(`${BACKEND_URL}/combatant`, combatantData);

       // --- 4. Handle Success ---
       if (response.status === 201) {
           console.log(`NPC Combatant ${mobTemplate.name} added successfully to session ${sessionId}.`);

           // --- Update the Original Setup Message ---
           try {
                console.log(`Attempting to update setup message after adding mob for session ${sessionId}`);
                const sessionResponse = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}?relations=combatants`);
                const updatedSession = sessionResponse.data;

                if (updatedSession?.messageId && updatedSession?.combatants) {
                   const channel = await interaction.client.channels.fetch(updatedSession.channelId).catch(() => null);
                   if (channel?.isTextBased()) {
                       const originalMessage = await channel.messages.fetch(updatedSession.messageId).catch(() => null);
                       if (originalMessage) {
                           let dmUser = await interaction.client.users.fetch(updatedSession.dmUserId).catch(() => null);
                           const dmUsername = dmUser ? dmUser.username : updatedSession.dmUserId;

                           // Create the updated embed
                           const newEmbed = createSetupEmbed(sessionId, dmUsername, updatedSession.combatants);

                           // *** CORRECTED: Only ONE edit call needed now ***
                           // Determine if start is possible & rebuild rows
                           const canStart = updatedSession.state === 'SETUP' && updatedSession.combatants?.length >= 2;
                           const newActionRows = createSetupActionRows(sessionId, canStart); // Use helper

                           // Edit message with new embed AND new button state
                           await originalMessage.edit({
                               embeds: [newEmbed],
                               components: newActionRows // Use the dynamically generated rows
                           });
                           console.log(`Successfully updated setup message ${updatedSession.messageId} after adding mob (Start enabled: ${canStart}).`);
                           // *** End Corrected Edit Block ***

                       } else { console.warn(`Original message ${updatedSession.messageId} not found.`); }
                   } else { console.warn(`Channel ${updatedSession.channelId} not found/not text.`); }
                } else { console.warn(`Missing data needed to update message for session ${sessionId}.`); }
           } catch(updateError) {
                console.error(`Failed to update original setup message after adding mob for session ${sessionId}:`, updateError);
           }
           // --- End Message Update Logic ---

           // --- NO FINAL editReply/followUp needed because we used deferUpdate ---

       } else {
           // Handle non-201 success from POST /combatant
           console.error(`Failed to add NPC combatant. Backend responded with status: ${response.status}`, response.data);
           await interaction.followUp({ content: `❌ Failed to add mob. Backend responded with status ${response.status}.`, ephemeral: true });
       }

    } catch(error) { // Catch errors from initial fetch/API call
        console.error(`Error in handleAddMobSubmitInteraction for session ${sessionId}:`, error);
        let errorMessage = 'An error occurred while adding the mob.';
         if (axios.isAxiosError(error) && error.response) {
              errorMessage = `Backend error (${error.response.status})`;
         } else if (error instanceof Error) { errorMessage = error.message; }
        await interaction.followUp({ content: `❌ ${errorMessage}`, ephemeral: true }).catch(console.error);
    }
}


/**
 * Creates the embed displaying the current state of a running combat.
 * Includes more logging for debugging data flow.
 * @param {object} session - The combat session data object from the in-memory map.
 * @returns {EmbedBuilder} The generated embed.
 */
function createCombatEmbed(session) {
    const functionName = `[createCombatEmbed ${session?.id?.substring(0,8) || '???'}]`;
    // --- Input Validation ---
    if (!session || typeof session !== 'object') {
        console.error(`${functionName} Invalid or missing session object.`);
        return new EmbedBuilder().setColor(0xFF0000).setTitle("Combat Status Error").setDescription("Invalid session data.");
    }
    // Ensure required arrays exist, default to empty if not
    const combatants = Array.isArray(session.combatants) ? session.combatants : [];
    const turnOrder = Array.isArray(session.turnOrder) ? session.turnOrder : [];
    const combatLog = Array.isArray(session.combatLog) ? session.combatLog : [];
    const currentTurnIndex = (typeof session.currentTurnIndex === 'number' && session.currentTurnIndex >= 0) ? session.currentTurnIndex : -1;

    // Log the data received by this function
    console.log(`${functionName} Received state: ${session.state}, Turn Index: ${currentTurnIndex}`);
    console.log(`${functionName} Received ${combatants.length} combatants. IDs:`, combatants.map(c => c.id)); // Log combatant IDs received
    console.log(`${functionName} Received turnOrder:`, turnOrder); // Log turn order IDs received
    console.log(`${functionName} Received combatLog length: ${combatLog.length}. Last 5 received:`, combatLog.slice(-5));


    // --- Embed Creation ---
    const combatEmbed = new EmbedBuilder()
        .setColor(session.state === 'ENDED' ? 0x808080 : 0xE74C3C)
        .setTitle(`⚔️ Combat ${session.state}! (Session: ${session.id?.substring(0, 8) || '???'}) ⚔️`)
        .setTimestamp();

    // --- Build Turn Order String ---
    let turnOrderString = "*Turn order empty or error.*"; // Default message
    if (turnOrder.length > 0 && combatants.length > 0) {
        console.log(`${functionName} Mapping turn order...`);
        const mappedStrings = turnOrder.map((combatantId, index) => {
            const combatant = combatants.find(c => c.id === combatantId);
            const combatantFound = !!combatant; // Convert to boolean for logging
            console.log(`${functionName} Mapping TO: Idx=${index}, ID=${combatantId}, Found=${combatantFound}`);
            if (!combatant) return `${index + 1}. *ERR: Combatant Data Missing*`;

            const name = combatant.name || `*Unknown*`;
            const hp = (combatant.currentHP !== undefined && combatant.maxHP !== undefined) ? `(${combatant.currentHP}/${combatant.maxHP} HP)` : '';
            const roll = (combatant.initiativeRoll !== null && combatant.initiativeRoll !== undefined) ? `[INI: ${combatant.initiativeRoll}]` : '';
            const status = combatant.currentHP <= 0 ? '~~' : '';
            let line = "";

            if (session.state === 'RUNNING' && index === currentTurnIndex) {
                 line = `**➡️ ${index + 1}. ${status}${name}${status} ${hp} ${roll}**`;
            } else {
                 const indent = '\u2002\u2002\u2002\u2002'; // 4 en spaces
                 line = `${indent}${index + 1}. ${status}${name}${status} ${hp} ${roll}`;
            }
            console.log(`${functionName} Mapped line ${index+1}: "${line}"`);
            return line;
        });
        turnOrderString = mappedStrings.join('\n');
        if (turnOrderString.length > 1020) { turnOrderString = turnOrderString.substring(0, 1020) + "\n..."; }

    } else {
         console.log(`${functionName} Turn order string generation skipped (turnOrder length: ${turnOrder.length}, combatants length: ${combatants.length})`);
         if (turnOrder.length === 0) turnOrderString = "*Turn order empty.*";
         else if (combatants.length === 0) turnOrderString = "*Combatant data missing.*";
    }
    console.log(`${functionName} Final Turn Order String Length: ${turnOrderString.length} chars`);
    combatEmbed.addFields({ name: "Turn Order", value: turnOrderString || "*Empty*", inline: false }); // Ensure value isn't empty


    // --- Build Recent Events / Log String ---
    let recentLogs = '- No events yet -';
    if (combatLog.length > 0) {
         const logCount = 5;
         recentLogs = combatLog.slice(-logCount).join('\n');
         if (recentLogs.length > 1000) { recentLogs = "...\n" + recentLogs.slice(recentLogs.length - 1000); }
    }
    console.log(`${functionName} Final recentLogs string for embed:\n---\n${recentLogs}\n---`);

    combatEmbed.addFields({ name: "Recent Events", value: `\`\`\`markdown\n${recentLogs}\n\`\`\``, inline: false });

    // --- Footer ---
    if (session.state === 'RUNNING' && currentTurnIndex >= 0 && currentTurnIndex < turnOrder.length) {
         const activeCombatant = combatants.find(c => c.id === turnOrder[currentTurnIndex]);
         combatEmbed.setFooter({ text: activeCombatant ? `Current Turn: ${activeCombatant.name}` : `Current Turn: Error!` });
    } else if (session.state === 'ENDED') { combatEmbed.setFooter({ text: `Combat Ended` }); }

    return combatEmbed;
}


function createPlayerActionRow(sessionId, actorCombatantId) {
    const attackButton = new ButtonBuilder()
        .setCustomId(`caa_${sessionId}_${actorCombatantId}`) // Shortened ID
        .setLabel("Attack").setStyle(ButtonStyle.Danger).setEmoji({ name: "⚔️" });
    const defendButton = new ButtonBuilder()
        .setCustomId(`cad_${sessionId}_${actorCombatantId}`) // Shortened ID
        .setLabel("Defend").setStyle(ButtonStyle.Secondary).setEmoji({ name: "🛡️" });
    const skillButton = new ButtonBuilder()
        .setCustomId(`cas_${sessionId}_${actorCombatantId}`) // Shortened ID
        .setLabel("Skill/Action").setStyle(ButtonStyle.Primary).setEmoji({ name: "✨" });
    const endTurnButton = new ButtonBuilder()
        .setCustomId(`cet_${sessionId}_${actorCombatantId}`) // Shortened ID
        .setLabel("End Turn").setStyle(ButtonStyle.Secondary).setEmoji({ name: "⏩" });

    return new ActionRowBuilder().addComponents(attackButton, defendButton, skillButton, endTurnButton);
}

/**
 * Handles the "Start Fight" button click. Rolls initiative, sets turn order,
 * updates backend, loads state into memory, updates Discord message.
 */
async function handleStartFightInteraction(interaction, sessionId) {
    console.log(`[Start Fight ${sessionId}] Handling for user ${interaction.user.id}`);
    await interaction.deferReply({ ephemeral: true });

    try {
        // --- 1. Fetch Session & Verify DM/State ---
        let session;
        try {
            console.log(`[Start Fight ${sessionId}] Fetching session data.`);
            // Fetch with combatants relation needed for initiative base and count
            const response = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}?relations=combatants`);
            if (!response.data?.id) throw new Error("Session data invalid.");
            session = response.data;
        } catch (fetchError) { /* ... handle fetch errors ... */
            console.error(`[Start Fight ${sessionId}] Error fetching session:`, fetchError);
            const errorMsg = (axios.isAxiosError(fetchError) && fetchError.response?.status === 404) ? '❌ Combat setup not found.' : '❌ Could not fetch setup details.';
            return interaction.editReply({ content: errorMsg });
        }

        if (session.dmUserId !== interaction.user.id) { return interaction.editReply({ content: '❌ Only the DM can start the fight.' }); }
        if (session.state !== 'SETUP') { return interaction.editReply({ content: `❌ Cannot start fight. Current state: ${session.state}.` }); }

        let combatants = session.combatants;

        // --- 2. Validate Start Conditions ---
        if (!combatants || combatants.length < 2) {
            return interaction.editReply({ content: '❌ Cannot start combat: Need at least 2 participants (players/mobs).' });
        }
        // Optional: Check for opposing sides if needed for your game rules
        const hasPlayers = combatants.some(c => c.allegiance === 'PLAYER_SIDE');
        const hasHostiles = combatants.some(c => c.allegiance === 'HOSTILE');
        if (!hasPlayers || !hasHostiles) {
           return interaction.editReply({ content: '❌ Cannot start combat: Need participants from opposing sides.' });
         }
        console.log(`[Start Fight ${sessionId}] Validation passed. Participants: ${combatants.length}`);

        // --- 3. Roll Initiative & Determine Turn Order ---
        console.log(`[Start Fight ${sessionId}] Rolling initiative...`);
        combatants.forEach(c => {
            const baseIni = c.initiativeBase ?? 0; // Default base to 0 if missing
            c.initiativeRoll = rollDice(6) + baseIni;
            console.log(`  - ${c.name}: ${c.initiativeRoll} (Base: ${baseIni})`);
        });

        // Sort by initiativeRoll (desc), then initiativeBase (desc) as tie-breaker
        combatants.sort((a, b) => {
            if (b.initiativeRoll !== a.initiativeRoll) {
                return b.initiativeRoll - a.initiativeRoll;
            }
            return (b.initiativeBase ?? 0) - (a.initiativeBase ?? 0);
            // Add further tie-breakers if needed (e.g., random, ID)
        });

        const turnOrder = combatants.map(c => c.id); // Array of ordered combatant UUIDs
        const combatantInitiatives = combatants.map(c => ({
            combatantId: c.id,
            initiativeRoll: c.initiativeRoll
        }));
        console.log(`[Start Fight ${sessionId}] Turn order determined:`, turnOrder);

        // --- 4. Prepare Backend Payload ---
        const startPayload = {
            turnOrder: turnOrder,
            combatantInitiatives: combatantInitiatives
        };

        // --- 5. Call Backend API to Start Combat ---
        let updatedSessionData;
        try {
            const startUrl = `${BACKEND_URL}/combatSession/${sessionId}/start`;
            console.log(`[Start Fight ${sessionId}] Calling PUT ${startUrl}`);
            const response = await axios.put(startUrl, startPayload);
            if (response.status !== 200 || !response.data) throw new Error(`Backend start failed, status: ${response.status}`);
            updatedSessionData = response.data; // Backend returns the updated session
            console.log(`[Start Fight ${sessionId}] Backend confirmed combat started.`);
        } catch (startError) {
             console.error(`[Start Fight ${sessionId}] Error calling start combat API:`, startError);
             let errorMsg = 'Failed to start combat on backend.';
              if (axios.isAxiosError(startError) && startError.response) { errorMsg = `Backend Error (${startError.response.status}): ${startError.response.data?.message || 'Failed to start'}`; }
              else if (startError instanceof Error) { errorMsg = startError.message; }
             return interaction.editReply({ content: `❌ ${errorMsg}` });
        }

        // --- 6. Load State into In-Memory Map ---
        if (!interaction.client.activeCombats) {
             interaction.client.activeCombats = new Map(); // Ensure map exists
        }
        interaction.client.activeCombats.set(session.channelId, updatedSessionData);
        console.log(`[Start Fight ${sessionId}] Session loaded into active memory map for channel ${session.channelId}`);

        // --- 7. Update Discord Message ---
        try {
            console.log(`[Start Fight ${sessionId}] Updating original message ${session.messageId}`);
            const channel = await interaction.client.channels.fetch(session.channelId).catch(() => null);
            if (!channel?.isTextBased()) throw new Error("Channel not found/text-based for message update.");

            const originalMessage = await channel.messages.fetch(session.messageId).catch(() => null);
            if (!originalMessage) throw new Error("Original setup message not found for update.");

            // Build new embed showing combat state
            const combatEmbed = createCombatEmbed(updatedSessionData);

            // Build action buttons for the FIRST participant's turn
            let actionRow = null;
            const firstCombatant = updatedSessionData.combatants.find(c => c.id === updatedSessionData.turnOrder[0]);
            if (firstCombatant?.type === 'PLAYER') { // Only show buttons if first turn is a player
                actionRow = createPlayerActionRow(sessionId, firstCombatant.id);
                console.log(`[Start Fight ${sessionId}] Added action buttons for first player: ${firstCombatant.name}`);
            } else if (firstCombatant) {
                 console.log(`[Start Fight ${sessionId}] First turn is NPC (${firstCombatant.name}), awaiting DM action (no buttons shown yet).`);
                 // Later, DM might get prompted or specific buttons
            }

            // Edit the original message, removing setup components and adding combat ones
            await originalMessage.edit({
                content: ' ', // Clear any previous content like "Setup cancelled"
                embeds: [combatEmbed],
                components: actionRow ? [actionRow] : [] // Add action row only if created
            });
            console.log(`[Start Fight ${sessionId}] Original message updated to combat state.`);

        } catch (messageUpdateError) {
             console.error(`[Start Fight ${sessionId}] Failed to update original message to combat state:`, messageUpdateError);
             // Combat *did* start on backend & in memory, but message failed. Inform DM.
             await interaction.followUp({ content: '⚠️ Combat started, but failed to update the main message display! Manual refresh might be needed.', ephemeral: true });
             // Don't return here, the main confirmation should still send.
        }

        // --- 8. Send Confirmation to DM ---
        await interaction.editReply({ content: '✅ Combat started!', ephemeral: true });

    } catch (error) { // Catch outer errors (initial fetch, validation etc.)
        console.error(`[Start Fight ${sessionId}] Unhandled error in handler:`, error);
        if (!interaction.replied && !interaction.deferred) {
             await interaction.reply({ content: 'An unexpected error occurred starting combat.', ephemeral: true }).catch(console.error);
        } else {
             await interaction.editReply({ content: '❌ An unexpected error occurred while trying to start combat.' }).catch(console.error);
        }
    }
}

/**
 * Handles the "Leave Setup" button click. Finds the user's combatant,
 * calls delete API, updates main message with updated participants AND button states.
 */
async function handleLeaveSetupInteraction(interaction, sessionId) {
    console.log(`[Leave Setup ${sessionId}] Handling for user ${interaction.user.id}`);
    // Use deferUpdate consistently
    await interaction.deferUpdate({ ephemeral: true });

    const discordId = interaction.user.id;

    try {
        // --- 1. Find the user's Combatant ID ---
        let combatantToDelete;
        const findUrl = `${BACKEND_URL}/combatant/session/${sessionId}/user/${discordId}`;
        try {
            console.log(`[Leave Setup ${sessionId}] Finding combatant via GET ${findUrl}`);
            const findResponse = await axios.get(findUrl);
            if (findResponse.status === 200 && findResponse.data && findResponse.data.id) {
                combatantToDelete = findResponse.data;
                console.log(`[Leave Setup ${sessionId}] Found combatant ID: ${combatantToDelete.id}`);
            } else { throw new Error(`Unexpected response finding combatant: ${findResponse.status}`); }
        } catch (findError) {
             console.error(`[Leave Setup ${sessionId}] Error finding combatant:`, findError.message);
             if (axios.isAxiosError(findError) && findError.response?.status === 404) { return interaction.followUp({ content: "❌ You haven't joined this combat setup.", ephemeral: true }); }
             return interaction.followUp({ content: '❌ Could not verify your participation (API Error).', ephemeral: true });
        }
        if (!combatantToDelete?.id) { return interaction.followUp({ content: '❌ Internal error finding your combatant data.', ephemeral: true }); }

        // --- 2. API Call: Delete the Combatant ---
        const deleteUrl = `${BACKEND_URL}/combatant/${combatantToDelete.id}`;
        try {
            console.log(`[Leave Setup ${sessionId}] Attempting DELETE ${deleteUrl}`);
            const deleteResponse = await axios.delete(deleteUrl);

            if (deleteResponse.status === 200 || deleteResponse.status === 204) {
                console.log(`[Leave Setup ${sessionId}] Combatant ${combatantToDelete.id} deleted via API.`);

                // --- 3. Update the Original Setup Message ---
                try {
                    console.log(`[Leave Setup ${sessionId}] Attempting setup message update.`);
                    // Fetch session again to get the *updated* combatant list
                    const sessionResponse = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}?relations=combatants`);
                    const updatedSession = sessionResponse.data;

                    if (updatedSession?.messageId && updatedSession?.combatants) {
                        const channel = await interaction.client.channels.fetch(updatedSession.channelId).catch(() => null);
                        if (channel?.isTextBased()) {
                            const originalMessage = await channel.messages.fetch(updatedSession.messageId).catch(() => null);
                            if (originalMessage) {
                                let dmUser = await interaction.client.users.fetch(updatedSession.dmUserId).catch(() => null);
                                const dmUsername = dmUser ? dmUser.username : updatedSession.dmUserId;

                                // Create the updated embed
                                const newEmbed = createSetupEmbed(sessionId, dmUsername, updatedSession.combatants);

                                // *** ADDED: Determine if start is possible & rebuild rows ***
                                const canStart = updatedSession.state === 'SETUP' && updatedSession.combatants?.length >= 2;
                                const newActionRows = createSetupActionRows(sessionId, canStart); // Use helper

                                // Edit message with new embed AND potentially updated button states
                                await originalMessage.edit({
                                    embeds: [newEmbed],
                                    components: newActionRows // Use dynamically generated rows
                                });
                                console.log(`[Leave Setup ${sessionId}] Successfully updated setup message ${updatedSession.messageId} (Start enabled: ${canStart}).`);

                            } else { console.warn(`[Leave Setup ${sessionId}] Original message ${updatedSession.messageId} not found.`); }
                        } else { console.warn(`[Leave Setup ${sessionId}] Channel ${updatedSession.channelId} not found/not text.`); }
                    } else { console.warn(`[Leave Setup ${sessionId}] Missing data needed to update message.`); }
                } catch (updateError) {
                    console.error(`[Leave Setup ${sessionId}] Failed to update setup message:`, updateError);
                    // Don't send another message, just log error. User implicitly knows they left.
                }

                // --- 4. Finalize interaction (NO VISIBLE CONFIRMATION) ---
                // No editReply/followUp needed here for success path after deferUpdate

            } else { // Handle unexpected success status from DELETE
                 console.error(`[Leave Setup ${sessionId}] Unexpected delete status: ${deleteResponse.status}`);
                 await interaction.followUp({ content: `❌ Failed to leave (unexpected API status: ${deleteResponse.status}).`, ephemeral: true });
            }
        } catch (deleteError) { // Catch errors during DELETE API call
            console.error(`[Leave Setup ${sessionId}] Error calling DELETE ${deleteUrl}:`, deleteError);
             let errorMsg = 'An error occurred trying to leave.';
              if (axios.isAxiosError(deleteError) && deleteError.response) {
                  errorMsg = `Backend error (${deleteError.response?.status || 'Network Error'})`;
              } else if (deleteError instanceof Error) { errorMsg = deleteError.message; }
             await interaction.followUp({ content: `❌ ${errorMsg}`, ephemeral: true });
        }

    } catch (error) { // Catch unexpected outer errors
        console.error(`[Leave Setup ${sessionId}] Unhandled error in handler:`, error);
        await interaction.followUp({ content: '❌ An unexpected error occurred processing leave request.', ephemeral: true }).catch(console.error);
    }
}
/**
 * Handles the "Manage Participants" button click.
 * Verifies DM, fetches participants, shows a select menu to choose who to remove.
 */
async function handleManageParticipantsInteraction(interaction, sessionId) {
    console.log(`Handling Manage Participants for session ${sessionId} by user ${interaction.user.id}`);
    await interaction.deferReply({ ephemeral: true });

    try {
        // 1. Fetch session data (including combatants) and verify DM/State
        let session;
        try {
            console.log(`Workspaceing session ${sessionId} for Manage Participants.`);
            // Make sure backend returns combatants here
            const response = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}?relations=combatants`);
            if (!response.data?.id) throw new Error("Session data missing ID.");
            session = response.data;
        } catch (fetchError) { /* ... handle fetch errors, reply ephemerally ... */
            console.error(`Error fetching session ${sessionId} for Manage:`, fetchError);
            const errorMsg = (axios.isAxiosError(fetchError) && fetchError.response?.status === 404) ? '❌ Combat setup not found.' : '❌ Could not fetch setup details.';
            return interaction.editReply({ content: errorMsg });
        }

        if (session.dmUserId !== interaction.user.id) { return interaction.editReply({ content: '❌ Only the DM can manage participants.' }); }
        if (session.state !== 'SETUP') { return interaction.editReply({ content: `❌ Can only manage participants during SETUP (Current state: ${session.state}).` }); }
        if (!session.combatants || session.combatants.length === 0) { return interaction.editReply({ content: 'ℹ️ There are no participants to manage yet.' }); }

        // 2. Build Select Menu Options
        const options = session.combatants.map(c => {
            const label = `${c.name || `ID ${c.id.substring(0,6)}...`} (${c.type || '??'})`.substring(0, 100);
            // Store the COMBATANT UUID as the value to remove
            return new StringSelectMenuOptionBuilder()
                .setLabel(label)
                .setValue(c.id); // The combatant's own UUID
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`remove_participant_select_${sessionId}`) // ID for the select menu itself
            .setPlaceholder('Select a participant to remove...')
            .addOptions(options.slice(0, 25)); // Max 25 options

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // 3. Reply Ephemerally with the Menu
        await interaction.editReply({
            content: 'Select a participant below to remove them from the combat setup:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`Error in handleManageParticipantsInteraction for session ${sessionId}:`, error);
        await interaction.editReply({ content: '❌ An unexpected error occurred while trying to manage participants.' }).catch(console.error);
    }
}
/**
 * Handles the selection from the 'Remove Participant' select menu.
 * Calls the backend to delete the selected combatant and updates the main message.
 */
async function handleRemoveParticipantSelectInteraction(interaction, sessionId) {
    // sessionId is parsed from customId by the main router (handleCombatSelectMenu)
    const combatantIdToRemove = interaction.values[0]; // The selected value IS the combatant UUID

    console.log(`Handling Remove Participant selection for session ${sessionId}. Combatant to remove: ${combatantIdToRemove}`);
    await interaction.deferUpdate({ ephemeral: true }); // Acknowledge menu selection

    // We likely need the DM's ID again to rebuild the embed later
    let dmUserId = null;

    try {
        // Optional: Fetch session again to double-check DM permissions? Or assume valid if they got menu.
        // For added security, fetching is better.
        try {
             const sessionRes = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}`);
             if (sessionRes.data?.dmUserId !== interaction.user.id) {
                  return interaction.followUp({ content: `❌ You are no longer the DM for this session? Cannot remove participant.`, ephemeral: true });
             }
             dmUserId = sessionRes.data.dmUserId; // Store for later embed rebuild
        } catch (sessionFetchErr) {
             console.error("Error re-fetching session during remove:", sessionFetchErr);
             return interaction.followUp({ content: `❌ Could not verify session details. Cannot remove participant.`, ephemeral: true });
        }


        // --- 1. API Call: Delete the Combatant ---
        const deleteUrl = `${BACKEND_URL}/combatant/${combatantIdToRemove}`;
        try {
            console.log(`Attempting DELETE ${deleteUrl}`);
            const deleteResponse = await axios.delete(deleteUrl);

            if (deleteResponse.status === 200 || deleteResponse.status === 204) {
                console.log(`Combatant ${combatantIdToRemove} deleted successfully via API.`);

                // --- 2. Update the Original Setup Message ---
                try {
                    console.log(`Attempting setup message update after removing combatant ${combatantIdToRemove}`);
                    // Fetch session again to get the *updated* combatant list and messageId
                    const sessionResponse = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}?relations=combatants`);
                    const updatedSession = sessionResponse.data;

                    if (updatedSession?.messageId && updatedSession?.combatants) {
                        const channel = await interaction.client.channels.fetch(updatedSession.channelId).catch(() => null);
                        if (channel?.isTextBased()) {
                            const originalMessage = await channel.messages.fetch(updatedSession.messageId).catch(() => null);
                            if (originalMessage) {
                                // We stored dmUserId earlier, fetch username if needed
                                let dmUser = await interaction.client.users.fetch(dmUserId).catch(() => null);
                                const dmUsername = dmUser ? dmUser.username : dmUserId;
                                const newEmbed = createSetupEmbed(sessionId, dmUsername, updatedSession.combatants);
                                // Edit message with updated embed and original components (including manage button)
                                await originalMessage.edit({ embeds: [newEmbed], components: originalMessage.components });
                                console.log(`Successfully updated setup message ${updatedSession.messageId} after removal.`);
                            }
                        }
                    }
                } catch (updateError) {
                     console.error(`Failed to update setup message after removal for session ${sessionId}:`, updateError);
                     // Non-fatal, maybe send followUp?
                     await interaction.followUp({ content: `⚠️ Participant removed, but failed to update the setup message.`, ephemeral: true }).catch(console.error);
                }

                // --- 3. Update the Ephemeral Management Message ---
                // Respond to the select menu interaction confirming removal.
                // We can remove the select menu now or prompt to remove another. Let's just confirm.
                await interaction.editReply({ content: `✅ Participant removed successfully.`, components: [] }); // Remove select menu


            } else { // Handle unexpected success status from DELETE
                console.error(`Delete combatant ${combatantIdToRemove} failed: Unexpected status ${deleteResponse.status}`);
                await interaction.editReply({ content: `❌ Failed to remove participant (unexpected API status: ${deleteResponse.status}).`, components: [] });
            }
        } catch (deleteError) { // Catch errors during DELETE API call
            console.error(`Error calling DELETE ${deleteUrl}:`, deleteError);
             let errorMsg = 'An error occurred trying to remove the participant.';
              if (axios.isAxiosError(deleteError) && deleteError.response) {
                   if (deleteError.response.status === 404) errorMsg = `Combatant not found (maybe already removed?).`;
                   else errorMsg = `Backend error (${deleteError.response.status}): Failed to remove.`;
              } else if (deleteError instanceof Error) { errorMsg = deleteError.message; }
             await interaction.editReply({ content: `❌ ${errorMsg}`, components: [] });
        }

    } catch (error) { // Catch outer errors
        console.error(`Unhandled error in handleRemoveParticipantSelectInteraction for session ${sessionId}:`, error);
        await interaction.editReply({ content: '❌ An unexpected error occurred processing the removal.', components: [] }).catch(console.error);
    }
}

// --- Export the main handlers needed by index.js ---
module.exports = {
    handleCombatButton,
    handleCombatSelectMenu,
    handleCombatModalSubmit,
    updateCombatDisplay
};