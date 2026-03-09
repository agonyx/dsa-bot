const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const log = createLogger('delete-character');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-character')
        .setDescription('Delete one of your characters permanently'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const discordId = interaction.user.id;

        try {
            const { data: players, error } = await supabase
                .from('players')
                .select('id, name, selected')
                .eq('discord_id', discordId);

            if (error) throw error;

            if (!players || players.length === 0) {
                return interaction.editReply('❌ You do not have any characters to delete.');
            }

            if (players.length === 1) {
                const player = players[0];

                const confirmButton = new ButtonBuilder()
                    .setCustomId(`delete_confirm_${player.id}`)
                    .setLabel('Delete')
                    .setStyle(ButtonStyle.Danger);

                const cancelButton = new ButtonBuilder()
                    .setCustomId('delete_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary);

                const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

                const message = await interaction.editReply({
                    content: `⚠️ **Warning!** This will permanently delete **${player.name}**. This action cannot be undone!`,
                    components: [row],
                });

                const collector = message.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 30000,
                });

                collector.on('collect', async i => {
                    if (i.customId === 'delete_cancel') {
                        await i.update({ content: '❌ Deletion cancelled.', components: [] });
                        collector.stop();
                    } else if (i.customId.startsWith('delete_confirm_')) {
                        const playerId = i.customId.replace('delete_confirm_', '');

                        const { error: deleteError } = await supabase.from('players').delete().eq('id', playerId);

                        if (deleteError) throw deleteError;

                        await i.update({
                            content: `✅ Character **${player.name}** has been permanently deleted.`,
                            components: [],
                        });
                        collector.stop();
                    }
                });

                collector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        interaction
                            .editReply({
                                content: '⏰ Deletion confirmation timed out.',
                                components: [],
                            })
                            .catch(() => {});
                    }
                });
            } else {
                const { StringSelectMenuBuilder } = require('discord.js');

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('delete_character_select')
                    .setPlaceholder('Select a character to delete')
                    .addOptions(
                        players.map(p => ({
                            label: p.name + (p.selected === 'YES' ? ' (Selected)' : ''),
                            value: p.id,
                        }))
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);

                const message = await interaction.editReply({
                    content: 'Select the character you want to delete:',
                    components: [row],
                });

                const collector = message.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 60000,
                });

                collector.on('collect', async i => {
                    if (i.customId === 'delete_character_select') {
                        const playerId = i.values[0];
                        const player = players.find(p => p.id === playerId);

                        const confirmButton = new ButtonBuilder()
                            .setCustomId(`delete_confirm_${playerId}`)
                            .setLabel('Delete')
                            .setStyle(ButtonStyle.Danger);

                        const cancelButton = new ButtonBuilder()
                            .setCustomId('delete_cancel')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Secondary);

                        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

                        await i.update({
                            content: `⚠️ **Warning!** This will permanently delete **${player.name}**. This action cannot be undone!`,
                            components: [row],
                        });
                    } else if (i.customId === 'delete_cancel') {
                        await i.update({ content: '❌ Deletion cancelled.', components: [] });
                        collector.stop();
                    } else if (i.customId.startsWith('delete_confirm_')) {
                        const playerId = i.customId.replace('delete_confirm_', '');
                        const player = players.find(p => p.id === playerId);

                        const { error: deleteError } = await supabase.from('players').delete().eq('id', playerId);

                        if (deleteError) throw deleteError;

                        await i.update({
                            content: `✅ Character **${player.name}** has been permanently deleted.`,
                            components: [],
                        });
                        collector.stop();
                    }
                });

                collector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        interaction
                            .editReply({
                                content: '⏰ Character selection timed out.',
                                components: [],
                            })
                            .catch(() => {});
                    }
                });
            }
        } catch (error) {
            log.error({ error }, 'Delete character error');
            return interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
            });
        }
    },
};
