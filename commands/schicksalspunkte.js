const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../utils/logger');
const {
    RESOURCE_TYPES,
    getPlayerWithStats,
    spendResource,
    restoreResource,
    setResource,
    createResourceEmbed,
} = require('../utils/resourceUtils');
const log = createLogger('schicksalspunkte');

const RESOURCE = RESOURCE_TYPES.SCHICKSALSPUNKTE;
const STATS_SELECT = 'id, schicksalspunkte_current, schicksalspunkte_max';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schicksalspunkte')
        .setDescription('Manage Schicksalspunkte (Fate Points)')
        .addSubcommand(sub =>
            sub
                .setName('spend')
                .setDescription('Spend Schicksalspunkte')
                .addIntegerOption(option =>
                    option.setName('amount').setDescription('Amount to spend').setRequired(false).setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('restore')
                .setDescription('Restore Schicksalspunkte')
                .addIntegerOption(option =>
                    option.setName('amount').setDescription('Amount to restore').setRequired(false).setMinValue(1)
                )
                .addUserOption(option =>
                    option.setName('target').setDescription('Target character (defaults to yourself)')
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('set')
                .setDescription('Override current Schicksalspunkte value')
                .addIntegerOption(option =>
                    option.setName('value').setDescription('Value to set').setRequired(true).setMinValue(0)
                )
                .addUserOption(option =>
                    option.setName('target').setDescription('Target character (defaults to yourself)')
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('show')
                .setDescription('Display current Schicksalspunkte')
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
            const current = stats.schicksalspunkte_current;
            const max = stats.schicksalspunkte_max;

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
                const amount = interaction.options.getInteger('amount') || 1;
                const { newValue, error } = await spendResource(stats.id, RESOURCE, amount, current);

                if (error) {
                    return interaction.editReply({
                        content: `❌ Not enough Schicksalspunkte! (Current: ${current}/${max})`,
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
                const amount = interaction.options.getInteger('amount') || 1;
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
                        content: `ℹ️ Already at maximum Schicksalspunkte (${current}/${max})`,
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

            if (subcommand === 'set') {
                const value = interaction.options.getInteger('value');
                const { newValue, error } = await setResource(stats.id, RESOURCE, value, max);

                if (error) {
                    return interaction.editReply({ content: `❌ ${error}` });
                }

                const embed = createResourceEmbed(player.name, RESOURCE, current, newValue, max, 'set')
                    .setFooter({
                        text: `Set by ${interaction.user.username}`,
                        iconURL: interaction.user.avatarURL(),
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            log.error({ error }, 'Schicksalspunkte command error');
            return interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
            });
        }
    },
};
