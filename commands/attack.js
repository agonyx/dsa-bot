const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
const { resolveAttack, parseAndRollDamage, applySoak, resolveDefense } = require('../utils/combatUtils');
const { addLogEntry, nextTurn, getEffectiveCombatStats } = require('../handlers/combatHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Attacks a target in combat.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The target of your attack')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('maneuver')
                .setDescription('The combat maneuver to use')
                .setAutocomplete(true)
                .setRequired(false)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const { client, user } = interaction;
        const BACKEND_URL = process.env.BACKEND_URL;

        try {
            // Get the player's character to find their ID
            const playerResponse = await axios.get(`${BACKEND_URL}/player/selected/${user.id}`);
            const player = playerResponse.data;
            if (!player) {
                await interaction.respond([]);
                return;
            }

            // Fetch the player's available action modifications (skills)
            const skillsResponse = await axios.get(`${BACKEND_URL}/player/${player.id}/action-modifications?actionType=MELEE`);
            const skills = skillsResponse.data;

            const choices = skills.map(skill => ({ name: skill.name, value: skill.id }));
            const filtered = choices.filter(choice => choice.name.toLowerCase().startsWith(focusedValue.toLowerCase()));
            
            await interaction.respond(filtered);
        } catch (error) {
            console.error('Error during maneuver autocomplete:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { client, channelId, user } = interaction;
        const BACKEND_URL = process.env.BACKEND_URL;
        const targetUser = interaction.options.getUser('target');
        const maneuverId = interaction.options.getString('maneuver');

        const sessionData = client.activeCombats.get(channelId);
        if (!sessionData || sessionData.state !== 'RUNNING') {
            return interaction.editReply('❌ There is no active combat in this channel or it is not running.');
        }

        const attackerCombatant = sessionData.combatants.find(c => c.discordUserId === user.id);
        if (!attackerCombatant) {
            return interaction.editReply('❌ You are not a participant in this combat.');
        }

        const activeCombatantId = sessionData.turnOrder[sessionData.currentTurnIndex];
        if (attackerCombatant.id !== activeCombatantId) {
            return interaction.editReply("❌ It's not your turn!");
        }

        const targetCombatant = sessionData.combatants.find(c => c.discordUserId === targetUser.id);
        if (!targetCombatant) {
            return interaction.editReply('❌ The specified target is not in this combat.');
        }
        
        if (targetCombatant.currentHP <= 0) {
            return interaction.editReply(`❌ ${targetCombatant.name} is already defeated!`);
        }

        if (attackerCombatant.allegiance === targetCombatant.allegiance) {
            return interaction.editReply('❌ You cannot attack an ally.');
        }

        try {
            let maneuver = null;
            if (maneuverId) {
                const response = await axios.get(`${BACKEND_URL}/action-modification/${maneuverId}`);
                maneuver = response.data;
            }

            const [attackerStats, targetStats] = await Promise.all([
                getEffectiveCombatStats(attackerCombatant),
                getEffectiveCombatStats(targetCombatant)
            ]);

            let atValue = attackerStats.currentAT;
            let paValue = targetStats.currentPA;
            let damageBonus = 0;
            let logMessage = `${attackerCombatant.name} attacks ${targetCombatant.name}.`;

            if (maneuver) {
                logMessage = `${attackerCombatant.name} uses **${maneuver.name}** to attack ${targetCombatant.name}.`;
                if (maneuver.rules.at_modifier) {
                    atValue += maneuver.rules.at_modifier;
                }
                if (maneuver.rules.opponent_pa_modifier) {
                    paValue += maneuver.rules.opponent_pa_modifier;
                }
                if (maneuver.rules.damage_bonus) {
                    damageBonus += maneuver.rules.damage_bonus;
                }
            }

            const attackResult = resolveAttack(atValue);
            logMessage += ` (Roll: ${attackResult.roll}/${atValue})`;
            if (attackResult.confirmRoll !== null) { logMessage += ` (Confirm: ${attackResult.confirmRoll})`; }

            let hitConnected = false;
            switch (attackResult.outcome) {
                case 'BOTCH':
                    logMessage += ` -> **BOTCH!**`;
                    break;
                case 'NORMAL_MISS':
                    logMessage += ` -> **Miss!**`;
                    break;
                case 'CRITICAL_SUCCESS':
                case 'NORMAL_HIT':
                    if (attackResult.outcome === 'CRITICAL_SUCCESS') {
                        logMessage += ` -> **CRITICAL HIT!**`;
                    } else {
                        logMessage += ` -> Hit!`;
                    }
                    hitConnected = true;
                    const defenseResult = resolveDefense(paValue);
                    logMessage += ` | ${targetCombatant.name} Parry: ${defenseResult.roll}/${paValue}.`;
                    if (defenseResult.success) {
                        logMessage += ` **Parried!**`;
                        hitConnected = false;
                    } else {
                        logMessage += ` Parry Failed.`;
                    }
                    break;
            }

            if (hitConnected) {
                let rolledDamage = parseAndRollDamage(attackerStats.currentTP);
                if (attackResult.outcome === 'CRITICAL_SUCCESS') rolledDamage *= 2;
                rolledDamage += damageBonus;

                const finalDamage = applySoak(rolledDamage, targetStats.currentRS);
                logMessage += ` | ${rolledDamage} TP - ${targetStats.currentRS} RS = **${finalDamage} DMG!**`;

                const newHP = Math.max(0, targetCombatant.currentHP - finalDamage);
                if (newHP !== targetCombatant.currentHP) {
                    await axios.put(`${BACKEND_URL}/combatant/${targetCombatant.id}`, { currentHP: newHP });
                    targetCombatant.currentHP = newHP;
                    logMessage += ` | ${targetCombatant.name} HP: ${newHP}/${targetCombatant.maxHP}.`;
                    if (newHP <= 0) {
                        logMessage += ` **Defeated!**`;
                    }
                } else {
                    logMessage += " No damage taken.";
                }
            }

            await addLogEntry(client, channelId, sessionData.id, logMessage);
            await interaction.editReply({ content: 'Attack resolved!', ephemeral: true });
            await nextTurn(client, channelId);

        } catch (error) {
            console.error('Error executing attack command:', error);
            await interaction.editReply('❌ An error occurred while resolving your attack.');
        }
    },
};
