const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { rollDice } = require('../utils/rollUtil');
const axios = require('axios');
require('dotenv').config();

// Add this to your utils/rollUtil.js
function rollDamage(tp) {
    const tpRegex = /^(\d+)w(\d+)(\+(\d+))?$/;
    const match = tp.match(tpRegex);

    if (!match) throw new Error('Invalid TP format');

    const numDice = parseInt(match[1], 10);
    const numSides = parseInt(match[2], 10);
    const constant = parseInt(match[4], 10) || 0;

    return Array.from({ length: numDice }, () => rollDice(numSides))
               .reduce((a, b) => a + b, constant);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Perform a combat attack with your equipped weapon'),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;
            
            // Fetch player data with required relations
            const playerResponse = await axios.get(`${process.env.BACKEND_URL}/player/selected/${discordId}`, {
                params: { relations: ['weapons', 'stats'] }
            });

            const player = playerResponse.data;
            if (!player?.weapons?.length) {
                return interaction.reply({ 
                    content: '❌ No weapons equipped!',
                    ephemeral: true 
                });
            }

            // Get equipped offensive weapons
            const equippedWeapons = player.weapons.filter(w => 
                w.isEquipped === "Y" && 
                (w.equippedSlot === "OFFENSE" || w.equippedSlot === "ADAPTIVE")
            );

            if (!equippedWeapons.length) {
                return interaction.reply({ 
                    content: '❌ Equip a weapon in offense slot first!',
                    ephemeral: true 
                });
            }

            const weapon = equippedWeapons[0];
            const attackRoll = rollDice(20);
            const isCritical = attackRoll === 1;
            let damage = 0;

            // Build base embed
            const embed = new EmbedBuilder()
                .setColor('#2F3136')
                .setTitle(`⚔️ ${player.name}'s Attack`)
                .setThumbnail(player.avatar ? `${process.env.BACKEND_URL}/uploads/${player.avatar}` : null)
                .addFields(
                    { name: 'Weapon', value: `\`${weapon.name}\`\nAT: ${weapon.at} | TP: ${weapon.tp}`, inline: true },
                    { name: 'Attack Roll', value: `\`${attackRoll}\``, inline: true }
                );

            // Handle avatar attachment
            let files = [];
            if (player.avatar) {
                const avatarUrl = `${process.env.BACKEND_URL}/uploads/${player.avatar}`;
                const imageResponse = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
                files.push(new AttachmentBuilder(imageResponse.data, { name: 'avatar.png' }));
                embed.setThumbnail('attachment://avatar.png');
            }

            // Attack resolution logic
            if (attackRoll <= weapon.at) {
                damage = rollDamage(weapon.tp);
                
                if (isCritical) {
                    const confirmRoll = rollDice(20);
                    embed.addFields({ 
                        name: 'Critical Confirm', 
                        value: `Roll: \`${confirmRoll}\`\nRequired: \`≤${weapon.at}\``,
                        inline: true 
                    });
                    
                    if (confirmRoll <= weapon.at) {
                        damage *= 2;
                        embed.setDescription(`🎯 **CRITICAL HIT!** (${damage} damage)`);
                    } else {
                        embed.setDescription(`⚠️ **Failed Critical** (${damage} damage)`);
                    }
                } else {
                    embed.setDescription(`✅ **Hit!** (${damage} damage)`);
                }
            } else {
                embed.setDescription('❌ **Miss!**');
            }

            // Add detailed damage breakdown
            embed.addFields({ 
                name: 'Damage Calculation',
                value: `\`${weapon.tp}\` → \`${damage}\` total damage`,
                inline: false 
            });

            // Create interactive components
            const rerollButton = new ButtonBuilder()
                .setCustomId('reroll-attack')
                .setLabel('Reroll')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎲');

            const actionRow = new ActionRowBuilder().addComponents(rerollButton);

            // Send response
            const response = await interaction.reply({ 
                embeds: [embed], 
                components: [actionRow],
                files: files,
                fetchReply: true 
            });

            // Handle rerolls
            const collector = response.createMessageComponentCollector({ 
                filter: i => i.user.id === interaction.user.id,
                time: 60000 
            });

            collector.on('collect', async i => {
                await i.deferUpdate();
                await this.execute(interaction);
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(console.error);
            });

        } catch (error) {
            console.error('Attack Command Error:', error);
            interaction.reply({
                content: '❌ Failed to process attack!',
                ephemeral: true
            });
        }
    }
};