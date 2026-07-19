const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, stats: statsTable } = require('../db/schema');
const { createLogger } = require('../utils/logger');
const log = createLogger('regeneration');
const { rollRegeneration } = require('../utils/regenUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('regeneration')
        .setDescription('Perform a Regenerationsphase — roll 1W6 for each energy type to recover points after rest')
        .addUserOption(option =>
            option.setName('target').setDescription('Target character (optional, defaults to yourself)')
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('target');
        const targetDiscordId = targetUser ? targetUser.id : interaction.user.id;
        const isSelf = targetDiscordId === interaction.user.id;

        try {
            const [player] = await db
                .select({ id: players.id, name: players.name })
                .from(players)
                .where(and(eq(players.discord_id, targetDiscordId), eq(players.selected, 'YES')))
                .limit(1);

            if (!player) {
                return interaction.editReply({
                    content: isSelf
                        ? '❌ No character selected! Use `/choose-character` first.'
                        : '❌ Target has no selected character.',
                });
            }

            const [stats] = await db
                .select({
                    id: statsTable.id,
                    le_current: statsTable.le_current,
                    le_max: statsTable.le_max,
                    asp_current: statsTable.asp_current,
                    asp_max: statsTable.asp_max,
                    kap_current: statsTable.kap_current,
                    kap_max: statsTable.kap_max,
                })
                .from(statsTable)
                .where(eq(statsTable.player_id, player.id))
                .limit(1);

            if (!stats) {
                return interaction.editReply({
                    content: isSelf
                        ? '❌ No character selected! Use `/choose-character` first.'
                        : '❌ Target has no selected character.',
                });
            }

            // Check if already at full resources
            const isFullHp = stats.le_current >= stats.le_max;
            const isFullAsp = stats.asp_max === 0 || stats.asp_current >= stats.asp_max;
            const isFullKap = stats.kap_max === 0 || stats.kap_current >= stats.kap_max;

            if (isFullHp && isFullAsp && isFullKap) {
                return interaction.editReply({
                    content: `ℹ️ **${player.name}** is already fully rested! All resources are at maximum.`,
                });
            }

            // Roll regeneration
            const { results } = rollRegeneration(stats);

            // Build DB update object from results (only changed values)
            const updateObj = {};
            for (const r of results) {
                if (r.newValue !== r.oldValue) {
                    switch (r.type) {
                        case 'lep':
                            updateObj.le_current = r.newValue;
                            break;
                        case 'asp':
                            updateObj.asp_current = r.newValue;
                            break;
                        case 'kap':
                            updateObj.kap_current = r.newValue;
                            break;
                    }
                }
            }

            // Update DB if anything changed
            if (Object.keys(updateObj).length > 0) {
                await db.update(statsTable).set(updateObj).where(eq(statsTable.id, stats.id));
            }

            // Build embed
            const embed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle(`🌙 Regenerationsphase — ${player.name}`)
                .setDescription(`After a period of rest, **${player.name}** recovers energy.`)
                .setFooter({
                    text: `Regeneration by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                })
                .setTimestamp();

            for (const r of results) {
                const filledBlocks = Math.round((r.newValue / r.maxValue) * 10);
                const resourceBar = '■'.repeat(filledBlocks) + '□'.repeat(10 - filledBlocks);
                const modifierDisplay =
                    r.modifier !== 0 ? ` (${r.modifier >= 0 ? '+' : ''}${r.modifier} = ${r.effective})` : '';

                embed.addFields({
                    name: `${r.emoji} ${r.label}`,
                    value: `🎲 Roll: **${r.roll}**${modifierDisplay}\n${r.oldValue} → **${r.newValue}** / ${r.maxValue}\n${resourceBar}`,
                });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            log.error({ error }, 'Regeneration command error');
            return interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
            });
        }
    },
};
