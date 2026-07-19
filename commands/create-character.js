const { SlashCommandBuilder } = require('discord.js');
const { callEdgeFunction } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const log = createLogger('create-character');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-character')
        .setDescription('Create a new character with a specified name.')
        .addStringOption(option =>
            option.setName('name').setDescription('The name of your character.').setRequired(true)
        ),
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
                await interaction.editReply({ content: `Successfully created character ${name}` });
            } else {
                log.error({ data }, 'Failed to create character');
                await interaction.editReply({ content: 'Failed to create character. Please try again later.' });
            }
        } catch (error) {
            log.error({ error }, 'Error creating character');
            const errorMessage = error.data?.error || error.message || 'An unknown error occurred';
            await interaction.editReply({ content: `An error occurred while creating character: ${errorMessage}` });
        }
    },
};
