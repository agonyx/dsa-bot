const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, stats: statsTable } = require('../db/schema');
const { readAvatar } = require('../utils/avatarStorage');
const { createLogger } = require('../utils/logger');
const log = createLogger('show-stats');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('show-stats')
        .setDescription("Displays your character's current statistics")
        .addBooleanOption(option => option.setName('visible').setDescription('Make the response visible to everyone')),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;
            const visible = interaction.options.getBoolean('visible') || false;

            const [player] = await db
                .select({ id: players.id, name: players.name, avatar: players.avatar })
                .from(players)
                .where(and(eq(players.discord_id, discordId), eq(players.selected, 'YES')))
                .limit(1);

            if (!player) {
                return interaction.reply({
                    content: '❌ No character selected! Use `/choose-character` first.',
                    ephemeral: true,
                });
            }

            const [stats] = await db
                .select()
                .from(statsTable)
                .where(eq(statsTable.player_id, player.id))
                .limit(1);

            if (!stats) {
                return interaction.reply({
                    content: '❌ No stats found for this character!',
                    ephemeral: true,
                });
            }

            const maxLP = stats.le_max || 1;
            const currentLP = stats.le_current;
            const healthPercentage = Math.floor((currentLP / maxLP) * 100);
            const healthBar =
                '■'.repeat(Math.round((currentLP / maxLP) * 10)) +
                '□'.repeat(10 - Math.round((currentLP / maxLP) * 10));

            const statsEmbed = new EmbedBuilder()
                .setColor(0x2f3136)
                .setTitle(`🔰 ${player.name}'s Statistics`)
                .setDescription(
                    `**Character Overview**\n${healthBar} **${healthPercentage}%** (${currentLP}/${maxLP} LP)`
                )
                .addFields(
                    {
                        name: '🧠 Attributes',
                        value: [
                            `**MU:** \`${stats.mu}\``,
                            `**KL:** \`${stats.kl}\``,
                            `**IN:** \`${stats.in}\``,
                            `**CH:** \`${stats.ch}\``,
                        ].join('\n'),
                        inline: true,
                    },
                    {
                        name: '⚔️ Combat Stats',
                        value: [
                            `**FF:** \`${stats.ff}\``,
                            `**GE:** \`${stats.ge}\``,
                            `**KO:** \`${stats.ko}\``,
                            `**KK:** \`${stats.kk}\``,
                        ].join('\n'),
                        inline: true,
                    },
                    {
                        name: '🛡️ Defense',
                        value: [
                            `**Initiative:** \`${stats.initiative}\``,
                            `**Ausweichen:** \`${stats.ausweichen}\``,
                            `**Max LP:** \`${stats.le_max}\``,
                            `**Current LP:** \`${stats.le_current}\``,
                        ].join('\n'),
                        inline: true,
                    }
                );

            // Build resource lines
            const resourceLines = [];

            // Schicksalspunkte (always)
            const schipsBar =
                '■'.repeat(Math.round((stats.schicksalspunkte_current / Math.max(1, stats.schicksalspunkte_max)) * 5)) +
                '□'.repeat(
                    5 - Math.round((stats.schicksalspunkte_current / Math.max(1, stats.schicksalspunkte_max)) * 5)
                );
            resourceLines.push(
                `🎲 **SchP:** ${schipsBar} ${stats.schicksalspunkte_current}/${stats.schicksalspunkte_max}`
            );

            // AsP (only if spellcaster)
            if (stats.asp_max > 0) {
                const aspBar =
                    '■'.repeat(Math.round((stats.asp_current / stats.asp_max) * 10)) +
                    '□'.repeat(10 - Math.round((stats.asp_current / stats.asp_max) * 10));
                resourceLines.push(`✨ **AsP:** ${aspBar} ${stats.asp_current}/${stats.asp_max}`);
            }

            // KaP (only if blessed)
            if (stats.kap_max > 0) {
                const kapBar =
                    '■'.repeat(Math.round((stats.kap_current / stats.kap_max) * 10)) +
                    '□'.repeat(10 - Math.round((stats.kap_current / stats.kap_max) * 10));
                resourceLines.push(`🙏 **KaP:** ${kapBar} ${stats.kap_current}/${stats.kap_max}`);
            }

            statsEmbed
                .addFields({
                    name: '📊 Resources',
                    value: resourceLines.join('\n'),
                    inline: false,
                })
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                });

            const files = [];
            if (player.avatar) {
                try {
                    const avatarBuffer = await readAvatar(player.avatar);

                    if (avatarBuffer) {
                        files.push(new AttachmentBuilder(avatarBuffer, { name: 'avatar.png' }));
                        statsEmbed.setThumbnail('attachment://avatar.png');
                    }
                } catch (e) {
                    // Avatar fetch failed, continue without it
                }
            }

            return interaction.reply({
                embeds: [statsEmbed],
                files: files,
                ephemeral: !visible,
            });
        } catch (error) {
            log.error({ error }, 'Showstats error');
            return interaction.reply({
                content: '❌ Failed to retrieve character stats!',
                ephemeral: true,
            });
        }
    },
};
