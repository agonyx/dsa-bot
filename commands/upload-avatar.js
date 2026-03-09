const { SlashCommandBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const log = createLogger('upload-avatar');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('upload-avatar')
        .setDescription('Upload an image for your character.')
        .addAttachmentOption(option =>
            option.setName('image').setDescription('The image file for your character.').setRequired(true)
        ),
    async execute(interaction) {
        try {
            const discordId = interaction.user.id;

            const { data: player, error: playerError } = await supabase
                .from('players')
                .select('id')
                .eq('discord_id', discordId)
                .eq('selected', 'YES')
                .single();

            if (playerError || !player?.id) {
                return interaction.reply({
                    content: 'No player selected. Use the /choose-character command first.',
                    ephemeral: true,
                });
            }

            const playerId = player.id;

            const attachment = interaction.options.getAttachment('image');
            if (!attachment) {
                return interaction.reply({ content: 'No image uploaded.', ephemeral: true });
            }

            const imageResponse = await fetch(attachment.url);
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

            const fileExt = attachment.name.split('.').pop();
            const fileName = `${playerId}-${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, imageBuffer, {
                    contentType: attachment.contentType,
                    upsert: true,
                });

            if (uploadError) {
                log.error({ error: uploadError }, 'Upload error');
                return interaction.reply({ content: 'Failed to upload image.', ephemeral: true });
            }

            const { error: updateError } = await supabase
                .from('players')
                .update({ avatar: fileName })
                .eq('id', playerId);

            if (updateError) {
                log.error({ error: updateError }, 'Update error');
                return interaction.reply({ content: 'Failed to update character avatar.', ephemeral: true });
            }

            return interaction.reply({
                content: 'Your character avatar has been updated successfully!',
                ephemeral: true,
            });
        } catch (error) {
            log.error({ error }, 'Error uploading image');
            return interaction.reply({ content: 'There was an error uploading your image.', ephemeral: true });
        }
    },
};
