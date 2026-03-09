const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('showitems')
        .setDescription('Displays the items of your selected character.')
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
                    items:items(*)
                `)
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (error || !player || !player.id) {
                return interaction.reply({ content: 'You have not selected a player yet. Use the /chooseCharacter command to select a player.', ephemeral: true });
            }

            const items = player.items;

            if (!items || items.length === 0) {
                return interaction.reply({ content: 'Your selected player does not have any items.', ephemeral: true });
            }

            const itemsEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`${player.name} - Items`)
                .setDescription('Here are the items your character currently has:')
                .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.avatarURL() });

            // Add each item as a field
            items.forEach(item => {
                itemsEmbed.addFields(
                    { name: item.name, value: `Type: ${item.type || 'N/A'}\nDescription: ${item.description || 'N/A'}`, inline: false }
                );
            });

            if (player.avatar) {
                try {
                    const { data: avatarData, error: avatarError } = await supabase
                        .storage
                        .from('avatars')
                        .download(player.avatar);
                    
                    if (!avatarError && avatarData) {
                        const attachment = new AttachmentBuilder(Buffer.from(await avatarData.arrayBuffer()), { name: 'avatar.png' });
                        itemsEmbed.setThumbnail('attachment://avatar.png');
                        return interaction.reply({ embeds: [itemsEmbed], files: [attachment], ephemeral: !visible });
                    }
                } catch (e) {
                    // Avatar not found, continue without it
                }
            }

            return interaction.reply({ embeds: [itemsEmbed], ephemeral: !visible });

        } catch (error) {
            console.error('Error showing items:', error);
            return interaction.reply({ content: 'There was an error while fetching your items.', ephemeral: true });
        }
    }
};
