const { SlashCommandBuilder } = require('discord.js');
const { callEdgeFunction } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Registers a new player with a specified name.')
        .addStringOption(option => option.setName('name').setDescription('The name of your character.').setRequired(true)),
    async execute(interaction) {
        const name = interaction.options.getString('name');
        const discordId = interaction.user.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            const { data, status } = await callEdgeFunction('create-player', {
                name: name,
                discordId: discordId,
            });

            if (status === 201) {
                await interaction.editReply({ content: `Successfully registered new player ${name}` });
            } else {
                console.error('Failed to register player:', data);
                await interaction.editReply({ content: 'Failed to register new player. Please try again later.' });
            }
        } catch (error) {
            console.error('Error registering player:', error);
            const errorMessage = error.data?.error || error.message || 'An unknown error occurred';
            await interaction.editReply({ content: `An error occurred while registering the player: ${errorMessage}` });
        }
    },
};
