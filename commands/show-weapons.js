const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, weapons } = require('../db/schema');
const { readAvatar } = require('../utils/avatarStorage');
const { createLogger } = require('../utils/logger');
const log = createLogger('show-weapons');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('show-weapons')
        .setDescription('Displays the weapons of your selected character.')
        .addBooleanOption(option =>
            option.setName('visible').setDescription('Make the response visible to everyone in the channel.')
        ),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;
            const visible = interaction.options.getBoolean('visible', false);

            const [player] = await db
                .select({ id: players.id, name: players.name, avatar: players.avatar })
                .from(players)
                .where(and(eq(players.discord_id, discordId), eq(players.selected, 'YES')))
                .limit(1);

            if (!player) {
                return interaction.reply({
                    content:
                        'You have not selected a player yet. Use the /choose-character command to select a player.',
                    ephemeral: true,
                });
            }

            player.weapons = await db
                .select()
                .from(weapons)
                .where(eq(weapons.player_id, player.id));

            if (!player.weapons || player.weapons.length === 0) {
                return interaction.reply({
                    content: 'Your selected player does not have any weapons.',
                    ephemeral: true,
                });
            }

            const weaponEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`**${player.name} - Weapons**`)
                .setDescription('Here are the weapons your character currently has:\n\u200B')
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                });

            const meleeWeapons = player.weapons.filter(weapon => weapon.type === 'MELEE');
            const rangedWeapons = player.weapons.filter(weapon => weapon.type === 'RANGED');

            let meleeColumn = '';
            let rangedColumn = '';

            if (meleeWeapons.length > 0) {
                meleeColumn += '**Melee Weapons**\n\n';
                meleeWeapons.forEach(weapon => {
                    meleeColumn += `**${weapon.name}**\nType: ${weapon.type.charAt(0).toUpperCase() + weapon.type.slice(1)}\nDamage: ${weapon.tp}\nAT: ${weapon.at}\nPA: ${weapon.pa}\nEquipped: ${weapon.is_equipped === 'Y' ? 'Yes' : 'No'}\nSlot: ${weapon.equipped_slot || 'N/A'}\n\u200B\n`;
                });
            }

            if (rangedWeapons.length > 0) {
                rangedColumn += '**Ranged Weapons**\n\n';
                rangedWeapons.forEach(weapon => {
                    rangedColumn += `**${weapon.name}**\nType: ${weapon.type.charAt(0).toUpperCase() + weapon.type.slice(1)}\nDamage: ${weapon.tp}\nAT: ${weapon.at}\nPA: ${weapon.pa}\nEquipped: ${weapon.is_equipped === 'Y' ? 'Yes' : 'No'}\nSlot: ${weapon.equipped_slot || 'N/A'}\n\u200B\n`;
                });
            }

            const fields = [];
            if (meleeColumn) {
                fields.push({ name: '\u200B', value: meleeColumn, inline: true });
            }
            if (rangedColumn) {
                fields.push({ name: '\u200B', value: rangedColumn, inline: true });
            }

            if (fields.length > 0) {
                weaponEmbed.addFields(fields);
            }

            if (player.avatar) {
                try {
                    const avatarBuffer = await readAvatar(player.avatar);
                    if (avatarBuffer) {
                        const attachment = new AttachmentBuilder(avatarBuffer, { name: 'avatar.png' });
                        weaponEmbed.setThumbnail('attachment://avatar.png');
                        return interaction.reply({ embeds: [weaponEmbed], files: [attachment], ephemeral: !visible });
                    }
                } catch (e) {
                    // Avatar fetch failed, continue without it
                }
            }

            return interaction.reply({ embeds: [weaponEmbed], ephemeral: !visible });
        } catch (error) {
            log.error({ error }, 'Error showing weapons');
            return interaction.reply({ content: 'There was an error while fetching your weapons.', ephemeral: true });
        }
    },
};
