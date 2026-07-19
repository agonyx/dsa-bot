const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../utils/logger');
const {
    RESOURCE_TYPES,
    getPlayerWithStats,
    spendResource,
    restoreResource,
    createResourceEmbed,
} = require('../utils/resourceUtils');
const log = createLogger('asp');

const RESOURCE = RESOURCE_TYPES.ASP;
const STATS_SELECT = 'id, asp_current, asp_max';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('asp')
        .setDescription('Manage Astralpunkte (Astral Points)')
        .addSubcommand(sub =>
            sub
                .setName('spend')
                .setDescription('Spend Astralpunkte')
                .addIntegerOption(option =>
                    option.setName('amount').setDescription('Amount to spend').setRequired(true).setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('restore')
                .setDescription('Restore Astralpunkte')
                .addIntegerOption(option =>
                    option.setName('amount').setDescription('Amount to restore').setRequired(true).setMinValue(1)
                )
                .addUserOption(option =>
                    option.setName('target').setDescription('Target character (defaults to yourself)')
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('show')
                .setDescription('Display current Astralpunkte')
                .addUserOption(option =>
                    option.setName('target').setDescription('Target character (defaults to yourself)')
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('target');
        const targetId = targetUser?.id || interaction.user.id;
        const isSelf = targetId === interaction.user.id;

        try {
            const result = await getPlayerWithStats(targetId, STATS_SELECT);

            if (!result) {
                return interaction.editReply({
                    content: isSelf
                        ? '❌ No character selected! Use `/choose-character` first.'
                        : '❌ Target has no selected character.',
                });
            }

            const { player, stats } = result;
            const current = stats.asp_current;
            const max = stats.asp_max;

            // Characters without Astralenergie have asp_max = 0
            if (max === 0) {
                return interaction.editReply({
                    content: '❌ This character has no Astralenergie. Only Zauberer (spellcasters) have AsP.',
                });
            }

            if (subcommand === 'show') {
                const embed = createResourceEmbed(player.name, RESOURCE, current, current, max, 'show')
                    .setFooter({
                        text: `Requested by ${interaction.user.username}`,
                        iconURL: interaction.user.avatarURL(),
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (subcommand === 'spend') {
                const amount = interaction.options.getInteger('amount');
                const { newValue, error } = await spendResource(stats.id, RESOURCE, amount, current);

                if (error) {
                    return interaction.editReply({
                        content: `❌ Not enough Astralpunkte! (Current: ${current}/${max})`,
                    });
                }

                const embed = createResourceEmbed(player.name, RESOURCE, current, newValue, max, 'spend')
                    .setFooter({
                        text: `Used by ${interaction.user.username}`,
                        iconURL: interaction.user.avatarURL(),
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (subcommand === 'restore') {
                const amount = interaction.options.getInteger('amount');
                const { newValue, actualAmount, error } = await restoreResource(
                    stats.id,
                    RESOURCE,
                    amount,
                    current,
                    max
                );

                if (error) {
                    return interaction.editReply({ content: `❌ ${error}` });
                }

                if (actualAmount === 0) {
                    return interaction.editReply({
                        content: `ℹ️ Already at maximum Astralpunkte (${current}/${max})`,
                    });
                }

                const embed = createResourceEmbed(player.name, RESOURCE, current, newValue, max, 'restore')
                    .setFooter({
                        text: `Restored by ${interaction.user.username}`,
                        iconURL: interaction.user.avatarURL(),
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            log.error({ error }, 'AsP command error');
            return interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
            });
        }
    },
};
