const { SlashCommandBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uploadcharacteravatar')
        .setDescription('Upload an image for your character.')
        .addAttachmentOption(option => 
            option.setName('image')
                .setDescription('The image file for your character.')
                .setRequired(true)),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;

            // Fetch the selected player by discordId to get the player ID
            const { data: player, error: playerError } = await supabase
                .from('players')
                .select('id')
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (playerError || !player?.id) {
                return interaction.reply({ content: 'No player selected. Use the /chooseCharacter command first.', ephemeral: true });
            }

            const playerId = player.id;

            // Get the image attachment from the command
            const attachment = interaction.options.getAttachment('image');
            if (!attachment) {
                return interaction.reply({ content: 'No image uploaded.', ephemeral: true });
            }

            // Download the image from the attachment URL
            const imageResponse = await fetch(attachment.url);
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

            // Generate unique filename
            const fileExt = attachment.name.split('.').pop();
            const fileName = `${playerId}-${Date.now()}.${fileExt}`;

            // Upload to Supabase storage
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('avatars')
                .upload(fileName, imageBuffer, {
                    contentType: attachment.contentType,
                    upsert: true
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                return interaction.reply({ content: 'Failed to upload image.', ephemeral: true });
            }

            // Update player with avatar filename
            const { error: updateError } = await supabase
                .from('players')
                .update({ avatar: fileName })
                .eq('id', playerId);

            if (updateError) {
                console.error('Update error:', updateError);
                return interaction.reply({ content: 'Failed to update character avatar.', ephemeral: true });
            }

            return interaction.reply({ content: 'Your character avatar has been updated successfully!', ephemeral: true });
        } catch (error) {
            console.error('Error uploading image:', error);
            return interaction.reply({ content: 'There was an error uploading your image.', ephemeral: true });
        }
    }
};
