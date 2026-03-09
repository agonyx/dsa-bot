const { SlashCommandBuilder } = require('discord.js');
const { SUPABASE_URL } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendimage')
        .setDescription('Sends a test image to the channel.')
        .addStringOption(option =>
            option.setName('filename')
                .setDescription('The filename of the image in storage')
                .setRequired(false)),
    async execute(interaction) {
        try {
            const filename = interaction.options.getString('filename') || 'test-image.png';
            
            // Use Supabase storage URL
            const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${filename}`;
            
            return interaction.reply({ files: [imageUrl] });
        } catch (error) {
            console.error('Error sending image:', error);
            return interaction.reply({ content: 'There was an error while sending the image.', ephemeral: true });
        }
    }
};
