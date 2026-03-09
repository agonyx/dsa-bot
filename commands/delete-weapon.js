const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const log = createLogger('delete-weapon');

module.exports = {
    data: new SlashCommandBuilder().setName('delete-weapon').setDescription('Delete a weapon from your character'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const { data: player, error } = await supabase
                .from('players')
                .select(
                    `
                    id,
                    name,
                    weapons:weapons(*)
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

            if (!player.weapons || player.weapons.length === 0) {
                return interaction.editReply({
                    content: 'Your character has no weapons to delete.',
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('delete_weapon_select')
                .setPlaceholder('Select a weapon to delete')
                .addOptions(
                    player.weapons.map(w => ({
                        label: w.name,
                        description: `${w.type} | TP: ${w.tp} | AT: ${w.at} | PA: ${w.pa}`,
                        value: w.id.toString(),
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const message = await interaction.editReply({
                content: `Select a weapon to delete from **${player.name}**:`,
                components: [row],
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000,
            });

            collector.on('collect', async i => {
                if (i.customId === 'delete_weapon_select') {
                    const weaponId = i.values[0];
                    const weapon = player.weapons.find(w => w.id.toString() === weaponId);

                    const { error: deleteError } = await supabase.from('weapons').delete().eq('id', weaponId);

                    if (deleteError) throw deleteError;

                    await i.update({
                        content: `✅ **${weapon.name}** has been deleted from **${player.name}**.`,
                        components: [],
                    });
                    collector.stop();
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction
                        .editReply({
                            content: '⏰ Weapon selection timed out.',
                            components: [],
                        })
                        .catch(() => {});
                }
            });
        } catch (error) {
            log.error({ error }, 'Delete weapon error');
            interaction.editReply({
                content: '❌ Failed to delete weapon.',
            });
        }
    },
};
