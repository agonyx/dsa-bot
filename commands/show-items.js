const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
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

            const { data: player, error } = await supabase
                .from('players')
                .select(
                    `
                    id,
                    name,
                    avatar,
                    items:items(*)
                `
                )
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (error || !player || !player.id) {
                return interaction.reply({
                    content:
                        'You have not selected a player yet. Use the /choose-character command to select a player.',
                    ephemeral: true,
                });
            }

            const items = player.items;

            if (!items || items.length === 0) {
                return interaction.reply({
                    content: 'Your selected player does not have any items.',
                    ephemeral: true,
                });
            }

            const itemsEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`🎒 ${player.name} - Inventory`)
                .setDescription(`**${items.length} item${items.length !== 1 ? 's' : ''} in inventory**`)
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                });

            // Group items by type
            const groupedItems = {};
            items.forEach(item => {
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

            if (player.avatar) {
                try {
                    const { data: avatarData, error: avatarError } = await supabase.storage
                        .from('avatars')
                        .download(player.avatar);

                    if (!avatarError && avatarData) {
                        const attachment = new AttachmentBuilder(Buffer.from(await avatarData.arrayBuffer()), {
                            name: 'avatar.png',
                        });
                        itemsEmbed.setThumbnail('attachment://avatar.png');
                        return interaction.reply({ embeds: [itemsEmbed], files: [attachment], ephemeral: !visible });
                    }
                } catch (e) {
                    // Avatar fetch failed, continue without
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
