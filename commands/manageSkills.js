const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manageskills')
        .setDescription('Assign or unassign special combat skills for your character.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { user, client } = interaction;
        const BACKEND_URL = process.env.BACKEND_URL;

        try {
            // --- 1. Fetch Player and Skill Data ---
            const playerResponse = await axios.get(`${BACKEND_URL}/player/selected/${user.id}`);
            const player = playerResponse.data;
            if (!player) {
                return interaction.editReply('❌ You need to select a character first with `/choosecharacter`.');
            }

            const [allSkillsResponse, playerSkillsResponse] = await Promise.all([
                axios.get(`${BACKEND_URL}/action-modification`),
                axios.get(`${BACKEND_URL}/player/${player.id}/action-modifications`)
            ]);

            const allSkills = allSkillsResponse.data;
            const playerSkills = playerSkillsResponse.data;
            const playerSkillIds = new Set(playerSkills.map(s => s.id));

            if (!allSkills || allSkills.length === 0) {
                return interaction.editReply('ℹ️ There are no combat skills available in the system yet.');
            }

            // --- 2. Build the Multi-Select Menu ---
            const options = allSkills.map(skill => ({
                label: skill.name,
                description: skill.description.substring(0, 100),
                value: skill.id,
                default: playerSkillIds.has(skill.id) // Pre-select skills the player has
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('skill_select_menu')
                .setPlaceholder('Select the skills your character should have...')
                .setMinValues(0)
                .setMaxValues(options.length)
                .addOptions(options);

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_skill_selection')
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Success);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder().addComponents(confirmButton);

            const message = await interaction.editReply({
                content: `Managing skills for **${player.name}**. Select all the skills they should have:`,
                components: [row1, row2],
            });

            // --- 3. Await User Interaction ---
            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                time: 60000, // 60 seconds
            });

            let lastSelectedValues = playerSkills.map(s => s.id); // Initialize with current skills

            collector.on('collect', async i => {
                if (i.isStringSelectMenu()) {
                    lastSelectedValues = i.values; // Update the selection from the menu interaction
                    await i.deferUpdate();
                    // No need to edit the message here, the selection is stored
                } else if (i.customId === 'confirm_skill_selection') {
                    await i.deferUpdate();
                    const selectedSkillIds = new Set(lastSelectedValues);
                    
                    // Logic to determine what to add and remove
                    const skillsToAdd = [...selectedSkillIds].filter(id => !playerSkillIds.has(id));
                    const skillsToRemove = [...playerSkillIds].filter(id => !selectedSkillIds.has(id));

                    // --- 4. Perform API Calls ---
                    const promises = [];
                    for (const skillId of skillsToAdd) {
                        // Find the full skill object to get the name for the reply
                        const skill = allSkills.find(s => s.id === skillId);
                        promises.push(axios.post(`${BACKEND_URL}/player-action-modification/assign`, { playerId: player.id.toString(), skillName: skill.name }));
                    }
                    for (const skillId of skillsToRemove) {
                        promises.push(axios.delete(`${BACKEND_URL}/player-action-modification/unassign`, { data: { playerId: player.id.toString(), skillId } }));
                    }

                    await Promise.all(promises);

                    await i.editReply({
                        content: `✅ Skills for **${player.name}** have been updated!\nAdded: ${skillsToAdd.length}\nRemoved: ${skillsToRemove.length}`,
                        components: [],
                    });
                    collector.stop();
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction.editReply({ content: 'Skill management has timed out.', components: [] });
                }
            });

        } catch (error) {
            console.error('Error in /manageskills:', error);
            interaction.editReply('❌ An error occurred while managing skills.');
        }
    },
};