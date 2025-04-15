const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { rollDice } = require('../utils/rollUtil');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('evade')
        .setDescription('Attempt to dodge an attack using your Ausweichen skill'),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;

            // Fetch player data
            const playerResponse = await axios.get(`${process.env.BACKEND_URL}/player/selected/${discordId}`);
            const player = playerResponse.data;

            if (!player?.stats) {
                return interaction.reply({ 
                    content: '❌ No character selected! Use `/choosecharacter` first.',
                    ephemeral: true 
                });
            }

            const { ausweichen } = player.stats;
            const diceRoll = rollDice(20);
            const success = diceRoll <= ausweichen;

            // Create visual elements
            const successIndicator = success ? '🟢 SUCCESS' : '🔴 FAILURE';
            const diceComparison = `${diceRoll}${success ? ' ≤ ' : ' > '}${ausweichen}`;
            const successChance = `${Math.round((ausweichen / 20) * 100)}% evasion chance`;

            // Build embed
            const embed = new EmbedBuilder()
                .setColor(success ? 0x57F287 : 0xED4245) // Discord success/danger colors
                .setTitle(`🛡️ Evasion Attempt - ${successIndicator}`)
                .setDescription([
                    `**${player.name}** rolled a D20 to evade!`,
                    '',
                    `🎲 **Roll:** \`${diceComparison}\``,
                    `📊 **Base Chance:** \`${successChance}\``
                ].join('\n'))
                .addFields(
                    {
                        name: 'Details',
                        value: [
                            `✦ **Ausweichen:** \`${ausweichen}\``,
                            `✦ **Dice Result:** \`${diceRoll}\``,
                            `✦ **Outcome:** ${success ? '**Evaded!**' : '**Hit!**'}`
                        ].join('\n'),
                        inline: true
                    }
                )
                .setThumbnail(player.avatar ? `${process.env.BACKEND_URL}/uploads/${player.avatar}` : null)
                .setFooter({ 
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL() 
                })
                .setTimestamp();

            // Handle avatar attachment
            let files = [];
            if (player.avatar) {
                const avatarUrl = `${process.env.BACKEND_URL}/uploads/${player.avatar}`;
                const imageResponse = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
                files.push(new AttachmentBuilder(Buffer.from(imageResponse.data), { name: 'avatar.png' }));
                embed.setThumbnail('attachment://avatar.png');
            }

            return interaction.reply({
                embeds: [embed],
                files: files
            });

        } catch (error) {
            console.error('Evade Command Error:', error);
            return interaction.reply({
                content: '❌ Failed to process evasion attempt!',
                ephemeral: true
            });
        }
    }
};