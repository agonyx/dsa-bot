const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, weapons } = require('../db/schema');
const { createLogger } = require('../utils/logger');
const log = createLogger('delete-weapon');

module.exports = {
    data: new SlashCommandBuilder().setName('delete-weapon').setDescription('Delete a weapon from your character'),

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

            player.weapons = await db
                .select()
                .from(weapons)
                .where(eq(weapons.player_id, player.id));

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

                    await db.delete(weapons).where(eq(weapons.id, parseInt(weaponId)));

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
