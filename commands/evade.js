const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { rollDice } = require('../utils/rollUtil');
const { createLogger } = require('../utils/logger');
const log = createLogger('evade');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('evade')
        .setDescription('Attempt to dodge an attack using your Ausweichen skill'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const discordId = interaction.user.id;

            const { data: player, error } = await supabase
                .from('players')
                .select(
                    `
                    id,
                    name,
                    avatar,
                    stats:stats(ausweichen)
                `
                )
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (error || !player?.stats) {
                return interaction.editReply({
                    content: '❌ No character selected! Use `/choose-character` first.',
                });
            }

            const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;
            const { ausweichen } = stats;
            const diceRoll = rollDice(20);
            const success = diceRoll <= ausweichen;

            const successIndicator = success ? '🟢 SUCCESS' : '🔴 FAILURE';
            const diceComparison = `${diceRoll}${success ? ' ≤ ' : ' > '}${ausweichen}`;
            const successChance = `${Math.round((ausweichen / 20) * 100)}% evasion chance`;

            const embed = new EmbedBuilder()
                .setColor(success ? 0x57f287 : 0xed4245)
                .setTitle(`🛡️ Evasion Attempt - ${successIndicator}`)
                .setDescription(
                    [
                        `**${player.name}** rolled a D20 to evade!`,
                        '',
                        `🎲 **Roll:** \`${diceComparison}\``,
                        `📊 **Base Chance:** \`${successChance}\``,
                    ].join('\n')
                )
                .addFields({
                    name: 'Details',
                    value: [
                        `✦ **Ausweichen:** \`${ausweichen}\``,
                        `✦ **Dice Result:** \`${diceRoll}\``,
                        `✦ **Outcome:** ${success ? '**Evaded!**' : '**Hit!**'}`,
                    ].join('\n'),
                    inline: true,
                })
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                })
                .setTimestamp();

            const files = [];
            if (player.avatar) {
                try {
                    const { data: avatarData, error: avatarError } = await supabase.storage
                        .from('avatars')
                        .download(player.avatar);

                    if (!avatarError && avatarData) {
                        files.push(
                            new AttachmentBuilder(Buffer.from(await avatarData.arrayBuffer()), { name: 'avatar.png' })
                        );
                        embed.setThumbnail('attachment://avatar.png');
                    }
                } catch (e) {
                    // Avatar fetch failed, continue without it
                }
            }

            return interaction.editReply({
                embeds: [embed],
                files: files,
            });
        } catch (error) {
            log.error({ error }, 'Evade command error');
            return interaction.editReply({
                content: '❌ Failed to process evasion attempt!',
            });
        }
    },
};
