const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addWeapon } = require('../services/inventory');
const { createLogger } = require('../utils/logger');
const log = createLogger('add-weapon');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-weapon')
        .setDescription('Add a new weapon to your character')
        .addStringOption(option => option.setName('name').setDescription('Weapon name').setRequired(true))
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Weapon type')
                .setRequired(true)
                .addChoices({ name: 'MELEE', value: 'MELEE' }, { name: 'RANGED', value: 'RANGED' })
        )
        .addStringOption(option =>
            option.setName('tp').setDescription('Damage formula (e.g., 1w6+3)').setRequired(true)
        )
        .addIntegerOption(option => option.setName('at').setDescription('Attack value').setRequired(true))
        .addIntegerOption(option => option.setName('pa').setDescription('Parry value').setRequired(true))
        .addStringOption(option =>
            option
                .setName('equipped')
                .setDescription('Equip this weapon?')
                .addChoices({ name: 'Y', value: 'Y' }, { name: 'N', value: 'N' })
        )
        .addStringOption(option =>
            option
                .setName('slot')
                .setDescription('Equipment slot')
                .addChoices(
                    { name: 'ADAPTIVE', value: 'ADAPTIVE' },
                    { name: 'OFFENSE', value: 'OFFENSE' },
                    { name: 'DEFENSE', value: 'DEFENSE' }
                )
        ),
    async execute(interaction) {
        try {
            const weapon = await addWeapon(
                { discordId: interaction.user.id },
                {
                    name: interaction.options.getString('name'),
                    type: interaction.options.getString('type'),
                    tp: interaction.options.getString('tp'),
                    at: interaction.options.getInteger('at'),
                    pa: interaction.options.getInteger('pa'),
                    is_equipped: interaction.options.getString('equipped') || 'N',
                    equipped_slot: interaction.options.getString('slot') || null,
                }
            );

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
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
            log.error({ error }, 'Add weapon error');
            const message = error.data?.error || error.message || 'Failed to add weapon.';
            interaction.reply({ content: `❌ ${message}`, ephemeral: true });
        }
    },
};
