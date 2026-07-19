/**
 * Combat Turn Handler
 * Handles all turn-based combat interactions:
 * - Attack/skill actions
 * - Target selection
 * - Combat resolution
 * - Turn management
 * - Combat display
 */

const {
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonStyle,
    AttachmentBuilder,
} = require('discord.js');
const { ButtonBuilder } = require('@discordjs/builders');
const crypto = require('crypto');

const { supabase } = require('../utils/supabaseClient');
const { sessionToMemory } = require('../utils/transforms');
const { createLogger } = require('../utils/logger');
const { resolveAttack, parseAndRollDamage, applySoak, resolveDefense, rollDice } = require('../utils/combatUtils');
const {
    calculatePainLevel,
    getConditionEmoji,
    getStatusEmoji,
    CONDITION_LABELS,
    STATUS_LABELS,
} = require('../utils/conditionUtils');

const log = createLogger('combat-turn');

/**
 * Helper to get session data from memory or load from DB if missing.
 */
async function getOrLoadSession(client, channelId) {
    const sessionData = client.activeCombats?.get(channelId);
    if (sessionData) {
        log.debug({ channelId }, 'Found session in memory');
        return sessionData;
    }

    log.debug({ channelId }, 'Session not in memory, loading from DB');
    const { data: session, error } = await supabase
        .from('combat_sessions')
        .select('*, combatants(*)')
        .eq('channel_id', channelId)
        .in('state', ['RUNNING', 'PAUSED'])
        .single();

    if (error || !session) {
        log.error({ channelId, error: error?.message }, 'Failed to load session from DB');
        return null;
    }

    const memorySession = sessionToMemory(session);
    client.activeCombats.set(channelId, memorySession);
    log.info({ sessionId: session.id, channelId }, 'Session loaded from DB');
    return memorySession;
}

/**
 * Handles the click on the "Attack" action button during combat.
 */
async function handleCombatActionAttack(interaction, sessionId, actorId) {
    log.info({ sessionId, actorId, userId: interaction.user.id }, 'Handling Attack Action');
    await interaction.deferReply({ ephemeral: true });

    try {
        const sessionData = await getOrLoadSession(interaction.client, interaction.channelId);
        if (!sessionData || sessionData.id !== sessionId) {
            return interaction.editReply({ content: '❌ Error: Could not find active combat data.' });
        }
        if (sessionData.state !== 'RUNNING') {
            return interaction.editReply({ content: `❌ Cannot attack: Combat is not running.` });
        }

        const actorCombatant = sessionData.combatants?.find(c => c.id === actorId);
        if (!actorCombatant) {
            return interaction.editReply({ content: `❌ Error: Cannot find your combatant data.` });
        }

        const potentialTargets = sessionData.combatants?.filter(
            c => c.id !== actorId && c.currentHP > 0 && c.allegiance !== actorCombatant.allegiance
        );
        if (!potentialTargets || potentialTargets.length === 0) {
            return interaction.editReply({ content: 'ℹ️ No valid targets available to attack!' });
        }

        const targetOptions = potentialTargets.map(target => ({
            label: `${target.name} (${target.currentHP}/${target.maxHP} HP)`.substring(0, 100),
            value: target.id,
        }));

        const targetSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`ctsa_${sessionId}_${actorId}_null`)
            .setPlaceholder('Choose a target to attack...')
            .addOptions(targetOptions);

        const row = new ActionRowBuilder().addComponents(targetSelectMenu);

        await interaction.editReply({
            content: `**${actorCombatant.name}'s Turn:** Choose a target for your attack!`,
            components: [row],
        });
    } catch (error) {
        log.error({ error: error.message, sessionId, actorId }, 'Error in handleCombatActionAttack');
        await interaction.editReply({ content: '❌ An error occurred while preparing your attack.' }).catch(() => {});
    }
}

/**
 * Handles the click on the "Skill/Action" button during combat.
 */
async function handleCombatActionSkill(interaction, sessionId, actorId) {
    log.info({ sessionId, actorId, userId: interaction.user.id }, 'Handling Skill Action');
    await interaction.deferReply({ ephemeral: true });

    try {
        const sessionData = await getOrLoadSession(interaction.client, interaction.channelId);
        if (!sessionData) {
            return interaction.editReply('❌ Could not find active combat data.');
        }

        const actorCombatant = sessionData.combatants.find(c => c.id === actorId);
        if (!actorCombatant || actorCombatant.type !== 'PLAYER') {
            return interaction.editReply('❌ Invalid actor for this action.');
        }

        const { data: playerSkills, error } = await supabase
            .from('player_action_modifications')
            .select('*, action_modifications(*)')
            .eq('player_id', actorCombatant.playerId);

        if (error) {
            log.error({ error: error.message, playerId: actorCombatant.playerId }, 'Error fetching skills');
            return interaction.editReply('❌ An error occurred while fetching your skills.');
        }

        const availableSkills =
            playerSkills
                ?.filter(pam => pam.action_modifications && pam.action_modifications.action_type === 'MELEE')
                .map(pam => pam.action_modifications) || [];

        if (!availableSkills || availableSkills.length === 0) {
            return interaction.editReply('ℹ️ You have no available combat skills/maneuvers.');
        }

        const skillOptions = availableSkills.map(skill => ({
            label: skill.name,
            description:
                `AT: ${skill.rules?.at_modifier || 0}, PA: ${skill.rules?.opponent_pa_modifier || 0}, DMG: ${skill.rules?.damage_bonus || 0}`.substring(
                    0,
                    100
                ),
            value: String(skill.id),
        }));

        const skillSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`csm_${sessionId}_${actorId}`)
            .setPlaceholder('Choose a skill/maneuver to use...')
            .addOptions(skillOptions);

        const row = new ActionRowBuilder().addComponents(skillSelectMenu);

        await interaction.editReply({
            content: `**${actorCombatant.name}'s Turn:** Choose a skill to perform.`,
            components: [row],
        });
    } catch (error) {
        log.error({ error: error.message, sessionId, actorId }, 'Error in handleCombatActionSkill');
        await interaction.editReply({ content: '❌ An error occurred while fetching your skills.' }).catch(() => {});
    }
}

/**
 * Handles the "End Turn" button click (Player or DM-controlled NPC).
 */
async function handleCombatEndTurnInteraction(interaction, sessionId, actorId) {
    log.info({ sessionId, actorId, userId: interaction.user.id }, 'Handling End Turn');
    await interaction.deferUpdate();

    const sessionData = await getOrLoadSession(interaction.client, interaction.channelId);
    if (!sessionData || sessionData.id !== sessionId || sessionData.state !== 'RUNNING') {
        log.error({ sessionId }, 'Session not running or ID mismatch');
        return;
    }

    const activeCombatantId = sessionData.turnOrder?.[sessionData.currentTurnIndex];
    const actorCombatant = sessionData.combatants?.find(c => c.id === actorId);

    if (!actorCombatant) {
        log.error({ actorId }, 'Actor not found');
        return;
    }

    if (actorId !== activeCombatantId) {
        log.debug({ actorId, activeCombatantId }, 'Not actor turn');
        await interaction
            .followUp({
                content: `❌ It's not your (${actorCombatant.name}'s) turn!`,
                ephemeral: true,
            })
            .catch(() => {});
        return;
    }

    if (actorCombatant.type === 'PLAYER' && actorCombatant.discordUserId !== interaction.user.id) {
        await interaction
            .followUp({
                content: `❌ You cannot end the turn for ${actorCombatant.name}.`,
                ephemeral: true,
            })
            .catch(() => {});
        return;
    }

    if (actorCombatant.type === 'NPC' && sessionData.dmUserId !== interaction.user.id) {
        await interaction
            .followUp({
                content: `❌ Only the DM can end an NPC's turn.`,
                ephemeral: true,
            })
            .catch(() => {});
        return;
    }

    try {
        await nextTurn(interaction.client, interaction.channelId);
    } catch (error) {
        log.error({ error: error.message, sessionId }, 'Error during nextTurn');
        await interaction
            .followUp({
                content: `❌ An error occurred while advancing the turn.`,
                ephemeral: true,
            })
            .catch(() => {});
    }
}

/**
 * Resolves a combat action (attack with or without maneuver).
 */
async function resolveCombatAction(client, channelId, sessionId, actorId, targetId, maneuverId) {
    const sessionData = client.activeCombats.get(channelId);
    if (!sessionData) return;

    const attacker = sessionData.combatants.find(c => c.id === actorId);
    const target = sessionData.combatants.find(c => c.id === targetId);

    let maneuver = null;
    if (maneuverId && maneuverId !== 'null') {
        const { data, error } = await supabase.from('action_modifications').select('*').eq('id', maneuverId).single();
        if (!error && data) maneuver = data;
    }

    const [attackerStats, targetStats] = await Promise.all([
        getEffectiveCombatStats(attacker),
        getEffectiveCombatStats(target),
    ]);

    let atValue = attackerStats.currentAT;
    let paValue = targetStats.currentPA;
    let damageBonus = 0;
    let logMessage = `${attacker.name} attacks ${target.name}.`;

    if (maneuver) {
        logMessage = `${attacker.name} uses **${maneuver.name}** to attack ${target.name}.`;
        if (maneuver.rules?.at_modifier) atValue += maneuver.rules.at_modifier;
        if (maneuver.rules?.opponent_pa_modifier) paValue += maneuver.rules.opponent_pa_modifier;
        if (maneuver.rules?.damage_bonus) damageBonus += maneuver.rules.damage_bonus;
    }

    const attackResult = resolveAttack(atValue);
    logMessage += ` (Roll: ${attackResult.roll}/${atValue})`;
    if (attackResult.confirmRoll !== null) logMessage += ` (Confirm: ${attackResult.confirmRoll})`;

    let hitConnected = false;

    if (attackResult.outcome === 'BOTCH') {
        const botchDamage = Math.max(1, Math.floor(parseAndRollDamage(attackerStats.currentTP) / 2));
        const newAttackerHP = Math.max(0, attacker.currentHP - botchDamage);
        logMessage += ` -> **BOTCH!** ${attacker.name} injures themselves for ${botchDamage} damage!`;

        const { error: botchUpdateError } = await supabase
            .from('combatants')
            .update({ current_hp: newAttackerHP })
            .eq('id', attacker.id);

        if (botchUpdateError) {
            log.error({ error: botchUpdateError.message }, 'Failed to update attacker HP after botch');
        } else {
            attacker.currentHP = newAttackerHP;
            logMessage += ` | ${attacker.name} HP: ${newAttackerHP}/${attacker.maxHP}.`;
            if (newAttackerHP <= 0) logMessage += ` **Self-defeated!**`;
        }
    } else if (attackResult.outcome === 'CRITICAL_SUCCESS') {
        hitConnected = true;
        logMessage += ` -> **CRITICAL!** Cannot be parried!`;
    } else if (attackResult.outcome === 'NORMAL_HIT') {
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
            const { error: updateError } = await supabase
                .from('combatants')
                .update({ current_hp: newHP })
                .eq('id', target.id);

            if (updateError) {
                log.error({ error: updateError.message }, 'Failed to update combatant HP');
                logMessage += ` | ⚠️ DB update failed!`;
            } else {
                target.currentHP = newHP;
                logMessage += ` | ${target.name} HP: ${newHP}/${target.maxHP}.`;
                if (newHP <= 0) logMessage += ` **Defeated!**`;
            }
        }
    }

    await addLogEntry(client, channelId, sessionId, logMessage);
    await nextTurn(client, channelId);
}

/**
 * Handles target selection for player combat actions.
 */
async function handleCombatTargetSelectAttack(interaction, sessionId, actorIdFromCustomId, maneuverIdFromCustomId) {
    log.info({ sessionId }, 'Handling Target Select Attack');
    await interaction.update({ content: `⚔️ Resolving action...`, components: [] });

    try {
        if (!interaction.client.pendingCombatActions) {
            interaction.client.pendingCombatActions = new Map();
        }

        const compositeValue = interaction.values[0];
        const [targetId, nonce] = compositeValue.split(':');

        let actorId;
        let maneuverId;
        let finalTargetId;

        if (nonce) {
            const pendingAction = interaction.client.pendingCombatActions.get(nonce);
            if (!pendingAction) {
                return interaction.editReply({
                    content: '❌ This action has expired. Please try again.',
                    components: [],
                });
            }
            interaction.client.pendingCombatActions.delete(nonce);

            if (actorIdFromCustomId !== pendingAction.actorId) {
                log.error(
                    { customIdActor: actorIdFromCustomId, nonceActor: pendingAction.actorId },
                    'Actor ID mismatch'
                );
                return interaction.editReply({ content: '❌ Action data mismatch. Please try again.', components: [] });
            }

            actorId = pendingAction.actorId;
            maneuverId = pendingAction.maneuverId;
            finalTargetId = targetId;
        } else {
            actorId = actorIdFromCustomId;
            maneuverId = maneuverIdFromCustomId;
            finalTargetId = compositeValue;
        }

        const sessionData = await getOrLoadSession(interaction.client, interaction.channelId);
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

        log.debug({ sessionId, actorId, targetId: finalTargetId, maneuverId }, 'Resolving combat action');
        await resolveCombatAction(
            interaction.client,
            interaction.channelId,
            sessionId,
            actorId,
            finalTargetId,
            maneuverId
        );

        await interaction.deleteReply().catch(err => {
            if (err.code !== 10008) log.warn({ error: err.message }, 'Failed to delete reply');
        });
    } catch (error) {
        log.error({ error: error.message, sessionId }, 'Error resolving combat action');
        await interaction.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true }).catch(() => {});
    }
}

/**
 * Handles skill/maneuver selection - shows target menu.
 */
async function handleCombatSkillManeuverSelect(interaction, sessionId, actorId) {
    log.info({ sessionId, actorId }, 'Handling Skill Maneuver Select');
    const maneuverId = interaction.values[0];

    const sessionData = await getOrLoadSession(interaction.client, interaction.channelId);
    if (!sessionData) {
        await interaction.followUp({ content: '❌ No active combat session found.', ephemeral: true }).catch(() => {});
        return;
    }

    const actorCombatant = sessionData.combatants.find(c => c.id === actorId);
    const potentialTargets = sessionData.combatants.filter(
        c => c.id !== actorId && c.currentHP > 0 && c.allegiance !== actorCombatant.allegiance
    );

    if (!potentialTargets.length) {
        return interaction.update({ content: 'There are no valid targets for this skill.', components: [] });
    }

    const nonce = crypto.randomBytes(8).toString('hex');
    interaction.client.pendingCombatActions.set(nonce, { actorId, maneuverId });
    setTimeout(() => {
        if (interaction.client.pendingCombatActions?.has(nonce)) {
            log.debug({ nonce }, 'Auto-deleting expired pending action');
            interaction.client.pendingCombatActions.delete(nonce);
        }
    }, 300000);

    const targetOptions = potentialTargets.map(target => ({
        label: `${target.name} (${target.currentHP}/${target.maxHP} HP)`.substring(0, 100),
        value: `${target.id}:${nonce}`,
    }));

    const targetSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ctsa_${sessionId}_${actorId}`)
        .setPlaceholder('Choose a target for your maneuver...')
        .addOptions(targetOptions);

    const row = new ActionRowBuilder().addComponents(targetSelectMenu);

    await interaction.update({
        content: `You have chosen your maneuver. Now, select your target:`,
        components: [row],
    });
}

/**
 * Handles the "Show Full Log" button click.
 */
async function handleShowFullLogInteraction(interaction, sessionId) {
    log.info({ sessionId, userId: interaction.user.id }, 'Handling Show Full Log');
    await interaction.deferReply({ ephemeral: true });

    try {
        const { data: session, error } = await supabase
            .from('combat_sessions')
            .select('combat_log')
            .eq('id', sessionId)
            .single();

        if (error || !session || !session.combat_log) {
            return interaction.editReply('❌ Could not retrieve combat log.');
        }

        const logContent = session.combat_log.join('\n');
        const attachment = new AttachmentBuilder(Buffer.from(logContent, 'utf-8'), {
            name: `combat_log_${sessionId}.txt`,
        });

        await interaction.editReply({
            content: 'Here is the full combat log:',
            files: [attachment],
        });
    } catch (error) {
        log.error({ error: error.message, sessionId }, 'Error fetching full combat log');
        await interaction.editReply('❌ An error occurred while fetching the log.');
    }
}

/**
 * Handles the "Park Combat" button click.
 */
async function handleParkCombatInteraction(interaction, sessionId) {
    log.info({ sessionId, userId: interaction.user.id }, 'Handling Park Combat');
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

        const { error } = await supabase.from('combat_sessions').update({ state: 'PAUSED' }).eq('id', sessionId);

        if (error) {
            log.error({ error: error.message, sessionId }, 'Error parking combat');
            return interaction.editReply('❌ Failed to park combat in database.');
        }

        sessionData.state = 'PAUSED';
        await updateCombatDisplay(interaction.client, channelId);
        interaction.client.activeCombats.delete(channelId);

        await interaction.editReply('✅ Combat has been paused. Use `/resumecombat` to continue.');
        setTimeout(() => {
            interaction.deleteReply().catch(err => {
                if (err.code !== 10008) log.warn({ error: err.message }, 'Failed to delete reply');
            });
        }, 3000);
    } catch (error) {
        log.error({ error: error.message, sessionId }, 'Error parking combat');
        await interaction.editReply('❌ An error occurred while parking the combat.');
    }
}

/**
 * Handles the "End Combat" button click.
 */
async function handleEndCombatInteraction(interaction, sessionId) {
    log.info({ sessionId, userId: interaction.user.id }, 'Handling End Combat');
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
        const logEntry = `--- Combat Ended: ${reason} ---`;

        const { data: currentSession, error: fetchError } = await supabase
            .from('combat_sessions')
            .select('combat_log')
            .eq('id', sessionId)
            .single();

        if (fetchError) {
            log.error({ error: fetchError.message, sessionId }, 'Error fetching session for end combat');
            return interaction.editReply('❌ Failed to fetch session data.');
        }

        const updatedLog = [...(currentSession.combat_log || []), logEntry];

        const { error: updateError } = await supabase
            .from('combat_sessions')
            .update({ state: 'ENDED', combat_log: updatedLog })
            .eq('id', sessionId);

        if (updateError) {
            log.error({ error: updateError.message, sessionId }, 'Error ending combat');
            return interaction.editReply('❌ Failed to end combat in database.');
        }

        sessionData.state = 'ENDED';
        if (!sessionData.combatLog) sessionData.combatLog = [];
        sessionData.combatLog.push(logEntry);

        await updateCombatDisplay(interaction.client, channelId);
        interaction.client.activeCombats.delete(channelId);

        await interaction.editReply('✅ Combat has been ended.');
        setTimeout(() => {
            interaction.deleteReply().catch(err => {
                if (err.code !== 10008) log.warn({ error: err.message }, 'Failed to delete reply');
            });
        }, 3000);
    } catch (error) {
        log.error({ error: error.message, sessionId }, 'Error ending combat');
        await interaction.editReply('❌ An error occurred while ending the combat.');
    }
}

/**
 * Handles session resume selection.
 */
async function handleResumeSessionSelect(interaction) {
    const sessionId = interaction.values[0];
    log.info({ sessionId, userId: interaction.user.id }, 'Handling Resume Session Select');

    await interaction.deferReply({ ephemeral: true });

    try {
        const { data: sessionToResume, error: fetchError } = await supabase
            .from('combat_sessions')
            .select('*, combatants(*)')
            .eq('id', sessionId)
            .single();

        if (fetchError || !sessionToResume || !sessionToResume.id) {
            return interaction.editReply({ content: '❌ Error: Could not find the selected session data.' });
        }
        if (sessionToResume.dm_user_id !== interaction.user.id) {
            return interaction.editReply({ content: '❌ You are not the DM of this combat session.' });
        }
        if (sessionToResume.state !== 'PAUSED') {
            return interaction.editReply({
                content: `❌ This combat session is not paused. Current state: ${sessionToResume.state}.`,
            });
        }
        if (interaction.client.activeCombats?.has(interaction.channelId)) {
            return interaction.editReply({ content: '❌ There is already another active combat in this channel.' });
        }

        const { error: updateError } = await supabase
            .from('combat_sessions')
            .update({ state: 'RUNNING' })
            .eq('id', sessionId);

        if (updateError) {
            log.error({ error: updateError.message, sessionId }, 'Error updating state');
            return interaction.editReply({ content: '❌ Failed to update session state.' });
        }

        const memorySession = sessionToMemory(sessionToResume);
        memorySession.state = 'RUNNING';

        if (!interaction.client.activeCombats) {
            interaction.client.activeCombats = new Map();
        }
        interaction.client.activeCombats.set(interaction.channelId, memorySession);
        log.info({ sessionId, channelId: interaction.channelId }, 'Session loaded into memory');

        await addLogEntry(interaction.client, interaction.channelId, sessionId, `--- Combat Resumed ---`);
        await updateCombatDisplay(interaction.client, interaction.channelId, memorySession);

        try {
            await interaction.message.delete();
        } catch (deleteError) {
            log.warn({ error: deleteError.message }, 'Could not delete original select menu message');
        }

        await interaction.editReply({ content: '✅ Combat resumed successfully!' });
        setTimeout(() => {
            interaction.deleteReply().catch(err => {
                if (err.code !== 10008) log.warn({ error: err.message }, 'Failed to delete reply');
            });
        }, 3000);
    } catch (error) {
        log.error({ error: error.message, sessionId }, 'Error resuming session');
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
        await interaction.editReply({ content: `❌ ${errorMessage}` }).catch(() => {});
    }
}

/**
 * Adds a log entry to in-memory state and persists to Supabase.
 */
async function addLogEntry(client, channelId, sessionId, entry) {
    log.debug({ channelId, sessionId, entry }, 'Adding log entry');

    if (client.activeCombats?.has(channelId)) {
        const sessionDataRef = client.activeCombats.get(channelId);
        if (sessionDataRef && typeof sessionDataRef === 'object' && sessionDataRef.id === sessionId) {
            if (!sessionDataRef.combatLog || !Array.isArray(sessionDataRef.combatLog)) {
                sessionDataRef.combatLog = [];
            }
            sessionDataRef.combatLog.push(entry);
            const MAX_LOG_LENGTH = 20;
            if (sessionDataRef.combatLog.length > MAX_LOG_LENGTH) {
                sessionDataRef.combatLog = sessionDataRef.combatLog.slice(-MAX_LOG_LENGTH);
            }
        }
    }

    try {
        const { data: session, error: fetchError } = await supabase
            .from('combat_sessions')
            .select('combat_log')
            .eq('id', sessionId)
            .single();

        if (fetchError) {
            log.error({ error: fetchError.message, sessionId }, 'Failed to fetch current log');
            return;
        }

        const currentLog = session?.combat_log || [];
        const updatedLog = [...currentLog, entry];
        const MAX_LOG_LENGTH_DB = 20;
        const trimmedLog = updatedLog.slice(-MAX_LOG_LENGTH_DB);

        const { error: updateError } = await supabase
            .from('combat_sessions')
            .update({ combat_log: trimmedLog })
            .eq('id', sessionId);

        if (updateError) {
            log.error({ error: updateError.message, sessionId }, 'Failed to update log in Supabase');
        }
    } catch (error) {
        log.error({ error: error.message, sessionId }, 'Failed to send log entry to Supabase');
    }
}

/**
 * Gets effective combat stats for a combatant.
 */
async function getEffectiveCombatStats(combatant) {
    log.debug({ combatantName: combatant?.name, type: combatant?.type }, 'Fetching effective combat stats');

    if (combatant.type === 'PLAYER') {
        try {
            const { data: player, error } = await supabase
                .from('players')
                .select('*, stats:stats(*), weapons:weapons(*)')
                .eq('id', combatant.playerId)
                .single();

            if (error || !player) {
                throw new Error(`Failed to fetch player data for ID ${combatant.playerId}`);
            }

            const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;
            if (!stats || !player.weapons) {
                throw new Error(`Incomplete player data for ID ${combatant.playerId}`);
            }

            const offensiveWeapon = player.weapons.find(
                w => w.is_equipped === 'Y' && (w.equipped_slot === 'OFFENSE' || w.equipped_slot === 'ADAPTIVE')
            );
            const defensiveWeapon = player.weapons.find(
                w => w.is_equipped === 'Y' && (w.equipped_slot === 'DEFENSE' || w.equipped_slot === 'ADAPTIVE')
            );

            const at = offensiveWeapon ? offensiveWeapon.at : stats.attacke_basis || 8;
            const tp = offensiveWeapon ? offensiveWeapon.tp : '1w6';
            let pa = defensiveWeapon ? defensiveWeapon.pa : stats.parade_basis || 6;
            const rs = stats.ruestungsschutz || 0;

            if (combatant.effects && Array.isArray(combatant.effects)) {
                for (const effect of combatant.effects) {
                    if (effect.type === 'defend') {
                        pa += effect.bonus;
                        log.debug({ bonus: effect.bonus, playerName: player.name, newPA: pa }, 'Applied defend bonus');
                    }
                }
            }

            log.debug({ playerName: player.name, at, pa, rs, tp }, 'Player stats resolved');
            return { currentAT: at, currentPA: pa, currentRS: rs, currentTP: tp };
        } catch (error) {
            log.error({ error: error.message, combatantName: combatant.name }, 'Failed to fetch player stats');
            return { currentAT: 8, currentPA: 6, currentRS: 0, currentTP: '1w6' };
        }
    } else if (combatant.type === 'NPC') {
        try {
            const { data: mob, error } = await supabase
                .from('mobs')
                .select('*')
                .eq('id', combatant.mobDefinitionId)
                .single();

            if (error || !mob) {
                throw new Error(`Mob definition not found for ID ${combatant.mobDefinitionId}`);
            }

            let pa = mob.base_parry_value;
            if (combatant.effects && Array.isArray(combatant.effects)) {
                for (const effect of combatant.effects) {
                    if (effect.type === 'defend') {
                        pa += effect.bonus;
                        log.debug({ bonus: effect.bonus, mobName: mob.name, newPA: pa }, 'Applied defend bonus to NPC');
                    }
                }
            }

            const stats = {
                currentAT: mob.base_attack_value,
                currentPA: pa,
                currentRS: mob.base_armor_soak,
                currentTP: mob.base_damage_tp,
            };

            log.debug({ mobName: mob.name, ...stats }, 'NPC stats resolved');
            return stats;
        } catch (error) {
            log.error({ error: error.message, combatantName: combatant.name }, 'Failed to fetch mob stats');
            return { currentAT: 8, currentPA: 6, currentRS: 0, currentTP: '1w6' };
        }
    }

    log.warn({ combatantName: combatant.name, type: combatant.type }, 'Unknown combatant type');
    return { currentAT: 0, currentPA: 0, currentRS: 0, currentTP: '1w6' };
}

/**
 * Advances the combat turn to the next non-defeated combatant.
 */
async function nextTurn(client, channelId) {
    log.debug({ channelId }, 'Attempting to advance turn');

    if (!client.activeCombats?.has(channelId)) {
        log.error({ channelId }, 'No active combat found');
        return;
    }

    const sessionData = client.activeCombats.get(channelId);
    if (!sessionData || !Array.isArray(sessionData.turnOrder) || sessionData.turnOrder.length === 0) {
        log.error({ channelId }, 'Invalid session data or empty turn order');
        return;
    }
    if (sessionData.state !== 'RUNNING') {
        log.warn({ channelId }, 'Combat not running, turn cannot advance');
        return;
    }

    const sessionId = sessionData.id;
    const turnOrder = sessionData.turnOrder;
    const numCombatants = turnOrder.length;

    let nextIndex = sessionData.currentTurnIndex;
    const previousTurnIndex = sessionData.currentTurnIndex;
    let nextActiveCombatant = null;
    let checkedCount = 0;

    if (typeof sessionData.currentRound !== 'number' || sessionData.currentRound < 1) {
        sessionData.currentRound = 1;
    }

    log.debug({ currentTurnIndex: sessionData.currentTurnIndex }, 'Starting search for next turn');

    while (checkedCount < numCombatants) {
        nextIndex = (nextIndex + 1) % numCombatants;
        const nextCombatantId = turnOrder[nextIndex];
        const potentialCombatant = sessionData.combatants.find(c => c.id === nextCombatantId);

        log.debug(
            {
                index: nextIndex,
                combatantId: nextCombatantId,
                found: !!potentialCombatant,
                hp: potentialCombatant?.currentHP,
            },
            'Checking combatant'
        );

        if (potentialCombatant && potentialCombatant.currentHP > 0) {
            nextActiveCombatant = potentialCombatant;
            log.debug({ combatantName: nextActiveCombatant.name, index: nextIndex }, 'Found next active combatant');
            break;
        }

        checkedCount++;
    }

    if (!nextActiveCombatant) {
        log.info({ sessionId }, 'No active combatants remaining - draw/mutual defeat');
        sessionData.state = 'ENDED';
        sessionData.currentTurnIndex = -1;
        await addLogEntry(client, channelId, sessionId, '--- Combat Ended: No survivors! ---');
    } else {
        const consciousCombatants = sessionData.combatants.filter(c => c.currentHP > 0);
        const uniqueAllegiances = [...new Set(consciousCombatants.map(c => c.allegiance))];

        if (uniqueAllegiances.length === 1) {
            log.info({ sessionId, winner: uniqueAllegiances[0] }, 'Victory condition met');
            sessionData.state = 'ENDED';
            sessionData.currentTurnIndex = -1;
            const winner = uniqueAllegiances[0] === 'PLAYER_SIDE' ? 'The players' : 'The hostile forces';
            await addLogEntry(client, channelId, sessionId, `--- Combat Ended: ${winner} are victorious! ---`);

            try {
                await supabase.from('combat_sessions').update({ state: 'ENDED' }).eq('id', sessionId);
                log.debug({ sessionId }, 'Supabase state updated to ENDED');
            } catch (error) {
                log.error({ error: error.message, sessionId }, 'Failed to update Supabase state to ENDED');
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    await channel.send(
                        '⚠️ **Warning:** Combat has ended, but there was an error saving this to the database.'
                    );
                }
            }
        } else {
            sessionData.currentTurnIndex = nextIndex;

            if (nextIndex <= previousTurnIndex) {
                sessionData.currentRound += 1;
            }

            if (nextActiveCombatant.effects) {
                log.debug({ combatantName: nextActiveCombatant.name }, 'Clearing temporary effects');
                nextActiveCombatant.effects = nextActiveCombatant.effects.filter(eff => !eff.isTemporary);
            }

            log.debug({ sessionId, newIndex: nextIndex, combatantName: nextActiveCombatant.name }, 'Turn advanced');

            try {
                await supabase
                    .from('combat_sessions')
                    .update({ current_turn_index: nextIndex, current_round: sessionData.currentRound })
                    .eq('id', sessionId);
            } catch (e) {
                log.error({ error: e.message, sessionId }, 'Failed to update turn index in Supabase');
            }

            await addLogEntry(client, channelId, sessionId, `--- ${nextActiveCombatant.name}'s Turn ---`);
        }
    }

    await updateCombatDisplay(client, channelId);
}

/**
 * Creates an ASCII health bar.
 * @param {number} currentHP - Current health points.
 * @param {number} maxHP - Maximum health points.
 * @param {number} length - The number of segments for the bar.
 * @returns {string} The formatted health bar string.
 */
function createHealthBar(currentHP, maxHP, length = 5) {
    if (maxHP <= 0) return 'HP [-----] ?/?';
    const percentage = Math.max(0, Math.min(1, currentHP / maxHP));
    const filledSegments = Math.round(percentage * length);
    const emptySegments = length - filledSegments;

    const bar = '█'.repeat(filledSegments) + '-'.repeat(emptySegments);

    return `HP [${bar}] ${currentHP}/${maxHP}`;
}

/**
 * Determines the embed color based on the player party's average health and combat state.
 * @param {string} state - The current combat state ('RUNNING', 'PAUSED', 'ENDED').
 * @param {Array<object>} combatants - The list of combatants in the session.
 * @returns {number} A hex color code.
 */
function getEmbedColor(state, combatants) {
    if (state === 'PAUSED') return 0x4c6a92;
    if (state === 'ENDED') return 0x6c757d;

    const players = combatants.filter(c => c.allegiance === 'PLAYER_SIDE' && c.maxHP > 0);
    if (players.length === 0) return 0x6c757d; // Default to grey if no players

    const totalCurrentHP = players.reduce((sum, p) => sum + p.currentHP, 0);
    const totalMaxHP = players.reduce((sum, p) => sum + p.maxHP, 0);

    if (totalMaxHP === 0) return 0x6c757d;

    const averageHpPercentage = totalCurrentHP / totalMaxHP;

    if (averageHpPercentage < 0.25) return 0xc92a2a; // running-critical
    if (averageHpPercentage < 0.5) return 0xd97706; // running-strained
    return 0x2f9e44; // running-healthy
}

/**
 * Truncates a name to 24 characters with ellipsis suffix if needed.
 * @param {string} name - The name to truncate.
 * @returns {string} Truncated name or original if within limit.
 */
function truncateName(name) {
    if (!name) return 'Unknown';
    if (name.length <= 24) return name;
    return name.substring(0, 21) + '...';
}

/**
 * Builds a spotlight field for the active combatant - state-first display.
 * @param {Object} activeCombatant - The currently active combatant.
 * @returns {Object|null} Embed field object or null if no active combatant.
 */
function buildActiveActorSpotlight(activeCombatant) {
    if (!activeCombatant) return null;

    const side = activeCombatant.allegiance === 'PLAYER_SIDE' ? '🛡️ Heroes' : '⚔️ Hostiles';
    const typeIcon = activeCombatant.type === 'PLAYER' ? '👤' : '👹';
    const hpBar = createHealthBar(activeCombatant.currentHP, activeCombatant.maxHP, 8);
    const hpStatus = activeCombatant.currentHP <= 0 ? ' ⚠️ DOWN' : '';

    // Pain level display
    const painLevel =
        activeCombatant.maxHP > 0 ? calculatePainLevel(activeCombatant.currentHP, activeCombatant.maxHP) : 0;
    const painDisplay = painLevel > 0 ? `\n⚡ Schmerz Stufe ${painLevel} (-${painLevel} on all tests)` : '';

    // Active conditions
    let conditionDisplay = '';
    if (Array.isArray(activeCombatant.conditions) && activeCombatant.conditions.length > 0) {
        const condLines = activeCombatant.conditions.map(cond => {
            const label = CONDITION_LABELS[cond.condition_type] || cond.condition_type;
            return `${getConditionEmoji(cond.condition_type)} ${label} ${cond.level}`;
        });
        conditionDisplay = '\n' + condLines.join(' | ');
    }

    // Active statuses
    let statusDisplay = '';
    if (Array.isArray(activeCombatant.statuses) && activeCombatant.statuses.length > 0) {
        const statusLines = activeCombatant.statuses.map(s => {
            const label = STATUS_LABELS[s.status_type] || s.status_type;
            return `${getStatusEmoji(s.status_type)} ${label}`;
        });
        statusDisplay = '\n' + statusLines.join(' | ');
    }

    const value = [
        `**${typeIcon} ${truncateName(activeCombatant.name)}**`,
        `${side} • INI ${activeCombatant.initiativeRoll}`,
        `${hpBar}${hpStatus}${painDisplay}${conditionDisplay}${statusDisplay}`,
    ].join('\n');

    return {
        name: '🎯 Active Turn',
        value,
    };
}

/**
 * Builds a compact preview of the next combatants in the turn order.
 * @param {Array} turnOrder - Array of combatant IDs.
 * @param {Array} combatants - Array of combatant objects.
 * @param {number} currentIndex - Current turn index.
 * @returns {Object|null} Embed field object or null if no next combatant.
 */
function buildUpNextPreview(turnOrder, combatants, currentIndex) {
    if (!turnOrder || turnOrder.length === 0 || currentIndex < 0) return null;

    const numCombatants = turnOrder.length;
    let nextIndex = currentIndex;
    let checked = 0;
    const upcomingCombatants = [];

    while (checked < numCombatants && upcomingCombatants.length < 3) {
        nextIndex = (nextIndex + 1) % numCombatants;
        const candidate = combatants.find(c => c.id === turnOrder[nextIndex]);
        if (candidate && candidate.currentHP > 0) {
            upcomingCombatants.push(candidate);
        }
        checked++;
    }

    if (upcomingCombatants.length === 0) return null;

    const previewLines = upcomingCombatants.map((combatant, index) => {
        const side = combatant.allegiance === 'PLAYER_SIDE' ? '🛡️' : '⚔️';
        const hpDisplay = `${combatant.currentHP}/${combatant.maxHP}`;
        const slotLabels = ['Next', 'On Deck', 'Then'];
        return `${slotLabels[index]}: ${side} ${truncateName(combatant.name)} • INI ${combatant.initiativeRoll} • HP ${hpDisplay}`;
    });

    return {
        name: '⏭️ Up Next',
        value: previewLines.join('\n'),
    };
}

/**
 * Normalizes verbose combat log entries for the compact recent-events field.
 * @param {string} line - Raw log line.
 * @returns {string} Compact display line.
 */
function formatRecentEventLine(line) {
    if (!line) return '';

    const trimmed = line.trim();
    const turnBannerMatch = trimmed.match(/^---\s+(.+?)'s Turn\s+---$/);
    if (turnBannerMatch) {
        return `Turn: ${turnBannerMatch[1]}`;
    }

    if (trimmed === '--- Combat Started! ---') return 'Combat started';
    if (trimmed === '--- Combat Resumed ---') return 'Combat resumed';

    const combatEndedMatch = trimmed.match(/^---\s+Combat Ended:\s+(.+?)\s+---$/);
    if (combatEndedMatch) {
        return `Combat ended: ${combatEndedMatch[1]}`;
    }

    return trimmed
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\.\s+\|/g, ' |')
        .replace(/\s+\|\s+/g, ' | ')
        .trim();
}

/**
 * Creates the embed displaying the current state of a running combat.
 * State-first layout: spotlight active actor, up-next preview, compact rosters, condensed events.
 */
function createCombatEmbed(session) {
    if (!session || typeof session !== 'object') {
        log.error('Invalid or missing session object in createCombatEmbed');
        return new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Combat Status Error')
            .setDescription('Invalid session data.');
    }

    const combatants = Array.isArray(session.combatants) ? session.combatants : [];
    const turnOrder = Array.isArray(session.turnOrder) ? session.turnOrder : [];
    const combatLog = Array.isArray(session.combatLog) ? session.combatLog : [];
    const currentTurnIndex =
        typeof session.currentTurnIndex === 'number' && session.currentTurnIndex >= 0 ? session.currentTurnIndex : -1;

    const activeCombatant = turnOrder[currentTurnIndex]
        ? combatants.find(c => c.id === turnOrder[currentTurnIndex])
        : null;

    let title = `Combat Status - ${session.state}`;
    if (typeof session.currentRound === 'number' && session.currentRound > 0) {
        title += ` | Round ${session.currentRound}`;
    }

    const combatEmbed = new EmbedBuilder()
        .setColor(getEmbedColor(session.state, combatants))
        .setTitle(title)
        .setTimestamp();

    // Description - minimal now, spotlight field carries the active turn info
    const descriptionLines = [];
    if (session.state === 'PAUSED') {
        descriptionLines.push('⏸️ Combat is paused. Use `/resumecombat` to continue.');
    } else if (session.state === 'ENDED') {
        descriptionLines.push('🏁 This combat has concluded.');
    } else if (session.state === 'RUNNING' && !activeCombatant) {
        descriptionLines.push('Combat is starting...');
    }
    if (descriptionLines.length > 0) {
        combatEmbed.setDescription(descriptionLines.join('\n'));
    }

    // Field 1: Active Actor Spotlight (state-first for RUNNING)
    if (session.state === 'RUNNING' && activeCombatant) {
        const spotlightField = buildActiveActorSpotlight(activeCombatant);
        if (spotlightField) {
            combatEmbed.addFields(spotlightField);
        }

        // Field 2: Up Next Preview
        const upNextField = buildUpNextPreview(turnOrder, combatants, currentTurnIndex);
        if (upNextField) {
            combatEmbed.addFields(upNextField);
        }
    }

    const formatCombatantLine = (c, isCurrent) => {
        const turnIndicator = isCurrent ? '▸ ' : '';
        const name = truncateName(c.name);
        const initiative = c.initiativeRoll;
        const hpPercent = c.maxHP > 0 ? Math.round((c.currentHP / c.maxHP) * 100) : 0;
        const hpDisplay = `${c.currentHP}/${c.maxHP}`;
        const status = c.currentHP <= 0 ? ' | DOWN' : '';

        // Pain level indicator (derived from HP thresholds)
        const painLevel = c.maxHP > 0 ? calculatePainLevel(c.currentHP, c.maxHP) : 0;
        const painIndicator = painLevel > 0 ? ` P${painLevel}` : '';

        // Condition/status indicators (if loaded on combatant)
        let effectIndicators = '';
        if (Array.isArray(c.conditions) && c.conditions.length > 0) {
            const condAbbrevs = c.conditions.map(cond => {
                const label = CONDITION_LABELS[cond.condition_type] || cond.condition_type;
                return `${label.substring(0, 3)}${cond.level}`;
            });
            effectIndicators += ' ' + condAbbrevs.join(',');
        }
        if (Array.isArray(c.statuses) && c.statuses.length > 0) {
            const statusAbbrevs = c.statuses.map(s => {
                const label = STATUS_LABELS[s.status_type] || s.status_type;
                return label.substring(0, 3);
            });
            effectIndicators += ' ' + statusAbbrevs.join(',');
        }

        return `${turnIndicator}${name} [INI ${initiative}] HP ${hpDisplay} (${hpPercent}%)${painIndicator}${effectIndicators}${status}`;
    };

    /**
     * Formats a side's combatants with overflow handling (compact version).
     * Shows max 6 combatants: first 5 by initiative + summary line if >6 total.
     */
    const formatSideWithOverflow = (sideCombatants, activeCombatant) => {
        const MAX_VISIBLE = 6;
        const MAX_DETAILED = 5;

        if (sideCombatants.length === 0) return 'None';

        // Sort by initiative (highest first)
        const sorted = [...sideCombatants].sort((a, b) => b.initiativeRoll - a.initiativeRoll);

        if (sorted.length <= MAX_VISIBLE) {
            return sorted.map(c => formatCombatantLine(c, activeCombatant && c.id === activeCombatant.id)).join('\n');
        }

        // Overflow: show first 5 + summary line
        const visible = sorted.slice(0, MAX_DETAILED);
        const overflowCount = sorted.length - MAX_DETAILED;
        const activeCount = sorted.filter(c => c.currentHP > 0).length;
        const downCount = sorted.filter(c => c.currentHP <= 0).length;

        const lines = visible.map(c => formatCombatantLine(c, activeCombatant && c.id === activeCombatant.id));
        lines.push(`+${overflowCount} more | active ${activeCount} | down ${downCount}`);

        return lines.join('\n');
    };

    const playerCombatants = combatants.filter(c => c.allegiance === 'PLAYER_SIDE');
    const hostileCombatants = combatants.filter(c => c.allegiance === 'HOSTILE');

    // Field: Heroes (compact tactical roster)
    if (playerCombatants.length > 0) {
        const playerString = formatSideWithOverflow(playerCombatants, activeCombatant);
        combatEmbed.addFields({ name: '🛡️ Heroes', value: '```\n' + playerString + '\n```', inline: true });
    }

    // Field: Hostiles (compact tactical roster)
    if (hostileCombatants.length > 0) {
        const hostileString = formatSideWithOverflow(hostileCombatants, activeCombatant);
        combatEmbed.addFields({ name: '⚔️ Hostiles', value: '```\n' + hostileString + '\n```', inline: true });
    }

    // Field: Recent Events (compact and normalized)
    let recentLogs = 'No events yet.';
    if (combatLog.length > 0) {
        const MAX_LINE_LENGTH = 80;
        const MAX_LINES = 4;
        const MAX_TOTAL_LENGTH = 400;

        let processedLines = combatLog
            .slice(-MAX_LINES)
            .map(formatRecentEventLine)
            .filter(Boolean)
            .map(line => (line.length > MAX_LINE_LENGTH ? line.substring(0, MAX_LINE_LENGTH - 1) + '…' : line));

        let combined = processedLines.join('\n');
        while (combined.length > MAX_TOTAL_LENGTH && processedLines.length > 1) {
            processedLines = processedLines.slice(1);
            combined = processedLines.join('\n');
        }

        if (combined.length > MAX_TOTAL_LENGTH) {
            combined = combined.substring(0, MAX_TOTAL_LENGTH - 1) + '…';
        }

        recentLogs = combined;
    }
    combatEmbed.addFields({ name: '📜 Recent Events', value: `\`\`\`\n${recentLogs}\n\`\`\``, inline: false });

    combatEmbed.setFooter({ text: `Session ${session.id?.substring(0, 8) || '???'}` });

    return combatEmbed;
}

/**
 * Creates action row for player combat actions.
 */
function createPlayerActionRow(sessionId, actorCombatantId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`caa_${sessionId}_${actorCombatantId}`)
            .setLabel('Attack')
            .setStyle(ButtonStyle.Danger)
            .setEmoji({ name: '⚔️' }),
        new ButtonBuilder()
            .setCustomId(`cas_${sessionId}_${actorCombatantId}`)
            .setLabel('Skill/Action')
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ name: '✨' }),
        new ButtonBuilder()
            .setCustomId(`cet_${sessionId}_${actorCombatantId}`)
            .setLabel('End Turn')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: '⏩' })
    );
}

/**
 * Creates shared management action row with park/end session buttons.
 * @param {string} sessionId - The combat session ID.
 * @returns {ActionRowBuilder}
 */
function createManagementActionRow(sessionId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`park_combat_${sessionId}`)
            .setLabel('Park Session')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: '🅿️' }),
        new ButtonBuilder()
            .setCustomId(`end_combat_${sessionId}`)
            .setLabel('End Session')
            .setStyle(ButtonStyle.Danger)
            .setEmoji({ name: '🛑' })
    );
}

/**
 * Updates the main combat Discord message.
 */
async function updateCombatDisplay(client, channelId, freshSessionData = null) {
    log.debug({ channelId }, 'Attempting display update');

    let sessionData;
    if (freshSessionData) {
        sessionData = freshSessionData;
    } else {
        if (!client.activeCombats?.has(channelId)) {
            log.error({ channelId }, 'No active combat found in memory');
            return;
        }
        sessionData = client.activeCombats.get(channelId);
    }

    if (!sessionData || !sessionData.id || !sessionData.state || !sessionData.messageId) {
        log.error({ channelId }, 'Session data is invalid/missing fields');
        client.activeCombats?.delete(channelId);
        return;
    }

    const sessionId = sessionData.id;
    log.debug({ sessionId, state: sessionData.state, turnIndex: sessionData.currentTurnIndex }, 'Updating display');

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased()) {
            log.error({ channelId }, 'Channel invalid');
            client.activeCombats?.delete(channelId);
            return;
        }

        const message = await channel.messages.fetch(sessionData.messageId).catch(() => null);
        if (!message) {
            log.warn({ messageId: sessionData.messageId }, 'Message not found');
            client.activeCombats?.delete(channelId);
            return;
        }

        const combatEmbed = createCombatEmbed(sessionData);
        let actionRows = [];

        if (
            sessionData.state === 'RUNNING' &&
            Array.isArray(sessionData.turnOrder) &&
            sessionData.turnOrder.length > sessionData.currentTurnIndex &&
            sessionData.currentTurnIndex >= 0
        ) {
            const activeCombatantId = sessionData.turnOrder[sessionData.currentTurnIndex];
            const activeCombatant = sessionData.combatants?.find(c => c.id === activeCombatantId);

            if (activeCombatant && activeCombatant.currentHP > 0) {
                log.debug({ combatantName: activeCombatant.name, type: activeCombatant.type }, 'Current turn');
                if (activeCombatant.type === 'PLAYER') {
                    actionRows = [
                        createPlayerActionRow(sessionId, activeCombatantId),
                        createManagementActionRow(sessionId),
                    ];
                } else if (activeCombatant.type === 'NPC') {
                    const { createNpcDmActionRow } = require('./npcHandler');
                    actionRows = createNpcDmActionRow(sessionId, activeCombatantId);
                }
            }
        } else if (sessionData.state === 'ENDED') {
            actionRows = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`show_full_log_${sessionId}`)
                        .setLabel('Show Full Log')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji({ name: '📜' })
                ),
            ];
        }

        await message.edit({
            content: ' ',
            embeds: [combatEmbed],
            components: actionRows,
        });
        log.debug({ sessionId }, 'Message edit successful');
    } catch (error) {
        log.error({ error: error.message, channelId }, 'Failed to update display');
        if (error.code === 10008) {
            client.activeCombats?.delete(channelId);
        }
    }
}

module.exports = {
    getOrLoadSession,
    handleCombatActionAttack,
    handleCombatActionSkill,
    handleCombatEndTurnInteraction,
    resolveCombatAction,
    handleCombatTargetSelectAttack,
    handleCombatSkillManeuverSelect,
    handleShowFullLogInteraction,
    handleParkCombatInteraction,
    handleEndCombatInteraction,
    handleResumeSessionSelect,
    addLogEntry,
    getEffectiveCombatStats,
    nextTurn,
    createCombatEmbed,
    createPlayerActionRow,
    createManagementActionRow,
    updateCombatDisplay,
};
