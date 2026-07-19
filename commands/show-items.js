const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, items } = require('../db/schema');
const { readAvatar } = require('../utils/avatarStorage');
const { createLogger } = require('../utils/logger');
const log = createLogger('show-items');

const TYPE_EMOJIS = {
    POTION: '🧪',
    FOOD: '🍖',
    SCROLL: '📜',
    WEAPON: '⚔️',
    ARMOR: '🛡️',
    VALUABLE: '💎',
    MISC: '📦',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('show-items')
        .setDescription('Displays the items of your selected character.')
        .addBooleanOption(option =>
            option.setName('visible').setDescription('Make the response visible to everyone in the channel.')
        ),

    async execute(interaction) {
        try {
            const discordId = interaction.user.id;
            const visible = interaction.options.getBoolean('visible', false);

            const [playerRow] = await db
                .select({ id: players.id, name: players.name, avatar: players.avatar })
                .from(players)
                .where(and(eq(players.discord_id, discordId), eq(players.selected, 'YES')))
                .limit(1);

            if (!playerRow || !playerRow.id) {
                return interaction.reply({
                    content:
                        'You have not selected a player yet. Use the /choose-character command to select a player.',
                    ephemeral: true,
                });
            }

            // Separate query for the items relation (Drizzle can't nest like PostgREST).
            const playerItems = await db.select().from(items).where(eq(items.player_id, playerRow.id));

            const player = { ...playerRow, items: playerItems };

            const itemsList = player.items;

            if (!itemsList || itemsList.length === 0) {
                return interaction.reply({
                    content: 'Your selected player does not have any items.',
                    ephemeral: true,
                });
            }

            const itemsEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`🎒 ${player.name} - Inventory`)
                .setDescription(`**${itemsList.length} item${itemsList.length !== 1 ? 's' : ''} in inventory**`)
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                });

            // Group items by type
            const groupedItems = {};
            itemsList.forEach(item => {
                const type = item.type || 'MISC';
                if (!groupedItems[type]) groupedItems[type] = [];
                groupedItems[type].push(item);
            });

            // Add fields for each type group
            Object.entries(groupedItems).forEach(([type, typeItems]) => {
                const emoji = TYPE_EMOJIS[type] || '📦';
                const value = typeItems
                    .map(item => {
                        let itemText = `**${item.name}**`;
                        if (item.quantity && item.quantity > 1) {
                            itemText += ` x${item.quantity}`;
                        }
                        if (item.effect) {
                            itemText += `\n  └ *${item.effect}*`;
                        } else if (item.description) {
                            itemText += `\n  └ *${item.description.substring(0, 50)}${item.description.length > 50 ? '...' : ''}*`;
                        }
                        return itemText;
                    })
                    .join('\n');

                itemsEmbed.addFields({
                    name: `${emoji} ${type}`,
                    value: value,
                    inline: false,
                });
            });

            if (playerRow.avatar) {
                try {
                    const avatarBuffer = await readAvatar(playerRow.avatar);
                    if (avatarBuffer) {
                        const attachment = new AttachmentBuilder(avatarBuffer, { name: 'avatar.png' });
                        itemsEmbed.setThumbnail('attachment://avatar.png');
                        return interaction.reply({ embeds: [itemsEmbed], files: [attachment], ephemeral: !visible });
                    }
                } catch (e) {
                    // Avatar fetch failed, continue without it
                }
            }

            return interaction.reply({ embeds: [itemsEmbed], ephemeral: !visible });
        } catch (error) {
            log.error({ error }, 'Error showing items');
            return interaction.reply({
                content: 'There was an error while fetching your items.',
                ephemeral: true,
            });
        }
    },
};
