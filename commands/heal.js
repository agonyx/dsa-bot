const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const log = createLogger('heal');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heal')
        .setDescription('Heal your character or another character (DM only for others)')
        .addIntegerOption(option =>
            option.setName('amount').setDescription('Amount of HP to restore').setRequired(true).setMinValue(1)
        )
        .addUserOption(option =>
            option.setName('target').setDescription('Target character to heal (optional, defaults to yourself)')
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('target');
        const isHealingSelf = !targetUser || targetUser.id === interaction.user.id;

        try {
            let targetDiscordId;

            if (isHealingSelf) {
                targetDiscordId = interaction.user.id;
            } else {
                targetDiscordId = targetUser.id;
            }

            const { data: player, error } = await supabase
                .from('players')
                .select(
                    `
                    id,
                    name,
                    stats:stats(id, le_max, le_current)
                `
                )
                .eq('discord_id', targetDiscordId)
                .eq('selected', 'YES')
                .single();

            if (error || !player?.stats) {
                return interaction.editReply({
                    content: isHealingSelf
                        ? '❌ No character selected! Use `/choose-character` first.'
                        : '❌ Target has no selected character.',
                });
            }

            const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;
            const currentHP = stats.le_current;
            const maxHP = stats.le_max;
            const newHP = Math.min(currentHP + amount, maxHP);
            const actualHeal = newHP - currentHP;

            if (actualHeal === 0) {
                return interaction.editReply({
                    content: `**${player.name}** is already at full health! (${currentHP}/${maxHP} HP)`,
                });
            }

            const { error: updateError } = await supabase
                .from('stats')
                .update({ le_current: newHP })
                .eq('id', stats.id);

            if (updateError) throw updateError;

            const healthBar =
                '■'.repeat(Math.round((newHP / maxHP) * 10)) + '□'.repeat(10 - Math.round((newHP / maxHP) * 10));
            const healthPercentage = Math.round((newHP / maxHP) * 100);

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('💚 Healing Applied')
                .setDescription(`**${player.name}** has been healed!`)
                .addFields(
                    { name: 'Healing', value: `+${actualHeal} HP`, inline: true },
                    { name: 'Previous HP', value: `${currentHP}/${maxHP}`, inline: true },
                    { name: 'Current HP', value: `${newHP}/${maxHP}`, inline: true }
                )
                .addFields({
                    name: 'Health Bar',
                    value: `${healthBar} **${healthPercentage}%**`,
                })
                .setFooter({
                    text: `Healed by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            log.error({ error }, 'Heal command error');
            return interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
            });
        }
    },
};
