const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, stats, talents, playerTalents } = require('../db/schema');
const { rollDice } = require('../utils/rollUtil');
const { createLogger } = require('../utils/logger');

const log = createLogger('probe');

const STAT_DISPLAY_NAMES = {
    MU: 'Mut',
    KL: 'Klugheit',
    IN: 'Intuition',
    CH: 'Charisma',
    FF: 'Fingerfertigkeit',
    GE: 'Gewandtheit',
    KO: 'Konstitution',
    KK: 'Körperkraft',
};

function calculateQS(remainingFtw) {
    if (remainingFtw >= 16) return 6;
    if (remainingFtw >= 13) return 5;
    if (remainingFtw >= 10) return 4;
    if (remainingFtw >= 7) return 3;
    if (remainingFtw >= 4) return 2;
    return 1;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('probe')
        .setDescription('Perform a talent probe (Talentprobe)')
        .addStringOption(option =>
            option.setName('talent').setDescription('The talent to probe').setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('modifier').setDescription('Modifier to apply to FtW (e.g., -2 for difficult, +3 for easy)')
        )
        .addBooleanOption(option => option.setName('visible').setDescription('Make the roll visible to everyone')),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const { user } = interaction;

        try {
            const [player] = await db
                .select({ id: players.id })
                .from(players)
                .where(and(eq(players.discord_id, user.id), eq(players.selected, 'YES')))
                .limit(1);

            if (!player) {
                await interaction.respond([]);
                return;
            }

            const ptRows = await db
                .select({
                    ftw: playerTalents.ftw,
                    talent_id: talents.id,
                    talent_name: talents.name,
                })
                .from(playerTalents)
                .innerJoin(talents, eq(playerTalents.talent_id, talents.id))
                .where(eq(playerTalents.player_id, player.id));

            const choices = ptRows
                .filter(pt => pt.talent_id != null)
                .map(pt => ({
                    name: `${pt.talent_name} (FtW: ${pt.ftw})`,
                    value: pt.talent_id.toString(),
                }));

            const filtered = choices.filter(c => c.name.toLowerCase().includes(focusedValue.toLowerCase()));

            await interaction.respond(filtered.slice(0, 25));
        } catch (error) {
            if (error.code === 40060) return;
            log.error({ error }, 'Autocomplete error');
            try {
                await interaction.respond([]);
            } catch {
                // Ignore - interaction may have expired
            }
        }
    },

    async execute(interaction) {
        const discordId = interaction.user.id;
        const talentId = interaction.options.getString('talent');
        const modifier = interaction.options.getInteger('modifier') || 0;
        const visible = interaction.options.getBoolean('visible') || false;

        try {
            const [player] = await db
                .select({
                    id: players.id,
                    name: players.name,
                })
                .from(players)
                .where(and(eq(players.discord_id, discordId), eq(players.selected, 'YES')))
                .limit(1);

            const [playerStats] = player
                ? await db
                      .select()
                      .from(stats)
                      .where(eq(stats.player_id, player.id))
                      .limit(1)
                : [];

            if (!player || !playerStats) {
                return interaction.reply({
                    content: '❌ No character selected! Use `/choose-character` first.',
                    ephemeral: true,
                });
            }

            const [playerTalent] = await db
                .select({
                    ftw: playerTalents.ftw,
                    talent_id: talents.id,
                    talent_name: talents.name,
                    talent_stat1: talents.stat1,
                    talent_stat2: talents.stat2,
                    talent_stat3: talents.stat3,
                })
                .from(playerTalents)
                .innerJoin(talents, eq(playerTalents.talent_id, talents.id))
                .where(
                    and(eq(playerTalents.player_id, player.id), eq(playerTalents.talent_id, parseInt(talentId)))
                )
                .limit(1);

            if (!playerTalent || playerTalent.talent_id == null) {
                return interaction.reply({
                    content: '❌ Talent not found or not learned!',
                    ephemeral: true,
                });
            }

            const talent = {
                id: playerTalent.talent_id,
                name: playerTalent.talent_name,
                stat1: playerTalent.talent_stat1,
                stat2: playerTalent.talent_stat2,
                stat3: playerTalent.talent_stat3,
            };
            const baseFtw = playerTalent.ftw;
            const effectiveFtw = baseFtw + modifier;

            const statKeys = [talent.stat1, talent.stat2, talent.stat3].map(s => s.toLowerCase());
            const attrValues = statKeys.map(key => playerStats[key] || 8);

            const rolls = [rollDice(20), rollDice(20), rollDice(20)];
            let remainingFtw = effectiveFtw;

            const checkResults = rolls.map((roll, index) => {
                const attrValue = attrValues[index];
                const diff = roll - attrValue;
                const needed = diff > 0 ? diff : 0;
                remainingFtw -= needed;

                return {
                    roll,
                    attrValue,
                    attrName: STAT_DISPLAY_NAMES[talent[`stat${index + 1}`]] || talent[`stat${index + 1}`],
                    needed,
                };
            });

            const success = remainingFtw >= 0;
            const qs = success ? calculateQS(remainingFtw) : 0;

            const embed = new EmbedBuilder()
                .setColor(success ? 0x00ff00 : 0xff4444)
                .setTitle(`🎯 ${talent.name}`)
                .setDescription(success ? `**Erfolg!** QS ${qs}` : '**Fehlschlag!**')
                .addFields(
                    {
                        name: 'Proben',
                        value: checkResults
                            .map(
                                r =>
                                    `${r.attrName}: \`${r.roll}\`/\`${r.attrValue}\`${r.needed > 0 ? ` (−${r.needed})` : ' ✓'}`
                            )
                            .join('\n'),
                        inline: false,
                    },
                    {
                        name: 'FtW',
                        value: `\`${baseFtw}\`${modifier !== 0 ? ` (${modifier >= 0 ? '+' : ''}${modifier})` : ''}`,
                        inline: true,
                    },
                    {
                        name: 'Übrig',
                        value: `\`${remainingFtw}\``,
                        inline: true,
                    },
                    {
                        name: 'QS',
                        value: `\`${qs}\``,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `${player.name} • ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                })
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                ephemeral: !visible,
            });
        } catch (error) {
            log.error({ error }, 'Probe command error');
            return interaction.reply({
                content: '❌ Failed to perform talent probe!',
                ephemeral: true,
            });
        }
    },
};
