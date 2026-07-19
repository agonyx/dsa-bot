const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addItem } = require('../services/inventory');
const { getSelectedPlayer } = require('../services/characters');
const { createLogger } = require('../utils/logger');
const log = createLogger('add-item');

const ITEM_TYPES = [
    { name: '🧪 Potion', value: 'POTION' },
    { name: '🍖 Food/Drink', value: 'FOOD' },
    { name: '📜 Scroll', value: 'SCROLL' },
    { name: '⚔️ Weapon', value: 'WEAPON' },
    { name: '🛡️ Armor', value: 'ARMOR' },
    { name: '💎 Valuable', value: 'VALUABLE' },
    { name: '📦 Misc', value: 'MISC' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-item')
        .setDescription('Add an item to your character inventory')
        .addStringOption(option => option.setName('name').setDescription('Item name').setRequired(true))
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Item type')
                .setRequired(false)
                .addChoices(...ITEM_TYPES)
        )
        .addStringOption(option =>
            option
                .setName('effect')
                .setDescription('Effect when used (e.g., "Heal 1w6+2", "Restore 5 MP")')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('description').setDescription('Item description/flavor text').setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('quantity').setDescription('Quantity (default: 1)').setRequired(false).setMinValue(1)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const player = await getSelectedPlayer({ discordId: interaction.user.id });

            const name = interaction.options.getString('name');
            const type = interaction.options.getString('type') || 'MISC';
            const effect = interaction.options.getString('effect');
            const description = interaction.options.getString('description');
            const quantity = interaction.options.getInteger('quantity') || 1;

            // addItem stacks onto an existing same-name+type item, else creates one.
            const item = await addItem(
                { discordId: interaction.user.id },
                { name, type, effect, description, quantity }
            );

            const stacked = item.quantity > quantity;

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle(stacked ? '📦 Items Stacked' : '📦 Item Added')
                .setDescription(
                    stacked
                        ? `Added **${quantity}** to existing **${name}** in **${player.name}**'s inventory`
                        : `Added item to **${player.name}**'s inventory`
                )
                .addFields(
                    { name: 'Name', value: item.name, inline: true },
                    { name: 'Type', value: item.type, inline: true },
                    {
                        name: stacked ? 'New Quantity' : 'Quantity',
                        value: item.quantity.toString(),
                        inline: true,
                    }
                );

            if (item.effect) {
                embed.addFields({ name: 'Effect', value: item.effect, inline: false });
            }
            if (item.description) {
                embed.addFields({ name: 'Description', value: item.description, inline: false });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            log.error({ error }, 'Add item error');
            const message = error.data?.error || error.message || 'Failed to add item.';
            return interaction.editReply({ content: `❌ ${message}` });
        }
    },
};
