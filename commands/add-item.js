const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, items } = require('../db/schema');
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
            const [player] = await db
                .select({ id: players.id, name: players.name })
                .from(players)
                .where(and(eq(players.discord_id, interaction.user.id), eq(players.selected, 'YES')))
                .limit(1);

            if (!player) {
                return interaction.editReply({
                    content: 'No selected character! Use /choose-character first',
                });
            }

            const name = interaction.options.getString('name');
            const type = interaction.options.getString('type') || 'MISC';
            const effect = interaction.options.getString('effect');
            const description = interaction.options.getString('description');
            const quantity = interaction.options.getInteger('quantity') || 1;

            // Check for existing item with same name and type (stacking)
            const [existingItem] = await db
                .select()
                .from(items)
                .where(and(eq(items.player_id, player.id), eq(items.name, name), eq(items.type, type)))
                .limit(1);

            if (existingItem) {
                // Stack: increment quantity
                const newQuantity = (existingItem.quantity || 1) + quantity;

                const [updatedItem] = await db
                    .update(items)
                    .set({ quantity: newQuantity })
                    .where(eq(items.id, existingItem.id))
                    .returning();

                const embed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('📦 Items Stacked')
                    .setDescription(`Added **${quantity}** to existing **${name}** in **${player.name}**'s inventory`)
                    .addFields(
                        { name: 'Name', value: updatedItem.name, inline: true },
                        { name: 'Type', value: updatedItem.type, inline: true },
                        { name: 'New Quantity', value: newQuantity.toString(), inline: true }
                    );

                return interaction.editReply({ embeds: [embed] });
            }

            // Create new item
            const itemData = {
                name,
                type,
                effect,
                description,
                quantity,
                player_id: player.id,
            };

            const [item] = await db.insert(items).values(itemData).returning();

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('📦 Item Added')
                .setDescription(`Added item to **${player.name}**'s inventory`)
                .addFields(
                    { name: 'Name', value: item.name, inline: true },
                    { name: 'Type', value: item.type, inline: true },
                    { name: 'Quantity', value: item.quantity.toString(), inline: true }
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
            return interaction.editReply({
                content: `❌ Failed to add item: ${error.message}`,
            });
        }
    },
};
