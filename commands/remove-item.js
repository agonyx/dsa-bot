const {
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const log = createLogger('remove-item');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove-item')
        .setDescription('Remove an item from your character inventory'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const { data: player, error } = await supabase
                .from('players')
                .select(
                    `
                    id,
                    name,
                    items:items(*)
                `
                )
                .eq('discord_id', interaction.user.id)
                .eq('selected', 'YES')
                .single();

            if (error || !player) {
                return interaction.editReply({
                    content: 'No selected character! Use /choose-character first',
                });
            }

            if (!player.items || player.items.length === 0) {
                return interaction.editReply({
                    content: 'Your character has no items to remove.',
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('remove_item_select')
                .setPlaceholder('Select an item to remove')
                .addOptions(
                    player.items.map(item => ({
                        label: item.name,
                        description: `Type: ${item.type || 'N/A'} | Qty: ${item.quantity || 1}`,
                        value: item.id.toString(),
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const message = await interaction.editReply({
                content: `Select an item to remove from **${player.name}**:`,
                components: [row],
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000,
            });

            collector.on('collect', async i => {
                if (i.customId === 'remove_item_select') {
                    const itemId = i.values[0];
                    const item = player.items.find(item => item.id.toString() === itemId);

                    const confirmButton = new ButtonBuilder()
                        .setCustomId(`remove_confirm_${itemId}`)
                        .setLabel('Remove')
                        .setStyle(ButtonStyle.Danger);

                    const cancelButton = new ButtonBuilder()
                        .setCustomId('remove_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary);

                    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

                    await i.update({
                        content: `⚠️ Remove **${item.name}** (Qty: ${item.quantity || 1}) from inventory?`,
                        components: [row],
                    });
                } else if (i.customId === 'remove_cancel') {
                    await i.update({ content: '❌ Removal cancelled.', components: [] });
                    collector.stop();
                } else if (i.customId.startsWith('remove_confirm_')) {
                    const itemId = i.customId.replace('remove_confirm_', '');
                    const item = player.items.find(item => item.id.toString() === itemId);

                    const { error: deleteError } = await supabase.from('items').delete().eq('id', itemId);

                    if (deleteError) throw deleteError;

                    await i.update({
                        content: `✅ **${item.name}** has been removed from **${player.name}**'s inventory.`,
                        components: [],
                    });
                    collector.stop();
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction
                        .editReply({
                            content: '⏰ Item selection timed out.',
                            components: [],
                        })
                        .catch(() => {});
                }
            });
        } catch (error) {
            log.error({ error }, 'Remove item error');
            interaction.editReply({
                content: '❌ Failed to remove item.',
            });
        }
    },
};
