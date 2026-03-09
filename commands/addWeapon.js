const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addweapon')
        .setDescription('Add a new weapon to your character')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Weapon name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Weapon type')
                .setRequired(true)
                .addChoices(
                    { name: 'MELEE', value: 'MELEE' },
                    { name: 'RANGED', value: 'RANGED' }
                ))
        .addStringOption(option =>
            option.setName('tp')
                .setDescription('Damage formula (e.g., 1w6+3)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('at')
                .setDescription('Attack value')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('pa')
                .setDescription('Parry value')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('equipped')
                .setDescription('Equip this weapon?')
                .addChoices(
                    { name: 'Y', value: 'Y' },
                    { name: 'N', value: 'N' }
                ))
        .addStringOption(option =>
            option.setName('slot')
                .setDescription('Equipment slot')
                .addChoices(
                    { name: 'ADAPTIVE', value: 'ADAPTIVE' },
                    { name: 'OFFENSE', value: 'OFFENSE' },
                    { name: 'DEFENSE', value: 'DEFENSE' }
                )),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;
            const weaponData = {
                name: interaction.options.getString('name'),
                type: interaction.options.getString('type'),
                tp: interaction.options.getString('tp'),
                at: interaction.options.getInteger('at'),
                pa: interaction.options.getInteger('pa'),
                is_equipped: interaction.options.getString('equipped') || 'N',
                equipped_slot: interaction.options.getString('slot') || null
            };

            // Validate TP format (supports: 1w6, 1W6, W6, 1w6+3, 1w6 - 2, etc.)
            if (!/^\d+[wW]\d+(\s*[\+\-]\s*\d+)?$/.test(weaponData.tp)) {
                return interaction.reply({
                    content: 'Invalid TP format! Use format like 1w6+3, 1W6-2, or W6',
                    ephemeral: true
                });
            }

            // Validate equipped slot logic
            if (weaponData.is_equipped === 'Y' && !weaponData.equipped_slot) {
                return interaction.reply({
                    content: 'You must select a slot when equipping a weapon!',
                    ephemeral: true
                });
            }

            // Get selected player
            const { data: player, error: playerError } = await supabase
                .from('players')
                .select('id')
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (playerError || !player) {
                return interaction.reply({
                    content: 'No selected character! Use /choosecharacter first',
                    ephemeral: true
                });
            }

            // Create weapon
            const { data: weapon, error: weaponError } = await supabase
                .from('weapons')
                .insert({
                    ...weaponData,
                    player_id: player.id
                })
                .select()
                .single();

            if (weaponError) throw weaponError;

            // Build embed response
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('Weapon Added Successfully')
                .addFields(
                    { name: 'Name', value: weapon.name, inline: true },
                    { name: 'Type', value: weapon.type, inline: true },
                    { name: 'TP', value: weapon.tp, inline: true },
                    { name: 'AT', value: weapon.at.toString(), inline: true },
                    { name: 'PA', value: weapon.pa.toString(), inline: true },
                    { name: 'Equipped', value: weapon.is_equipped, inline: true },
                    { name: 'Slot', value: weapon.equipped_slot || 'None', inline: true }
                );

            interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Add weapon error:', error);
            interaction.reply({
                content: 'Failed to add weapon. Please check your input and try again.',
                ephemeral: true
            });
        }
    }
};
