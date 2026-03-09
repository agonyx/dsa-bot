const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('showstats')
        .setDescription('Displays your character\'s current statistics')
        .addBooleanOption(option => 
            option.setName('visible')
                .setDescription('Make the response visible to everyone')),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;
            const visible = interaction.options.getBoolean('visible') || false;

            const { data: player, error } = await supabase
                .from('players')
                .select(`
                    id,
                    name,
                    avatar,
                    stats:stats(*)
                `)
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (error || !player?.stats) {
                return interaction.reply({ 
                    content: '❌ No character selected! Use `/choosecharacter` first.',
                    ephemeral: true 
                });
            }

            const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;
            
            if (!stats) {
                return interaction.reply({ 
                    content: '❌ No stats found for this character!',
                    ephemeral: true 
                });
            }

            // Health bar calculation
            const maxLP = stats.le_max || 1;
            const currentLP = stats.le_current;
            const healthPercentage = Math.floor((currentLP / maxLP) * 100);
            const healthBar = '■'.repeat(Math.round(currentLP / maxLP * 10)) + '□'.repeat(10 - Math.round(currentLP / maxLP * 10));

            const statsEmbed = new EmbedBuilder()
                .setColor(0x2F3136)
                .setTitle(`🔰 ${player.name}'s Statistics`)
                .setDescription(`**Character Overview**\n${healthBar} **${healthPercentage}%** (${currentLP}/${maxLP} LP)`)
                .addFields(
                    { 
                        name: '🧠 Attributes',
                        value: [
                            `**MU:** \`${stats.mu}\``,
                            `**KL:** \`${stats.kl}\``,
                            `**IN:** \`${stats.in}\``,
                            `**CH:** \`${stats.ch}\``
                        ].join('\n'),
                        inline: true
                    },
                    { 
                        name: '⚔️ Combat Stats',
                        value: [
                            `**FF:** \`${stats.ff}\``,
                            `**GE:** \`${stats.ge}\``,
                            `**KO:** \`${stats.ko}\``,
                            `**KK:** \`${stats.kk}\``
                        ].join('\n'),
                        inline: true
                    },
                    { 
                        name: '🛡️ Defense',
                        value: [
                            `**Initiative:** \`${stats.initiative}\``,
                            `**Ausweichen:** \`${stats.ausweichen}\``,
                            `**Max LP:** \`${stats.le_max}\``,
                            `**Current LP:** \`${stats.le_current}\``
                        ].join('\n'),
                        inline: true
                    }
                )
                .setFooter({ 
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL() 
                });

            // Avatar handling via Supabase storage
            let files = [];
            if (player.avatar) {
                try {
                    const { data: avatarData, error: avatarError } = await supabase
                        .storage
                        .from('avatars')
                        .download(player.avatar);
                    
                    if (!avatarError && avatarData) {
                        files.push(new AttachmentBuilder(Buffer.from(await avatarData.arrayBuffer()), { name: 'avatar.png' }));
                        statsEmbed.setThumbnail('attachment://avatar.png');
                    }
                } catch (e) {
                    // Avatar not found, continue without it
                }
            }

            return interaction.reply({
                embeds: [statsEmbed],
                files: files,
                ephemeral: !visible
            });

        } catch (error) {
            console.error('Showstats Error:', error);
            return interaction.reply({
                content: '❌ Failed to retrieve character stats!',
                ephemeral: true
            });
        }
    }
};
