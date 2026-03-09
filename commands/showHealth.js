const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('showhealth')
        .setDescription('Displays your current and maximum health.')
        .addBooleanOption(option => option.setName('visible').setDescription('Make the response visible to everyone in the channel.')),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;
            const visible = interaction.options.getBoolean('visible', false);

            const { data: player, error } = await supabase
                .from('players')
                .select(`
                    id,
                    name,
                    avatar,
                    stats:stats(le_max, le_current)
                `)
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (error || !player || !player.id) {
                return interaction.reply({ content: 'You are not registered in the system or do not have a selected player.', ephemeral: true });
            }

            const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;

            if (!stats || stats.le_max === undefined || stats.le_current === undefined) {
                return interaction.reply({ content: 'Your selected player does not have health stats.', ephemeral: true });
            }

            const { le_max, le_current } = stats;

            // Create an embed to display the health information
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`${player.name}'s Health`)
                .setDescription(`Here are your current and maximum health values.`)
                .addFields(
                    { name: 'Current Health', value: `${le_current}`, inline: true },
                    { name: 'Maximum Health', value: `${le_max}`, inline: true }
                )
                .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.avatarURL() });

            if (player.avatar) {
                try {
                    const { data: avatarData, error: avatarError } = await supabase
                        .storage
                        .from('avatars')
                        .download(player.avatar);
                    
                    if (!avatarError && avatarData) {
                        const attachment = new AttachmentBuilder(Buffer.from(await avatarData.arrayBuffer()), { name: 'avatar.png' });
                        embed.setThumbnail('attachment://avatar.png');
                        return interaction.reply({ embeds: [embed], files: [attachment], ephemeral: !visible });
                    }
                } catch (e) {
                    // Avatar not found, continue without it
                }
            }

            return interaction.reply({ embeds: [embed], ephemeral: !visible });

        } catch (error) {
            console.error('Error showing health:', error);
            return interaction.reply({ content: 'There was an error while retrieving your health information.', ephemeral: true });
        }
    }
};
