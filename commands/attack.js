const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { resolveAttack, parseAndRollDamage, applySoak, resolveDefense } = require('../utils/combatUtils');

// Helper function to get player data and effective stats
async function getPlayerData(discordId) {
    try {
        const { data: player, error } = await supabase
            .from('players')
            .select(`
                id,
                name,
                stats:stats(*),
                weapons:weapons(*)
            `)
            .eq('discord_id', discordId)
            .eq('selected', 'YES')
            .single();

        if (error || !player?.stats || !player?.weapons) {
            throw new Error(`Incomplete character data. Please ensure you have a character with stats and weapons.`);
        }

        const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;

        // Determine equipped weapons
        const offensiveWeapon = player.weapons.find(w => w.is_equipped === 'Y' && (w.equipped_slot === 'OFFENSE' || w.equipped_slot === 'ADAPTIVE'));
        const defensiveWeapon = player.weapons.find(w => w.is_equipped === 'Y' && (w.equipped_slot === 'DEFENSE' || w.equipped_slot === 'ADAPTIVE'));

        // Calculate effective stats
        const at = offensiveWeapon ? offensiveWeapon.at : stats.attacke_basis || 8;
        const tp = offensiveWeapon ? offensiveWeapon.tp : '1w6';
        const pa = defensiveWeapon ? defensiveWeapon.pa : stats.parade_basis || 6;
        const rs = stats.ruestungsschutz || 0;

        return {
            id: player.id,
            name: player.name,
            statsId: stats.id,
            currentHP: stats.le_current,
            maxHP: stats.le_max,
            effectiveStats: {
                currentAT: at,
                currentPA: pa,
                currentRS: rs,
                currentTP: tp,
            }
        };
    } catch (error) {
        if (error.message?.includes('Incomplete')) throw error;
        throw new Error(`No character selected for the user with ID ${discordId}. Use \`/choosecharacter\`.`);
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
            const { data: player } = await supabase
                .from('players')
                .select('id')
                .eq('discord_id', user.id)
                .eq('selected', 'YES')
                .single();

            if (!player) return await interaction.respond([]);

            const { data: skills } = await supabase
                .from('player_action_modifications')
                .select(`
                    action_modification:action_modifications(id, name, action_type)
                `)
                .eq('player_id', player.id);

            const meleeSkills = (skills || [])
                .map(s => s.action_modification)
                .filter(s => s && s.action_type === 'MELEE');

            const choices = meleeSkills.map(skill => ({ name: skill.name, value: skill.id }));
            const filtered = choices.filter(choice => choice.name.toLowerCase().startsWith(focusedValue.toLowerCase()));
            
            await interaction.respond(filtered);
        } catch (error) {
            console.error('Error during maneuver autocomplete:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

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
                const { data: maneuverData } = await supabase
                    .from('action_modifications')
                    .select('*')
                    .eq('id', maneuverId)
                    .single();
                maneuver = maneuverData;
            }

            // 2. Get effective stats and apply maneuver modifiers
            let atValue = attacker.effectiveStats.currentAT;
            let paValue = target.effectiveStats.currentPA;
            let damageBonus = 0;
            let description = `**${attacker.name}** attacks **${target.name}**!\n\n`;

            if (maneuver) {
                description = `**${attacker.name}** uses **${maneuver.name}** to attack **${target.name}**!\n\n`;
                if (maneuver.rules?.at_modifier) atValue += maneuver.rules.at_modifier;
                if (maneuver.rules?.opponent_pa_modifier) paValue += maneuver.rules.opponent_pa_modifier;
                if (maneuver.rules?.damage_bonus) damageBonus += maneuver.rules.damage_bonus;
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
                    const { error: updateError } = await supabase
                        .from('stats')
                        .update({ le_current: newHP })
                        .eq('id', target.statsId);

                    if (updateError) console.error('Failed to update target HP:', updateError);
                    
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
            await interaction.editReply(`❌ ${errorMessage}`);
        }
    },
};
