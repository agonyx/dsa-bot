const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { rollDice } = require('../utils/rollUtil');
const { createLogger } = require('../utils/logger');

const log = createLogger('check');

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
        .setName('check')
        .setDescription('Perform a talent check (Talentprobe)')
        .addStringOption(option =>
            option
                .setName('talent')
                .setDescription('The talent to check')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option
                .setName('modifier')
                .setDescription('Modifier to apply to FtW (e.g., -2 for difficult, +3 for easy)')
        )
        .addBooleanOption(option =>
            option.setName('visible').setDescription('Make the roll visible to everyone')
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const { user } = interaction;

        try {
            const { data: player, error: playerError } = await supabase
                .from('players')
                .select('id')
                .eq('discord_id', user.id)
                .eq('selected', 'YES')
                .single();

            if (playerError || !player) {
                await interaction.respond([]);
                return;
            }

            const { data: playerTalents, error: talentsError } = await supabase
                .from('player_talents')
                .select(
                    `
                    ftw,
                    talent:talents(id, name)
                `
                )
                .eq('player_id', player.id);

            if (talentsError) {
                log.error({ talentsError }, 'Failed to fetch talents');
                await interaction.respond([]);
                return;
            }

            const choices = (playerTalents || [])
                .filter(pt => pt.talent)
                .map(pt => ({
                    name: `${pt.talent.name} (FtW: ${pt.ftw})`,
                    value: pt.talent.id.toString(),
                }));

            const filtered = choices.filter(c =>
                c.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            await interaction.respond(filtered.slice(0, 25));
        } catch (error) {
            if (error.code === 40060) return;
            log.error({ error }, 'Autocomplete error');
            try {
                await interaction.respond([]);
            } catch {}
        }
    },

    async execute(interaction) {
        const discordId = interaction.user.id;
        const talentId = interaction.options.getString('talent');
        const modifier = interaction.options.getInteger('modifier') || 0;
        const visible = interaction.options.getBoolean('visible') || false;

        try {
            const { data: player, error: playerError } = await supabase
                .from('players')
                .select(
                    `
                    id,
                    name,
                    stats:stats(*)
                `
                )
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (playerError || !player?.stats) {
                return interaction.reply({
                    content: '❌ No character selected! Use `/choose-character` first.',
                    ephemeral: true,
                });
            }

            const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;

            const { data: playerTalent, error: talentError } = await supabase
                .from('player_talents')
                .select(
                    `
                    ftw,
                    talent:talents(id, name, stat1, stat2, stat3)
                `
                )
                .eq('player_id', player.id)
                .eq('talent_id', parseInt(talentId))
                .single();

            if (talentError || !playerTalent?.talent) {
                return interaction.reply({
                    content: '❌ Talent not found or not learned!',
                    ephemeral: true,
                });
            }

            const talent = playerTalent.talent;
            const baseFtw = playerTalent.ftw;
            const effectiveFtw = baseFtw + modifier;

            const statKeys = [talent.stat1, talent.stat2, talent.stat3].map(s => s.toLowerCase());
            const attrValues = statKeys.map(key => stats[key] || 8);

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
            log.error({ error }, 'Check command error');
            return interaction.reply({
                content: '❌ Failed to perform talent check!',
                ephemeral: true,
            });
        }
    },
};
