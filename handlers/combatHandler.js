// src/handlers/combatHandler.js -- CORRECTED

const { Interaction, StringSelectMenuInteraction, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createSetupEmbed, createSetupActionRows } = require('../utils/combatComponents');
const axios = require('axios');
const { ButtonBuilder } = require('@discordjs/builders');
const { resolveAttack, parseAndRollDamage, applySoak, resolveDefense, rollDice } = require('../utils/combatUtils');
const crypto = require('crypto');
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
    else if (customId.startsWith('cas_')) { 
        const parts = customId.split('_');
        if (parts.length === 3) {
            const sessionId = parts[1];
            const actorId = parts[2];
            await handleCombatActionSkill(interaction, sessionId, actorId);
        } else {
            console.error("Invalid cas_ button ID");
            await interaction.reply({ content: 'Error: Invalid skill button data.', ephemeral: true });
        }
    }

     else if (customId.startsWith('cet_')) { // Player end turn
        const parts = customId.split('_');
        if (parts.length === 3) {
            const sessionId = parts[1];
            const actorId = parts[2];
            console.log(`[Combat Handler] Routing -> Player End Turn (Session: ${sessionId}, Actor: ${actorId})`);
            await handleCombatEndTurnInteraction(interaction, sessionId, actorId);
        } else {
            console.error(`Invalid player end turn customId: ${customId}`);
        }
    } else if (customId.startsWith('dmnpc_action_endturn_')) { // DM NPC end turn
        const parts = customId.split('_');
        if (parts.length === 5) {
            const sessionId = parts[3];
            const actorId = parts[4];
            console.log(`[Combat Handler] Routing -> DM NPC End Turn (Session: ${sessionId}, Actor: ${actorId})`);
            await handleCombatEndTurnInteraction(interaction, sessionId, actorId);
        } else {
            console.error(`Invalid NPC end turn customId: ${customId}`);
        }
    } else if (customId.startsWith('dmnpc_action_attack_')) {
        const parts = customId.split('_');
        if (parts.length === 5) {
            const sessionId = parts[3];
            const actorId = parts[4];
            console.log(`[Combat Handler] Routing -> DM NPC Attack Action (Session: ${sessionId}, Actor: ${actorId})`);
            await handleDmNpcAttackAction(interaction, sessionId, actorId);
        } else {
            console.error(`Invalid dmnpc_action_attack_ customId: ${customId}`);
            await interaction.reply({ content: "Error: Invalid NPC action button data.", ephemeral: true }).catch(console.error);
        }
    } else if (customId.startsWith('dmnpc_action_skill_')) {
        const parts = customId.split('_');
        if (parts.length === 5) {
            const sessionId = parts[3];
            const actorId = parts[4];
            await handleDmNpcSkillAction(interaction, sessionId, actorId);
        } else {
            console.error(`Invalid dmnpc_action_skill_ customId: ${customId}`);
            await interaction.reply({ content: "Error: Invalid NPC action button data.", ephemeral: true }).catch(console.error);
        }
    } else if (customId.startsWith('combat_action_')) {
        await interaction.reply({ content: 'Combat actions not implemented yet.', ephemeral: true }).catch(console.error);
    }
    else if (customId.startsWith('show_full_log_')) {
        const sessionId = customId.substring('show_full_log_'.length);
        await handleShowFullLogInteraction(interaction, sessionId);
    } else if (customId.startsWith('park_combat_')) {
        const sessionId = customId.substring('park_combat_'.length);
        await handleParkCombatInteraction(interaction, sessionId);
    } else if (customId.startsWith('end_combat_')) {
        const sessionId = customId.substring('end_combat_'.length);
        await handleEndCombatInteraction(interaction, sessionId);
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
    await interaction.deferReply({ ephemeral: true });

    try {
        const sessionData = interaction.client.activeCombats.get(interaction.channelId);
        if (!sessionData || sessionData.id !== sessionId) { return interaction.editReply({ content: '❌ Error: Could not find active combat data.' }); }
        if (sessionData.state !== 'RUNNING') { return interaction.editReply({ content: `❌ Cannot attack: Combat is not running.` }); }

        const actorCombatant = sessionData.combatants?.find(c => c.id === actorId);
        if (!actorCombatant) { return interaction.editReply({ content: `❌ Error: Cannot find your combatant data.` }); }

        const potentialTargets = sessionData.combatants?.filter(c => c.id !== actorId && c.currentHP > 0 && c.allegiance !== actorCombatant.allegiance);
        if (!potentialTargets || potentialTargets.length === 0) { return interaction.editReply({ content: 'ℹ️ No valid targets available to attack!' }); }

        const targetOptions = potentialTargets.map(target => ({
            label: `${target.name} (${target.currentHP}/${target.maxHP} HP)`.substring(0, 100),
            value: target.id,
        }));

        const targetSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`ctsa_${sessionId}_${actorId}_null`) // Maneuver ID is null for a normal attack
            .setPlaceholder('Choose a target to attack...')
            .addOptions(targetOptions);

        const row = new ActionRowBuilder().addComponents(targetSelectMenu);

        await interaction.editReply({
            content: `**${actorCombatant.name}'s Turn:** Choose a target for your attack!`,
            components: [row],
            ephemeral: true
        });
    } catch (error) {
        console.error(`[Attack Action ${sessionId}] Error for Actor ${actorId}:`, error);
        await interaction.editReply({ content: '❌ An error occurred while preparing your attack.' }).catch(console.error);
    }
}

async function resolveCombatAction(client, channelId, sessionId, actorId, targetId, maneuverId) {
    const sessionData = client.activeCombats.get(channelId);
    if (!sessionData) return; // Should be caught by caller, but good practice

    const attacker = sessionData.combatants.find(c => c.id === actorId);
    const target = sessionData.combatants.find(c => c.id === targetId);

    // No try/catch here. Let errors be thrown to the caller.

    let maneuver = null;
    if (maneuverId && maneuverId !== 'null') {
        const response = await axios.get(`${process.env.BACKEND_URL}/action-modification/${maneuverId}`);
        maneuver = response.data;
    }

    const [attackerStats, targetStats] = await Promise.all([
        getEffectiveCombatStats(attacker),
        getEffectiveCombatStats(target)
    ]);

    let atValue = attackerStats.currentAT;
    let paValue = targetStats.currentPA;
    let damageBonus = 0;
    let logMessage = `${attacker.name} attacks ${target.name}.`;

    if (maneuver) {
        logMessage = `${attacker.name} uses **${maneuver.name}** to attack ${target.name}.`;
        if (maneuver.rules.at_modifier) atValue += maneuver.rules.at_modifier;
        if (maneuver.rules.opponent_pa_modifier) paValue += maneuver.rules.opponent_pa_modifier;
        if (maneuver.rules.damage_bonus) damageBonus += maneuver.rules.damage_bonus;
    }

    const attackResult = resolveAttack(atValue);
    logMessage += ` (Roll: ${attackResult.roll}/${atValue})`;
    if (attackResult.confirmRoll !== null) logMessage += ` (Confirm: ${attackResult.confirmRoll})`;

    let hitConnected = false;
    if (attackResult.outcome === 'NORMAL_HIT' || attackResult.outcome === 'CRITICAL_SUCCESS') {
        hitConnected = true;
        const defenseResult = resolveDefense(paValue);
        logMessage += ` | ${target.name} Parry: ${defenseResult.roll}/${paValue}.`;
        if (defenseResult.success) {
            logMessage += ` **Parried!**`;
            hitConnected = false;
        } else {
            logMessage += ` Parry Failed.`;
        }
    } else {
        logMessage += ` -> **Miss!**`;
    }

    if (hitConnected) {
        let rolledDamage = parseAndRollDamage(attackerStats.currentTP);
        if (attackResult.outcome === 'CRITICAL_SUCCESS') {
            rolledDamage *= 2;
        }
        
        const totalDamage = rolledDamage + damageBonus;
        const finalDamage = applySoak(totalDamage, targetStats.currentRS);

        let damageLog;
        if (damageBonus > 0) {
            damageLog = ` | ${rolledDamage} + ${damageBonus} (Skill) = ${totalDamage} TP`;
        } else {
            damageLog = ` | ${totalDamage} TP`;
        }

        logMessage += `${damageLog} - ${targetStats.currentRS} RS = **${finalDamage} DMG!**`;
        const newHP = Math.max(0, target.currentHP - finalDamage);
        if (newHP !== target.currentHP) {
            // 1. API Call First
            await axios.put(`${process.env.BACKEND_URL}/combatant/${target.id}`, { currentHP: newHP });
            // 2. Update memory ONLY after successful API call
            target.currentHP = newHP;
            logMessage += ` | ${target.name} HP: ${newHP}/${target.maxHP}.`;
            if (newHP <= 0) logMessage += ` **Defeated!**`;
        }
    }

    await addLogEntry(client, channelId, sessionId, logMessage);
    await nextTurn(client, channelId);
}

async function handleCombatSelectMenu(interaction) {
    const customId = interaction.customId;
    console.log(`[Combat Handler] Select Menu Received: ${customId}`);

    if (!interaction.client.pendingCombatActions) {
        interaction.client.pendingCombatActions = new Map();
    }

    if (customId.startsWith('ctsa_')) { // Player selected a TARGET for either a normal attack or a skill
        await interaction.update({ content: `⚔️ Resolving action...`, components: [] });

        try {
            const parts = customId.split('_');
            const sessionId = parts[1];
            const actorIdFromCustomId = parts[2];
            const maneuverIdFromCustomId = parts[3]; // Will be 'null' for a normal attack

            const compositeValue = interaction.values[0];
            const [targetId, nonce] = compositeValue.split(':');

            let actorId;
            let maneuverId;
            let finalTargetId;

            if (nonce) {
                // This is a SKILL attack, which uses a nonce.
                const pendingAction = interaction.client.pendingCombatActions.get(nonce);
                if (!pendingAction) {
                    return interaction.editReply({ content: '❌ This action has expired. Please try again.', components: [] });
                }
                interaction.client.pendingCombatActions.delete(nonce);

                if (actorIdFromCustomId !== pendingAction.actorId) {
                    console.error(`[Combat Handler] Mismatch between actorId in customId (${actorIdFromCustomId}) and nonce cache (${pendingAction.actorId})!`);
                    return interaction.editReply({ content: '❌ Action data mismatch. Please try again.', components: [] });
                }

                actorId = pendingAction.actorId;
                maneuverId = pendingAction.maneuverId;
                finalTargetId = targetId;
            } else {
                // This is a STANDARD attack. The value is just the targetId.
                actorId = actorIdFromCustomId;
                maneuverId = maneuverIdFromCustomId; // Should be 'null'
                finalTargetId = compositeValue;
            }

            // --- Start: Added Validation ---
            const sessionData = interaction.client.activeCombats.get(interaction.channelId);
            if (!sessionData || sessionData.id !== sessionId) {
                throw new Error('Active combat data not found or session mismatch.');
            }
            const attacker = sessionData.combatants.find(c => c.id === actorId);
            const target = sessionData.combatants.find(c => c.id === finalTargetId);
            const activeCombatantId = sessionData.turnOrder[sessionData.currentTurnIndex];

            if (actorId !== activeCombatantId) {
                throw new Error("It's not your turn!");
            }
            if (attacker?.type === 'PLAYER' && attacker.discordUserId !== interaction.user.id) {
                throw new Error("You cannot control another player's character.");
            }
            if (!attacker || !target) {
                throw new Error('Attacker or Target data could not be found.');
            }
            if (target.currentHP <= 0) {
                throw new Error(`${target.name} is already defeated!`);
            }
            // --- End: Added Validation ---

            console.log(`[Combat Handler] Routing to resolveCombatAction (Session: ${sessionId}, Actor: ${actorId}, Target: ${finalTargetId}, Maneuver: ${maneuverId})`);
            
            await resolveCombatAction(interaction.client, interaction.channelId, sessionId, actorId, finalTargetId, maneuverId);
            
            await interaction.deleteReply().catch(err => {
                if (err.code !== 10008) console.error("Failed to delete ephemeral confirmation:", err);
            });

        } catch (error) {
            console.error(`[Combat Handler] Error resolving combat action:`, error);
            await interaction.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true }).catch(console.error);
        }

    } else if (customId.startsWith('csm_')) { // Player selected a SKILL/MANEUVER
        const parts = customId.split('_');
        const sessionId = parts[1];
        const actorId = parts[2];
        const maneuverId = interaction.values[0];

        const sessionData = interaction.client.activeCombats.get(interaction.channelId);
        if (!sessionData) return;

        const actorCombatant = sessionData.combatants.find(c => c.id === actorId);
        const potentialTargets = sessionData.combatants.filter(c => c.id !== actorId && c.currentHP > 0 && c.allegiance !== actorCombatant.allegiance);

        if (!potentialTargets.length) {
            return interaction.update({ content: 'There are no valid targets for this skill.', components: [] });
        }

        const nonce = crypto.randomBytes(8).toString('hex');
        interaction.client.pendingCombatActions.set(nonce, { actorId, maneuverId });
        setTimeout(() => {
            if (interaction.client.pendingCombatActions.has(nonce)) {
                console.log(`[Combat Handler] Auto-deleting expired pending action with nonce ${nonce}`);
                interaction.client.pendingCombatActions.delete(nonce);
            }
        }, 300000);

        const targetOptions = potentialTargets.map(target => ({
            label: `${target.name} (${target.currentHP}/${target.maxHP} HP)`.substring(0, 100),
            value: `${target.id}:${nonce}`,
        }));

        const targetSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`ctsa_${sessionId}_${actorId}`) // FIXED: Added actorId for consistency
            .setPlaceholder('Choose a target for your maneuver...')
            .addOptions(targetOptions);

        const row = new ActionRowBuilder().addComponents(targetSelectMenu);

        await interaction.update({
            content: `You have chosen your maneuver. Now, select your target:`,
            components: [row],
        });

    } else if (customId.startsWith('cts_npc_')) {
        const parts = customId.split('_');
        if (parts.length === 4) {
            const sessionId = parts[2];
            const actorId = parts[3];
            console.log(`[Combat Handler] Routing -> DM NPC Attack Target Select (Session: ${sessionId}, Actor: ${actorId})`);
            await handleDmNpcTargetSelectAttack(interaction, sessionId, actorId);
        } else {
            console.error(`Invalid cts_npc_ customId format: ${customId}`);
            await interaction.update({ content: 'Error: Invalid NPC target selection data.', components: [], ephemeral: true }).catch(console.error);
        }
    } else if (customId.startsWith('resume_session_select')) {
        console.log(`[Combat Handler] Routing -> Resume Session Select`);
        await handleResumeSessionSelect(interaction);
    } else if (customId.startsWith('remove_participant_select_')) {
        const sessionId = customId.substring('remove_participant_select_'.length);
        console.log(`[Combat Handler] Routing -> Remove Participant Select (Session: ${sessionId})`);
        await handleRemoveParticipantSelectInteraction(interaction, sessionId);
    }
    else {
        console.log(`[Combat Handler] Ignoring select menu with unknown prefix: ${customId}`);
    }
}

/**
 * Creates Action Row with buttons for the DM to control an NPC's turn.
 * @param {string} sessionId - The combat session ID.
 * @param {string} npcActorId - The combatant ID of the NPC whose turn it is.
 * @returns {ActionRowBuilder}
 */
function createNpcDmActionRow(sessionId, npcActorId) {
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dmnpc_action_attack_${sessionId}_${npcActorId}`)
            .setLabel("NPC Attack")
            .setStyle(ButtonStyle.Danger)
            .setEmoji({ name: "⚔️" }),
        new ButtonBuilder()
            .setCustomId(`dmnpc_action_skill_${sessionId}_${npcActorId}`)
            .setLabel("NPC Skill/Action")
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ name: "✨" }),
        new ButtonBuilder()
            .setCustomId(`dmnpc_action_endturn_${sessionId}_${npcActorId}`)
            .setLabel("NPC End Turn")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: "⏩" })
    );

    const managementRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`park_combat_${sessionId}`)
            .setLabel("Park Session")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: "🅿️" }),
        new ButtonBuilder()
            .setCustomId(`end_combat_${sessionId}`)
            .setLabel("End Session")
            .setStyle(ButtonStyle.Danger)
            .setEmoji({ name: "🛑" })
    );

    return [actionRow, managementRow];
}
/**
 * Handles the click on an "End Turn" button (Player or DM-controlled NPC).
 * Verifies the action is valid for the current turn, then advances the turn.
 * @param {ButtonInteraction} interaction - The button interaction.
 * @param {string} sessionId - The combat session ID.
 * @param {string} actorId - The combatant ID whose turn it is supposed to be.
 */
async function handleCombatEndTurnInteraction(interaction, sessionId, actorId) {
    console.log(`[End Turn ${sessionId}] Handling for Actor ${actorId} by User ${interaction.user.id}`);
    // Defer update - the main display will refresh after turn advances
    await interaction.deferUpdate({ ephemeral: true });

    // --- Get Current Combat State from Memory ---
    if (!interaction.client.activeCombats?.has(interaction.channelId)) {
        console.error(`[End Turn ${sessionId}] No active combat in map.`); return; // Silently fail? Or followUp?
    }
    const sessionData = interaction.client.activeCombats.get(interaction.channelId);
    if (!sessionData || sessionData.id !== sessionId || sessionData.state !== 'RUNNING') {
        console.error(`[End Turn ${sessionId}] Session not running or ID mismatch.`); return;
    }

    // --- Verify Turn and Permissions ---
    const activeCombatantId = sessionData.turnOrder?.[sessionData.currentTurnIndex];
    const actorCombatant = sessionData.combatants?.find(c => c.id === actorId);

    if (!actorCombatant) { console.error(`[End Turn ${sessionId}] Actor ${actorId} not found.`); return; }
    if (actorId !== activeCombatantId) {
        console.log(`[End Turn ${sessionId}] Failed: Actor ${actorId} tried to end turn, but active is ${activeCombatantId}`);
        await interaction.followUp({ content: `❌ It's not your (${actorCombatant.name}'s) turn!`, ephemeral: true }).catch(console.error);
        return;
    }
    // Check permissions: Player must control self, DM must control NPC
    if (actorCombatant.type === 'PLAYER' && actorCombatant.discordUserId !== interaction.user.id) {
        await interaction.followUp({ content: `❌ You cannot end the turn for ${actorCombatant.name}.`, ephemeral: true }).catch(console.error);
        return;
    }
    if (actorCombatant.type === 'NPC' && sessionData.dmUserId !== interaction.user.id) {
        await interaction.followUp({ content: `❌ Only the DM (${sessionData.dmUserId}) can end an NPC's turn.`, ephemeral: true }).catch(console.error);
        return;
    }

    // --- If checks pass, advance the turn ---
    try {
        await nextTurn(interaction.client, interaction.channelId);
        // Display update happens at the end of nextTurn
    } catch (error) {
         console.error(`[End Turn ${sessionId}] Error during nextTurn call:`, error);
         await interaction.followUp({ content: `❌ An error occurred while trying to advance the turn.`, ephemeral: true }).catch(console.error);
    }
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

/**
 * Handles the DM's click on the "NPC Attack" button.
 * Verifies turn, then shows a target selection menu for the DM.
 * @param {ButtonInteraction} interaction - The button interaction.
 * @param {string} sessionId - The combat session ID.
 * @param {string} actorId - The combatant ID of the NPC initiating the attack.
 */
async function handleDmNpcAttackAction(interaction, sessionId, actorId) {
    console.log(`[DM NPC Attack Action ${sessionId}] Handling for Actor ${actorId} by DM ${interaction.user.id}`);
    await interaction.deferReply({ ephemeral: true });

    try {
        // --- 1. Get Current Combat State & Verify DM ---
        const sessionData = interaction.client.activeCombats.get(interaction.channelId);
        if (!sessionData || sessionData.id !== sessionId) { return interaction.editReply({ content: '❌ Error: Could not find active combat data.' }); }
        if (sessionData.dmUserId !== interaction.user.id) { return interaction.editReply({ content: '❌ Only the DM can control NPC actions.' }); }
        if (sessionData.state !== 'RUNNING') { return interaction.editReply({ content: `❌ Cannot attack: Combat is not running.` }); }

        // --- 2. Verify Turn ---
        const activeCombatantId = sessionData.turnOrder?.[sessionData.currentTurnIndex];
        const actorCombatant = sessionData.combatants?.find(c => c.id === actorId);
        if (!actorCombatant) { return interaction.editReply({ content: `❌ Error: Cannot find the NPC's combatant data.` }); }
        console.log(`[DM NPC Attack Action ${sessionId}] Attacker: ${actorCombatant.name}, Allegiance: ${actorCombatant.allegiance}`);

        if (actorId !== activeCombatantId) { const active = sessionData.combatants?.find(c=>c.id===activeCombatantId); return interaction.editReply({ content: `❌ It's not this NPC's turn! It's **${active?.name || 'Unknown'}**'s turn.` }); }

        // --- 3. Find Valid Targets (opposite allegiance) ---
        console.log(`[DM NPC Attack Action ${sessionId}] Finding targets with allegiance NOT equal to ${actorCombatant.allegiance}`);
        const potentialTargets = sessionData.combatants?.filter(c => {
            const isTarget = c.id !== actorId && c.currentHP > 0 && c.allegiance !== actorCombatant.allegiance;
            console.log(`  - Checking ${c.name} (Allegiance: ${c.allegiance}, HP: ${c.currentHP}): Is valid target? ${isTarget}`);
            return isTarget;
        });
        
        if (!potentialTargets || potentialTargets.length === 0) { return interaction.editReply({ content: 'ℹ️ No valid targets available for the NPC to attack!' }); }
        console.log(`[DM NPC Attack Action ${sessionId}] Found ${potentialTargets.length} valid targets.`);

        // --- 4. Build Target Selection Menu ---
        const targetOptions = potentialTargets.map(target =>
            new StringSelectMenuOptionBuilder()
                .setLabel(`${target.name} (${target.currentHP}/${target.maxHP} HP)`.substring(0, 100))
                .setValue(target.id) // Target combatant UUID
        );

        const targetSelectMenu = new StringSelectMenuBuilder()
            // Use a distinct custom ID for NPC target selection
            .setCustomId(`cts_npc_${sessionId}_${actorId}`)
            .setPlaceholder('Choose a target for the NPC to attack...')
            .addOptions(targetOptions.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(targetSelectMenu);

        // --- 5. Reply with the Menu ---
        await interaction.editReply({
            content: `**DM Action:** Choose a target for **${actorCombatant.name}** to attack!`,
            components: [row],
            ephemeral: true
        });
        console.log(`[DM NPC Attack Action ${sessionId}] Presented target selection to DM for Actor ${actorId}`);

    } catch (error) {
        console.error(`[DM NPC Attack Action ${sessionId}] Error for Actor ${actorId}:`, error);
        await interaction.editReply({ content: '❌ An error occurred while preparing the NPC attack.', components: [] }).catch(console.error);
    }
}




/**
 * Handles the DM's target selection for an NPC attack.
 * This function is nearly identical to handleCombatTargetSelectAttack but ensures
 * the interaction is handled correctly for the DM.
 * @param {StringSelectMenuInteraction} interaction - The select menu interaction.
 * @param {string} sessionId - The combat session ID.
 * @param {string} actorId - The combatant ID of the NPC attacker.
 */
async function handleDmNpcTargetSelectAttack(interaction, sessionId, actorId) {
    await interaction.deferUpdate({ ephemeral: true }); // Acknowledge the menu selection
    const targetId = interaction.values[0];
    console.log(`[DM NPC Attack ${sessionId}] DM ${interaction.user.id} selected Target ${targetId} for Actor ${actorId}`);

    const { client, channelId } = interaction;
    const sessionData = client.activeCombats.get(channelId);

    if (!sessionData || sessionData.id !== sessionId) {
        return interaction.followUp({ content: '❌ Error: Active combat data not found!', ephemeral: true });
    }
    if (sessionData.dmUserId !== interaction.user.id) {
        return interaction.followUp({ content: '❌ Not the DM for this combat.', ephemeral: true });
    }

    const attacker = sessionData.combatants.find(c => c.id === actorId);
    const target = sessionData.combatants.find(c => c.id === targetId);
    const activeCombatantId = sessionData.turnOrder[sessionData.currentTurnIndex];

    // --- Validation ---
    if (actorId !== activeCombatantId) {
        return interaction.followUp({ content: `❌ It's not this NPC's turn!`, ephemeral: true });
    }
    if (!attacker || !target) {
        return interaction.followUp({ content: `❌ Attacker/Target data missing.`, ephemeral: true });
    }

    try {
        // --- Call the centralized combat resolution function ---
        // For a standard NPC attack, the maneuverId is null.
        await resolveCombatAction(client, channelId, sessionId, actorId, targetId, null);

        // --- Confirm to the DM ---
        await interaction.editReply({ content: `✅ Attack by **${attacker.name}** resolved.`, components: [] });

        // Automatically delete the confirmation message after a few seconds
        setTimeout(() => {
            interaction.deleteReply().catch(err => {
                if (err.code !== 10008) console.error("Failed to delete ephemeral confirmation:", err);
            });
        }, 5000);

    } catch (error) {
        console.error(`[DM NPC Attack ${sessionId}] Error resolving attack by ${actorId} on ${targetId}:`, error);
        await interaction.followUp({ content: '❌ An error occurred while resolving the NPC attack.', ephemeral: true });
    }
}


/**
 * Adds a log entry to the in-memory state AND sends it to the backend API.
 * @param {Client} client - The Discord client instance.
 * @param {string} channelId - The channel ID where combat is active.
 * @param {string} sessionId - The combat session ID.
 * @param {string} entry - The log message string.
 */
async function addLogEntry(client, channelId, sessionId, entry) {
    const functionName = `[Log ${sessionId}]`;
    console.log(`${functionName} ADDING: "${entry}" for Channel ${channelId}`);

    let logUpdatedInMemory = false; // Flag to track if memory update happened

    // Update in-memory log first
    if (client.activeCombats?.has(channelId)) {
        const sessionDataRef = client.activeCombats.get(channelId);
        if (sessionDataRef && typeof sessionDataRef === 'object' && sessionDataRef.id === sessionId) {
            if (!sessionDataRef.combatLog || !Array.isArray(sessionDataRef.combatLog)) {
                sessionDataRef.combatLog = [];
            }
            sessionDataRef.combatLog.push(entry);
            const MAX_LOG_LENGTH = 20;
            if(sessionDataRef.combatLog.length > MAX_LOG_LENGTH) {
                 sessionDataRef.combatLog = sessionDataRef.combatLog.slice(-MAX_LOG_LENGTH);
            }
            logUpdatedInMemory = true; // Mark memory as updated
            console.log(`${functionName} In-memory log updated. Length: ${sessionDataRef.combatLog.length}`);
        } else { console.warn(`${functionName} Session data in map invalid/mismatch.`); }
    } else { console.warn(`${functionName} No active combat in map.`); }

    // --- Send log entry to backend API ---
    try {
        console.log(`${functionName} Sending entry to backend: PUT ${BACKEND_URL}/combatSession/${sessionId}`);
        // Use the generic update endpoint, sending only the new entry
        // Backend controller needs to handle appending this entry
        const response = await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, {
             combatLogEntry: entry // Send the new entry string
         });
        if (response.status === 200) {
             console.log(`${functionName} Backend acknowledged log entry.`);
        } else {
             console.warn(`${functionName} Backend responded with unexpected status ${response.status} for log entry.`);
        }
    } catch (error) {
        console.error(`${functionName} Failed to send log entry to backend:`, error.message);
        // Handle specific errors if needed (e.g., session not found on backend 404)
        if (axios.isAxiosError(error) && error.response) {
             console.error(`  -> Backend Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        }
        // If the API call fails, the log only exists in the bot's memory until next successful save/restart.
    }

    // Log directly from map AFTER potential update attempt for final verification
     if (logUpdatedInMemory) {
        const updatedSessionInMap = client.activeCombats.get(channelId);
        if (updatedSessionInMap?.combatLog) {
            console.log(`${functionName} === VERIFY MAP AFTER ADD ===`);
            console.log(`${functionName} Map log length: ${updatedSessionInMap.combatLog.length}`);
            console.log(`${functionName} Map last entry: ${updatedSessionInMap.combatLog[updatedSessionInMap.combatLog.length - 1]}`);
            console.log(`${functionName} ==========================`);
        }
    }
}

async function getEffectiveCombatStats(combatant) {
    console.log(`[getEffectiveCombatStats] Fetching stats for ${combatant.name} (Type: ${combatant.type})`);
    
    if (combatant.type === 'PLAYER') {
        try {
            const playerResponse = await axios.get(`${BACKEND_URL}/player/${combatant.playerId}?relations=weapons,stats`);
            const player = playerResponse.data;

            if (!player || !player.stats || !player.weapons) {
                throw new Error(`Incomplete player data for ID ${combatant.playerId}`);
            }

            const offensiveWeapon = player.weapons.find(w => w.isEquipped === 'Y' && (w.equippedSlot === 'OFFENSE' || w.equippedSlot === 'ADAPTIVE'));
            const defensiveWeapon = player.weapons.find(w => w.isEquipped === 'Y' && (w.equippedSlot === 'DEFENSE' || w.equippedSlot === 'ADAPTIVE'));

            // If a single ADAPTIVE weapon is used, it counts for both offense and defense.
            let at = offensiveWeapon ? offensiveWeapon.at : player.stats.attacke_basis || 8; // Default to 8 if no weapon
            const tp = offensiveWeapon ? offensiveWeapon.tp : '1w6';
            let pa = defensiveWeapon ? defensiveWeapon.pa : player.stats.parade_basis || 6; // Default to 6 if no weapon/shield
            
            // RS (Armor Soak) is missing from the Stats entity. Assuming 0 for now. This is a data model gap.
            let rs = player.stats.ruestungsschutz || 0;

            // --- NEW: Apply effects ---
            if (combatant.effects && Array.isArray(combatant.effects)) {
                for (const effect of combatant.effects) {
                    if (effect.type === 'defend') {
                        pa += effect.bonus;
                        console.log(`[getEffectiveCombatStats] Applied defend bonus (+${effect.bonus}) to ${player.name}. New PA: ${pa}`);
                    }
                }
            }

            console.log(`[getEffectiveCombatStats] Player ${player.name}: AT=${at}, PA=${pa}, RS=${rs}, TP=${tp}`);
            return { currentAT: at, currentPA: pa, currentRS: rs, currentTP: tp };

        } catch (error) {
            console.error(`[getEffectiveCombatStats] Failed to fetch player data for ${combatant.name}:`, error.message);
            // Return default/fallback stats on error
            return { currentAT: 8, currentPA: 6, currentRS: 0, currentTP: '1w6' };
        }
    } else if (combatant.type === 'NPC') {
        try {
            const mobResponse = await axios.get(`${BACKEND_URL}/mob/id/${combatant.mobDefinitionId}`);
            const mob = mobResponse.data;

            if (!mob) {
                throw new Error(`Mob definition not found for ID ${combatant.mobDefinitionId}`);
            }

            let pa = mob.baseParryValue;
            if (combatant.effects && Array.isArray(combatant.effects)) {
                for (const effect of combatant.effects) {
                    if (effect.type === 'defend') {
                        pa += effect.bonus;
                        console.log(`[getEffectiveCombatStats] Applied defend bonus (+${effect.bonus}) to NPC ${mob.name}. New PA: ${pa}`);
                    }
                }
            }

            const stats = {
                currentAT: mob.baseAttackValue,
                currentPA: pa,
                currentRS: mob.baseArmorSoak,
                currentTP: mob.baseDamageTP
            };
            
            console.log(`[getEffectiveCombatStats] NPC ${mob.name}: AT=${stats.currentAT}, PA=${stats.currentPA}, RS=${stats.currentRS}, TP=${stats.currentTP}`);
            return stats;

        } catch (error) {
            console.error(`[getEffectiveCombatStats] Failed to fetch mob data for ${combatant.name}:`, error.message);
            // Return default/fallback stats on error
            return { currentAT: 8, currentPA: 6, currentRS: 0, currentTP: '1w6' };
        }
    }
    
    // Fallback for unknown types
    console.warn(`[getEffectiveCombatStats] Unknown combatant type for ${combatant.name}: ${combatant.type}`);
    return { currentAT: 0, currentPA: 0, currentRS: 0, currentTP: '1w6' };
}




/**
 * Advances the combat turn to the next non-defeated combatant.
 * Updates the in-memory state and persists the new turn index to the backend.
 * Calls updateCombatDisplay at the end.
 * @param {Client} client - The Discord client instance.
 * @param {string} channelId - The ID of the channel where combat is active.
 */
async function nextTurn(client, channelId) {
    const functionName = `[Next Turn ${channelId}]`;
    console.log(`${functionName} Attempting to advance turn.`);

    // 1. Get State from Memory
    if (!client.activeCombats?.has(channelId)) { console.error(`${functionName} No active combat found.`); return; }
    const sessionData = client.activeCombats.get(channelId);
    if (!sessionData || !Array.isArray(sessionData.turnOrder) || sessionData.turnOrder.length === 0) { console.error(`${functionName} Invalid session data or empty turn order.`); return; }
    if (sessionData.state !== 'RUNNING') { console.warn(`${functionName} Combat not running, turn cannot advance.`); return; }

    const sessionId = sessionData.id;
    const turnOrder = sessionData.turnOrder;
    const numCombatants = turnOrder.length;

    // --- (Optional: Set previous combatant isActiveTurn=false via API) ---
    // const previousActorId = turnOrder[sessionData.currentTurnIndex];
    // try { await axios.put(`${BACKEND_URL}/combatant/${previousActorId}`, { isActiveTurn: false }); }
    // catch (e) { console.error(`${functionName} Failed API call to set previous actor inactive`, e.message); }
    // --- End Optional ---

    // 2. Find Next Active Combatant
    let nextIndex = sessionData.currentTurnIndex; // Start checking from current index + 1
    let nextActiveCombatant = null;
    let checkedCount = 0; // Safety break for infinite loops

    console.log(`${functionName} Starting search for next turn from index ${sessionData.currentTurnIndex}.`);

    while (checkedCount < numCombatants) {
        nextIndex = (nextIndex + 1) % numCombatants; // Move to next index, wrap around
        const nextCombatantId = turnOrder[nextIndex];
        const potentialCombatant = sessionData.combatants.find(c => c.id === nextCombatantId);

        console.log(`${functionName} Checking index ${nextIndex}: ID=${nextCombatantId}, Found=${!!potentialCombatant}, HP=${potentialCombatant?.currentHP}`);

        if (potentialCombatant && potentialCombatant.currentHP > 0) {
            nextActiveCombatant = potentialCombatant;
            console.log(`${functionName} Found next active combatant: ${nextActiveCombatant.name} at index ${nextIndex}`);
            break; // Found the next active participant
        }

        checkedCount++;
        if (checkedCount >= numCombatants) { // Should not happen if >0 HP combatants exist
            console.log(`${functionName} Cycled through all combatants, none found active.`);
            break;
        }
    }

    // 3. Handle Combat End or Update Turn
    if (!nextActiveCombatant) {
        // This case handles when all combatants are defeated simultaneously, resulting in a draw.
        console.log(`[Combat End ${sessionId}] No active combatants remaining! Draw or mutual defeat.`);
        sessionData.state = 'ENDED';
        sessionData.currentTurnIndex = -1;
        await addLogEntry(client, channelId, sessionId, "--- Combat Ended: No survivors! ---");

    } else {
        // --- NEW: Check for Victory Condition ---
        const consciousCombatants = sessionData.combatants.filter(c => c.currentHP > 0);
        const uniqueAllegiances = [...new Set(consciousCombatants.map(c => c.allegiance))];

        if (uniqueAllegiances.length === 1) {
            console.log(`[Combat End ${sessionId}] Victory condition met! Allegiance ${uniqueAllegiances[0]} has won.`);
            sessionData.state = 'ENDED';
            sessionData.currentTurnIndex = -1;
            const winner = uniqueAllegiances[0] === 'PLAYER_SIDE' ? 'The players' : 'The hostile forces';
            await addLogEntry(client, channelId, sessionId, `--- Combat Ended: ${winner} are victorious! ---`);
            
            // --- FIX: Add API call to update backend state ---
            try {
                await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, { state: 'ENDED' });
                console.log(`[Combat End ${sessionId}] Backend state updated to ENDED.`);
            } catch (error) {
                console.error(`[Combat End ${sessionId}] CRITICAL: Failed to update backend state to ENDED:`, error.message);
                // The bot will think the combat is over, but the DB will disagree.
                // We should probably send a message to the channel to warn the DM.
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    await channel.send('⚠️ **Warning:** Combat has ended, but there was an error saving this to the database. The session may still appear as active.');
                }
            }
            // --- End FIX ---

        } else {
            // --- Continue to Next Turn ---
            sessionData.currentTurnIndex = nextIndex; // Update index in memory
            
            if (nextActiveCombatant.effects) {
                console.log(`${functionName} Clearing temporary effects for ${nextActiveCombatant.name}.`);
                nextActiveCombatant.effects = nextActiveCombatant.effects.filter(eff => !eff.isTemporary);
            }

            console.log(`${functionName} New turn index: ${sessionData.currentTurnIndex}. New active combatant: ${nextActiveCombatant.name}`);
            try {
                 console.log(`${functionName} Updating backend session index to ${nextIndex}`);
                 await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, { currentTurnIndex: nextIndex });
            } catch(e) {
                 console.error(`${functionName} Failed to update backend with new turn index:`, e.message);
            }
            await addLogEntry(client, channelId, sessionId, `--- ${nextActiveCombatant.name}'s Turn ---`);
        }
    }

    // 4. Update the Display (ALWAYS call this to show new turn or end state)
    await updateCombatDisplay(client, channelId);
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
async function updateCombatDisplay(client, channelId, freshSessionData = null) {
    const functionName = `[Display Update ${channelId}]`;
    console.log(`${functionName} Attempting update.`);

    // 1. Get State from Memory or use fresh data if provided
    let sessionData;
    if (freshSessionData) {
        console.log(`${functionName} Using fresh session data provided.`);
        sessionData = freshSessionData;
    } else {
        if (!client.activeCombats?.has(channelId)) {
            console.error(`${functionName} No active combat found in memory map.`);
            return;
        }
        sessionData = client.activeCombats.get(channelId);
    }
    
    if (!sessionData || !sessionData.id || !sessionData.state || !sessionData.messageId) {
        console.error(`${functionName} Session data is invalid/missing fields.`, sessionData);
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
                        actionRows = createNpcDmActionRow(sessionId, activeCombatantId); // Use helper
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
             if (!combatEmbed.data.footer?.text?.startsWith('Combat Ended')) {
                combatEmbed.setFooter({ text: `Combat Ended | Session ID: ${sessionId.substring(0, 8)}...` });
             }
             const logButton = new ButtonBuilder()
                .setCustomId(`show_full_log_${sessionId}`)
                .setLabel('Show Full Log')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji({ name: '📜' });
             actionRows = [new ActionRowBuilder().addComponents(logButton)];
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
async function handleCancelCombatInteraction(interaction, sessionId) {
    console.log(`Handling Cancel Combat for session ${sessionId} by user ${interaction.user.id}`);
    await interaction.deferReply({ ephemeral: true });
    try {
        const sessionResponse = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}`);
        const session = sessionResponse.data;
        if (!session) throw new Error("Not found");
        if (session.dmUserId !== interaction.user.id) throw new Error("Not DM");
        if (session.state !== 'SETUP') throw new Error(`Wrong state ${session.state}`);
        await axios.delete(`${BACKEND_URL}/combatSession/${sessionId}`);
        console.log(`Session ${sessionId} deleted.`);
        if (session.messageId) {
            const channel = await interaction.client.channels.fetch(session.channelId).catch(() => {});
            if (channel?.isTextBased()) {
                const msg = await channel.messages.fetch(session.messageId).catch(() => {});
                if (msg) await msg.edit({ content: `*Setup cancelled.*`, embeds: [], components: [] }).catch(e => console.warn("Msg edit fail on cancel", e));
            }
        }
        await interaction.editReply({ content: '✅ Combat setup cancelled.' });
        setTimeout(() => {
            interaction.deleteReply().catch(error => {
                if (error.code !== 10008) { console.error("Failed to delete ephemeral reply:", error); }
            });
        }, 3000);
    } catch (error) {
        let msg = "Error cancelling.";
        if (error instanceof Error) msg = error.message;
        await interaction.editReply(`❌ ${msg}`);
    }
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
    const skillButton = new ButtonBuilder()
        .setCustomId(`cas_${sessionId}_${actorCombatantId}`) // Shortened ID
        .setLabel("Skill/Action").setStyle(ButtonStyle.Primary).setEmoji({ name: "✨" });
    const endTurnButton = new ButtonBuilder()
        .setCustomId(`cet_${sessionId}_${actorCombatantId}`) // Shortened ID
        .setLabel("End Turn").setStyle(ButtonStyle.Secondary).setEmoji({ name: "⏩" });

    return new ActionRowBuilder().addComponents(attackButton, skillButton, endTurnButton);
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

        // --- 7. Log Combat Start and Update Display ---
        const firstCombatantName = updatedSessionData.combatants.find(c => c.id === updatedSessionData.turnOrder[0])?.name || 'Unknown';
        await addLogEntry(interaction.client, session.channelId, sessionId, `--- Combat Started! ---`);
        await addLogEntry(interaction.client, session.channelId, sessionId, `--- ${firstCombatantName}'s Turn ---`);

        try {
            // Directly pass the fresh data to the display function
            await updateCombatDisplay(interaction.client, session.channelId, updatedSessionData);
            console.log(`[Start Fight ${sessionId}] Initial combat display updated successfully.`);
        } catch (displayError) {
            console.error(`[Start Fight ${sessionId}] Failed to update initial combat display:`, displayError);
            await interaction.followUp({ content: '⚠️ Combat started, but failed to update the main message display!', ephemeral: true });
        }

        // --- 8. Send Confirmation to DM ---
        await interaction.editReply({ content: '✅ Combat started!' });
        // Automatically delete the confirmation message after 3 seconds
        setTimeout(() => {
            interaction.deleteReply().catch(error => {
                if (error.code !== 10008) { console.error("Failed to delete ephemeral reply:", error); }
            });
        }, 3000);

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
                setTimeout(() => {
                    interaction.deleteReply().catch(error => {
                        if (error.code !== 10008) { console.error("Failed to delete ephemeral reply:", error); }
                    });
                }, 3000);


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
    updateCombatDisplay,
    resolveCombatAction,
    addLogEntry,
    nextTurn,
    getEffectiveCombatStats
};

async function handleShowFullLogInteraction(interaction, sessionId) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const response = await axios.get(`${BACKEND_URL}/combatSession/${sessionId}`);
        const session = response.data;

        if (!session || !session.combatLog) {
            return interaction.editReply('❌ Could not retrieve combat log.');
        }

        const logContent = session.combatLog.join('\n');
        const attachment = new AttachmentBuilder(Buffer.from(logContent, 'utf-8'), { name: `combat_log_${sessionId}.txt` });

        await interaction.editReply({
            content: 'Here is the full combat log:',
            files: [attachment]
        });
    } catch (error) {
        console.error('Error fetching full combat log:', error);
        await interaction.editReply('❌ An error occurred while fetching the log.');
    }
}

async function handleParkCombatInteraction(interaction, sessionId) {
    await interaction.deferReply({ ephemeral: true });
    const channelId = interaction.channelId;
    const dmUserId = interaction.user.id;

    try {
        const sessionData = interaction.client.activeCombats.get(channelId);
        if (!sessionData || sessionData.id !== sessionId) {
            return interaction.editReply('❌ Could not find active combat data.');
        }
        if (sessionData.dmUserId !== dmUserId) {
            return interaction.editReply('❌ Only the DM can park the combat.');
        }
        if (sessionData.state !== 'RUNNING') {
            return interaction.editReply(`❌ Combat is not running. Current state: ${sessionData.state}.`);
        }

        await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, { state: 'PAUSED' });
        sessionData.state = 'PAUSED';
        await updateCombatDisplay(interaction.client, channelId);
        interaction.client.activeCombats.delete(channelId);

        await interaction.editReply('✅ Combat has been paused. Use `/resumecombat` to continue.');
        setTimeout(() => {
            interaction.deleteReply().catch(error => {
                if (error.code !== 10008) { console.error("Failed to delete ephemeral reply:", error); }
            });
        }, 3000);
    } catch (error) {
        console.error('Error parking combat via button:', error);
        await interaction.editReply('❌ An error occurred while parking the combat.');
    }
}

async function handleEndCombatInteraction(interaction, sessionId) {
    await interaction.deferReply({ ephemeral: true });
    const channelId = interaction.channelId;
    const dmUserId = interaction.user.id;

    try {
        const sessionData = interaction.client.activeCombats.get(channelId);
        if (!sessionData || sessionData.id !== sessionId) {
            return interaction.editReply('❌ Could not find active combat data.');
        }
        if (sessionData.dmUserId !== dmUserId) {
            return interaction.editReply('❌ Only the DM can end the combat.');
        }

        const reason = 'Ended by the DM.';
        await axios.put(`${BACKEND_URL}/combatSession/${sessionId}`, {
            state: 'ENDED',
            combatLogEntry: `--- Combat Ended: ${reason} ---`
        });

        sessionData.state = 'ENDED';
        if (!sessionData.combatLog) sessionData.combatLog = [];
        sessionData.combatLog.push(`--- Combat Ended: ${reason} ---`);

        await updateCombatDisplay(interaction.client, channelId);
        interaction.client.activeCombats.delete(channelId);

        await interaction.editReply('✅ Combat has been ended.');
        setTimeout(() => {
            interaction.deleteReply().catch(error => {
                if (error.code !== 10008) { console.error("Failed to delete ephemeral reply:", error); }
            });
        }, 3000);
    } catch (error) {
        console.error('Error ending combat via button:', error);
        await interaction.editReply('❌ An error occurred while ending the combat.');
    }
}

async function handleResumeSessionSelect(interaction) {
    const functionName = `[Resume Session Select]`;
    // The value from the select menu is the session ID
    const sessionId = interaction.values[0];
    console.log(`${functionName} User ${interaction.user.id} selected session ${sessionId} to resume.`);

    await interaction.deferReply({ ephemeral: true });

    try {
        // --- 1. Fetch Full Session Data ---
        // We need combatants to rebuild the in-memory state correctly.
        const getUrl = `${BACKEND_URL}/combatSession/${sessionId}?relations=combatants`;
        console.log(`${functionName} Fetching session data from ${getUrl}`);
        const response = await axios.get(getUrl);
        const sessionToResume = response.data;

        // --- 2. Validate Session and User ---
        if (!sessionToResume || !sessionToResume.id) {
            return interaction.editReply({ content: '❌ Error: Could not find the selected session data.' });
        }
        if (sessionToResume.dmUserId !== interaction.user.id) {
            return interaction.editReply({ content: '❌ You are not the DM of this combat session.' });
        }
        if (sessionToResume.state !== 'PAUSED') {
            return interaction.editReply({ content: `❌ This combat session is not paused. Current state: ${sessionToResume.state}.` });
        }
        if (interaction.client.activeCombats?.has(interaction.channelId)) {
            return interaction.editReply({ content: '❌ There is already another active combat in this channel.' });
        }

        // --- 3. Update State on Backend ---
        const updateUrl = `${BACKEND_URL}/combatSession/${sessionId}`;
        console.log(`${functionName} Setting session state to RUNNING via PUT ${updateUrl}`);
        await axios.put(updateUrl, { state: 'RUNNING' });
        sessionToResume.state = 'RUNNING'; // Reflect change locally

        // --- 4. Load State into Memory ---
        if (!interaction.client.activeCombats) {
            interaction.client.activeCombats = new Map();
        }
        interaction.client.activeCombats.set(interaction.channelId, sessionToResume);
        console.log(`${functionName} Session ${sessionId} loaded into active memory for channel ${interaction.channelId}.`);

        // --- 5. Log Resumption & Update Display ---
        await addLogEntry(interaction.client, interaction.channelId, sessionId, `--- Combat Resumed ---`);
        await updateCombatDisplay(interaction.client, interaction.channelId, sessionToResume);
        console.log(`${functionName} Combat display updated.`);

        // --- 6. Confirm Success ---
        // We also need to delete the original "Which session?" message
        try {
            await interaction.message.delete();
            console.log(`${functionName} Deleted the session selection message.`);
        } catch (deleteError) {
            console.warn(`${functionName} Could not delete the original select menu message:`, deleteError.message);
        }
        await interaction.editReply({ content: '✅ Combat resumed successfully!' });
        setTimeout(() => {
            interaction.deleteReply().catch(error => {
                if (error.code !== 10008) { console.error("Failed to delete ephemeral reply:", error); }
            });
        }, 3000);


    } catch (error) {
        console.error(`${functionName} Error resuming session ${sessionId}:`, error);
        let errorMessage = 'An unexpected error occurred.';
        if (axios.isAxiosError(error) && error.response) {
            errorMessage = `Backend Error (${error.response.status}): ${error.response.data?.message || 'Failed to resume.'}`;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        await interaction.editReply({ content: `❌ ${errorMessage}` }).catch(console.error);
    }
}

async function handleDmNpcSkillAction(interaction, sessionId, actorId) {
    await interaction.reply({ content: 'NPC skill actions are not implemented yet.', ephemeral: true });
}


async function handleCombatActionSkill(interaction, sessionId, actorId) {
    console.log(`[Skill Action ${sessionId}] Handling for Actor ${actorId} by User ${interaction.user.id}`);
    await interaction.deferReply({ ephemeral: true });

    try {
        const sessionData = interaction.client.activeCombats.get(interaction.channelId);
        if (!sessionData) {
            return interaction.editReply('❌ Could not find active combat data.');
        }

        const actorCombatant = sessionData.combatants.find(c => c.id === actorId);
        if (!actorCombatant || actorCombatant.type !== 'PLAYER') {
            return interaction.editReply('❌ Invalid actor for this action.');
        }

        // Fetch player's available skills (action modifications)
        const skillsResponse = await axios.get(`${BACKEND_URL}/player/${actorCombatant.playerId}/action-modifications?actionType=MELEE`);
        const availableSkills = skillsResponse.data;

        if (!availableSkills || availableSkills.length === 0) {
            return interaction.editReply('ℹ️ You have no available combat skills/maneuvers.');
        }

        const skillOptions = availableSkills.map(skill => ({
            label: skill.name,
            description: `AT Mod: ${skill.rules.at_modifier || 0}, PA Mod: ${skill.rules.opponent_pa_modifier || 0}, DMG Mod: ${skill.rules.damage_bonus || 0}`.substring(0, 100),
            value: String(skill.id), // Ensure value is a string
        }));

        const skillSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`csm_${sessionId}_${actorId}`) // Combat Skill Maneuver
            .setPlaceholder('Choose a skill/maneuver to use...')
            .addOptions(skillOptions);

        const row = new ActionRowBuilder().addComponents(skillSelectMenu);

        await interaction.editReply({
            content: `**${actorCombatant.name}'s Turn:** Choose a skill to perform.`,
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`[Skill Action ${sessionId}] Error for Actor ${actorId}:`, error);
        await interaction.editReply({ content: '❌ An error occurred while fetching your skills.' }).catch(console.error);
    }
}