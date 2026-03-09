const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manageskills')
        .setDescription('Assign or unassign special combat skills for your character.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { user, client } = interaction;

        try {
            // --- 1. Fetch Player and Skill Data ---
            const { data: player, error: playerError } = await supabase
                .from('players')
                .select('id, name')
                .eq('discord_id', user.id)
                .eq('selected', 'YES')
                .single();

            if (playerError || !player) {
                return interaction.editReply('❌ You need to select a character first with `/choosecharacter`.');
            }

            // Fetch all skills and player's skills in parallel
            const [allSkillsResult, playerSkillsResult] = await Promise.all([
                supabase.from('action_modifications').select('id, name, description'),
                supabase
                    .from('player_action_modifications')
                    .select('action_modification_id')
                    .eq('player_id', player.id)
            ]);

            const allSkills = allSkillsResult.data;
            const playerSkills = playerSkillsResult.data;
            const playerSkillIds = new Set(playerSkills.map(s => s.action_modification_id));

            if (!allSkills || allSkills.length === 0) {
                return interaction.editReply('ℹ️ There are no combat skills available in the system yet.');
            }

            // --- 2. Build the Multi-Select Menu ---
            const options = allSkills.map(skill => ({
                label: skill.name,
                description: skill.description?.substring(0, 100) || 'No description',
                value: skill.id,
                default: playerSkillIds.has(skill.id)
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
                time: 60000,
            });

            let lastSelectedValues = [...playerSkillIds]; // Initialize with current skills
            
            // Build promises array for database operations
            const buildPromises = (selectedSkillIds, skillsToAdd, skillsToRemove) => {
                const promises = [];
                
                if (skillsToAdd.length > 0) {
                    const insertData = skillsToAdd.map(skillId => ({
                        player_id: player.id,
                        action_modification_id: skillId,
                        ftw: 0
                    }));
                    promises.push(supabase.from('player_action_modifications').insert(insertData));
                }
                
                for (const skillId of skillsToRemove) {
                    promises.push(
                        supabase
                            .from('player_action_modifications')
                            .delete()
                            .eq('player_id', player.id)
                            .eq('action_modification_id', skillId)
                    );
                }
                
                return promises;
            };

            collector.on('collect', async i => {
                if (i.isStringSelectMenu()) {
                    lastSelectedValues = i.values;
                    await i.deferUpdate();
                } else if (i.customId === 'confirm_skill_selection') {
                    await i.deferUpdate();
                    const selectedSkillIds = new Set(lastSelectedValues);
                    
                    // Logic to determine what to add and remove
                    const skillsToAdd = [...selectedSkillIds].filter(id => !playerSkillIds.has(id));
                    const skillsToRemove = [...playerSkillIds].filter(id => !selectedSkillIds.has(id));

                    // --- 4. Perform Database Operations ---
                    const promises = buildPromises(selectedSkillIds, skillsToAdd, skillsToRemove);
                    const results = await Promise.all(promises);
                    
                    // Check for errors in any operation
                    const errors = results.filter(r => r && r.error);
                    if (errors.length > 0) {
                        console.error('Database errors during skill update:', errors);
                        return i.editReply({
                            content: '❌ Some database operations failed. Please try again.',
                            components: [],
                        });
                    }

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
