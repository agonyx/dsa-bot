const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

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
                isEquipped: interaction.options.getString('equipped') || 'N',
                equippedSlot: interaction.options.getString('slot') || null
            };

            // Validate TP format
            if (!/^\d+w\d+(\+\d+)?$/.test(weaponData.tp)) {
                return interaction.reply({
                    content: 'Invalid TP format! Use format like 1w6+3',
                    ephemeral: true
                });
            }

            // Validate equipped slot logic
            if (weaponData.isEquipped === 'Y' && !weaponData.equippedSlot) {
                return interaction.reply({
                    content: 'You must select a slot when equipping a weapon!',
                    ephemeral: true
                });
            }

            // Get selected player
            const playerResponse = await axios.get(
                `${process.env.BACKEND_URL}/player/selected/${discordId}`
            );

            if (!playerResponse.data) {
                return interaction.reply({
                    content: 'No selected character! Use /choosecharacter first',
                    ephemeral: true
                });
            }

            // Create weapon through API
            const response = await axios.post(
                `${process.env.BACKEND_URL}/weapon`,
                {
                    ...weaponData,
                    player: {
                        id: playerResponse.data.id
                    }
                }
            );
            // Build embed response
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('Weapon Added Successfully')
                .addFields(
                    { name: 'Name', value: response.data.name, inline: true },
                    { name: 'Type', value: response.data.type, inline: true },
                    { name: 'TP', value: response.data.tp, inline: true },
                    { name: 'AT', value: response.data.at.toString(), inline: true },
                    { name: 'PA', value: response.data.pa.toString(), inline: true },
                    { name: 'Equipped', value: response.data.isEquipped, inline: true },
                    { name: 'Slot', value: response.data.equippedSlot || 'None', inline: true }
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