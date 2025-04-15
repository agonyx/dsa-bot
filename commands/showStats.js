const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

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

            const playerResponse = await axios.get(`${process.env.BACKEND_URL}/player/selected/${discordId}`);
            const player = playerResponse.data;

            if (!player?.stats) {
                return interaction.reply({ 
                    content: '❌ No character selected! Use `/choosecharacter` first.',
                    ephemeral: true 
                });
            }

            // Health bar calculation
            const maxLP = player.stats.le_max || 1;
            const currentLP = player.stats.le_current;
            const healthPercentage = Math.floor((currentLP / maxLP) * 100);
            const healthBar = '■'.repeat(Math.round(currentLP / maxLP * 10)) + '□'.repeat(10 - Math.round(currentLP / maxLP * 10));

            const statsEmbed = new EmbedBuilder()
                .setColor(0x2F3136) // Dark theme color
                .setTitle(`🔰 ${player.name}'s Statistics`)
                .setThumbnail(player.avatar ? `${process.env.BACKEND_URL}/uploads/${player.avatar}` : null)
                .setDescription(`**Character Overview**\n${healthBar} **${healthPercentage}%** (${currentLP}/${maxLP} LP)`)
                .addFields(
                    { 
                        name: '🧠 Attributes',
                        value: [
                            `**MU:** \`${player.stats.mu}\``,
                            `**KL:** \`${player.stats.kl}\``,
                            `**IN:** \`${player.stats.in}\``,
                            `**CH:** \`${player.stats.ch}\``
                        ].join('\n'),
                        inline: true
                    },
                    { 
                        name: '⚔️ Combat Stats',
                        value: [
                            `**FF:** \`${player.stats.ff}\``,
                            `**GE:** \`${player.stats.ge}\``,
                            `**KO:** \`${player.stats.ko}\``,
                            `**KK:** \`${player.stats.kk}\``
                        ].join('\n'),
                        inline: true
                    },
                    { 
                        name: '🛡️ Defense',
                        value: [
                            `**Initiative:** \`${player.stats.initiative}\``,
                            `**Ausweichen:** \`${player.stats.ausweichen}\``,
                            `**Max LP:** \`${player.stats.le_max}\``,
                            `**Current LP:** \`${player.stats.le_current}\``
                        ].join('\n'),
                        inline: true
                    }
                )
                .setFooter({ 
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL() 
                });

            // Avatar handling
            let files = [];
            if (player.avatar) {
                const avatarUrl = `${process.env.BACKEND_URL}/uploads/${player.avatar}`;
                const imageResponse = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
                files.push(new AttachmentBuilder(Buffer.from(imageResponse.data), { name: 'avatar.png' }));
                statsEmbed.setThumbnail('attachment://avatar.png');
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