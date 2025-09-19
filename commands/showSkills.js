const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('showskills')
        .setDescription('Displays the special combat skills of your selected character.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { user } = interaction;
        const BACKEND_URL = process.env.BACKEND_URL;

        try {
            // --- 1. Fetch Player Data ---
            const playerResponse = await axios.get(`${BACKEND_URL}/player/selected/${user.id}`);
            const player = playerResponse.data;
            if (!player) {
                return interaction.editReply('❌ You need to select a character first with `/choosecharacter`.');
            }

            // --- 2. Fetch Player's Learned Skills ---
            const skillsResponse = await axios.get(`${BACKEND_URL}/player/${player.id}/action-modifications`);
            const skills = skillsResponse.data;

            // --- 3. Create and Send the Embed ---
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Combat Skills for ${player.name}`);

            if (skills && skills.length > 0) {
                const skillsDescription = skills
                    .map(skill => `**${skill.name}**: ${skill.description}`)
                    .join('\n');
                embed.setDescription(skillsDescription);
            } else {
                embed.setDescription('This character has not learned any special combat skills yet.');
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in /showskills:', error);
            let errorMessage = 'An error occurred while fetching your skills.';
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                errorMessage = '❌ Could not find a selected character. Please use `/choosecharacter` first.';
            }
            await interaction.editReply(errorMessage);
        }
    },
};