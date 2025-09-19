const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
const { resolveAttack, parseAndRollDamage, applySoak, resolveDefense } = require('../utils/combatUtils');

const BACKEND_URL = process.env.BACKEND_URL;

// Helper function to get player data and effective stats
async function getPlayerData(discordId) {
    try {
        // Fetch the selected player character for the given Discord ID
        const playerResponse = await axios.get(`${BACKEND_URL}/player/selected/${discordId}?relations=stats,weapons`);
        const player = playerResponse.data;

        if (!player || !player.stats || !player.weapons) {
            throw new Error(`Incomplete character data. Please ensure you have a character with stats and weapons.`);
        }

        // Determine equipped weapons
        const offensiveWeapon = player.weapons.find(w => w.isEquipped === 'Y' && (w.equippedSlot === 'OFFENSE' || w.equippedSlot === 'ADAPTIVE'));
        const defensiveWeapon = player.weapons.find(w => w.isEquipped === 'Y' && (w.equippedSlot === 'DEFENSE' || w.equippedSlot === 'ADAPTIVE'));

        // Calculate effective stats
        const at = offensiveWeapon ? offensiveWeapon.at : player.stats.attacke_basis || 8;
        const tp = offensiveWeapon ? offensiveWeapon.tp : '1w6';
        const pa = defensiveWeapon ? defensiveWeapon.pa : player.stats.parade_basis || 6;
        const rs = player.stats.ruestungsschutz || 0;

        return {
            id: player.id,
            name: player.name,
            statsId: player.stats.id,
            currentHP: player.stats.le_current,
            maxHP: player.stats.le_max,
            effectiveStats: {
                currentAT: at,
                currentPA: pa,
                currentRS: rs,
                currentTP: tp,
            }
        };
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            throw new Error(`No character selected for the user with ID ${discordId}. Use \`/choosecharacter\`.`);
        }
        console.error(`Error fetching player data for ${discordId}:`, error);
        throw new Error('Could not retrieve character data from the backend.');
    }
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Performs a standalone attack against a target, outside of formal combat.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The target of your attack')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('maneuver')
                .setDescription('The combat maneuver to use (optional)')
                .setAutocomplete(true)
                .setRequired(false)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const { user } = interaction;

        try {
            const playerResponse = await axios.get(`${BACKEND_URL}/player/selected/${user.id}`);
            const player = playerResponse.data;
            if (!player) return await interaction.respond([]);

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
        await interaction.deferReply();

        const { user: attackerUser } = interaction;
        const targetUser = interaction.options.getUser('target');
        const maneuverId = interaction.options.getString('maneuver');

        if (attackerUser.id === targetUser.id) {
            return interaction.editReply('❌ You cannot attack yourself.');
        }
         if (targetUser.bot) {
            return interaction.editReply("❌ You can't attack a bot.");
        }

        try {
            // 1. Fetch data for both attacker and target
            const attacker = await getPlayerData(attackerUser.id);
            const target = await getPlayerData(targetUser.id);

            if (target.currentHP <= 0) {
                return interaction.editReply(`❌ ${target.name} is already defeated!`);
            }

            let maneuver = null;
            if (maneuverId) {
                const response = await axios.get(`${BACKEND_URL}/action-modification/${maneuverId}`);
                maneuver = response.data;
            }

            // 2. Get effective stats and apply maneuver modifiers
            let atValue = attacker.effectiveStats.currentAT;
            let paValue = target.effectiveStats.currentPA;
            let damageBonus = 0;
            let description = `**${attacker.name}** attacks **${target.name}**!\n\n`;

            if (maneuver) {
                description = `**${attacker.name}** uses **${maneuver.name}** to attack **${target.name}**!\n\n`;
                if (maneuver.rules.at_modifier) atValue += maneuver.rules.at_modifier;
                if (maneuver.rules.opponent_pa_modifier) paValue += maneuver.rules.opponent_pa_modifier;
                if (maneuver.rules.damage_bonus) damageBonus += maneuver.rules.damage_bonus;
            }

            // 3. Resolve the attack
            const attackResult = resolveAttack(atValue);
            description += `⚔️ **Attack Roll:** ${attackResult.roll} / ${atValue}`;
            if (attackResult.confirmRoll !== null) description += ` (Confirm: ${attackResult.confirmRoll})`;

            let hitConnected = false;
            switch (attackResult.outcome) {
                case 'BOTCH':
                    description += ` ➡️ **BOTCH!**`;
                    break;
                case 'NORMAL_MISS':
                    description += ` ➡️ **Miss!**`;
                    break;
                case 'CRITICAL_SUCCESS':
                    description += ` ➡️ **CRITICAL HIT!**`;
                    hitConnected = true;
                    break;
                case 'NORMAL_HIT':
                    description += ` ➡️ **Hit!**`;
                    hitConnected = true;
                    break;
            }

            // 4. Resolve defense if the attack hit
            if (hitConnected) {
                const defenseResult = resolveDefense(paValue);
                description += `\n🛡️ **${target.name}'s Parry:** ${defenseResult.roll} / ${paValue}`;
                if (defenseResult.success) {
                    description += ` ➡️ **Parried!**`;
                    hitConnected = false;
                } else {
                    description += ` ➡️ Parry Failed.`;
                }
            }

            // 5. Calculate and apply damage if the attack connected
            if (hitConnected) {
                let rolledDamage = parseAndRollDamage(attacker.effectiveStats.currentTP);
                if (attackResult.outcome === 'CRITICAL_SUCCESS') rolledDamage *= 2;
                
                const totalDamage = rolledDamage + damageBonus;
                const finalDamage = applySoak(totalDamage, target.effectiveStats.currentRS);

                description += `\n💥 **Damage:** ${totalDamage} TP - ${target.effectiveStats.currentRS} RS = **${finalDamage} Damage!**`;

                const newHP = Math.max(0, target.currentHP - finalDamage);

                if (newHP !== target.currentHP) {
                    // Update target's health in the database
                    await axios.put(`${BACKEND_URL}/stats/${target.statsId}`, { le_current: newHP });
                    description += `\n❤️ **${target.name}'s HP:** ${newHP} / ${target.maxHP}`;
                    if (newHP <= 0) {
                        description += `\n\n**${target.name} has been defeated!**`;
                    } 
                } else {
                    description += "\n\nNo damage was taken after soak.";
                }
            }

            const resultEmbed = new EmbedBuilder()
                .setColor(hitConnected ? '#2ECC71' : '#E74C3C')
                .setTitle('Standalone Attack Resolution')
                .setDescription(description)
                .setTimestamp();

            await interaction.editReply({ embeds: [resultEmbed] });

        } catch (error) {
            console.error('Error executing standalone attack command:', error);
            const errorMessage = error.message || 'An unknown error occurred.';
            await interaction.editReply({ content: `❌ ${errorMessage}`, ephemeral: true });
        }
    },
};