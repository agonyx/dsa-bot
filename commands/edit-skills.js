const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, actionModifications, playerActionModifications } = require('../db/schema');
const { createLogger } = require('../utils/logger');
const log = createLogger('edit-skills');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit-skills')
        .setDescription('Assign or unassign special combat skills for your character.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { user, client } = interaction;

        try {
            const [player] = await db
                .select({ id: players.id, name: players.name })
                .from(players)
                .where(and(eq(players.discord_id, user.id), eq(players.selected, 'YES')))
                .limit(1);

            if (!player) {
                return interaction.editReply('❌ You need to select a character first with `/choose-character`.');
            }

            const [allSkills, playerSkills] = await Promise.all([
                db
                    .select({
                        id: actionModifications.id,
                        name: actionModifications.name,
                        description: actionModifications.description,
                    })
                    .from(actionModifications),
                db
                    .select({ action_modification_id: playerActionModifications.action_modification_id })
                    .from(playerActionModifications)
                    .where(eq(playerActionModifications.player_id, player.id)),
            ]);

            const playerSkillIds = new Set(playerSkills.map(s => s.action_modification_id));

            if (!allSkills || allSkills.length === 0) {
                return interaction.editReply('ℹ️ There are no combat skills available in the system yet.');
            }

            const options = allSkills.map(skill => ({
                label: skill.name,
                description: skill.description?.substring(0, 100) || 'No description',
                value: skill.id,
                default: playerSkillIds.has(skill.id),
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

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                time: 60000,
            });

            let lastSelectedValues = [...playerSkillIds];

            const applySkillChanges = async (skillsToAdd, skillsToRemove) => {
                const ops = [];

                if (skillsToAdd.length > 0) {
                    const insertData = skillsToAdd.map(skillId => ({
                        player_id: player.id,
                        action_modification_id: skillId,
                        ftw: 0,
                    }));
                    ops.push(db.insert(playerActionModifications).values(insertData));
                }

                for (const skillId of skillsToRemove) {
                    ops.push(
                        db
                            .delete(playerActionModifications)
                            .where(
                                and(
                                    eq(playerActionModifications.player_id, player.id),
                                    eq(playerActionModifications.action_modification_id, skillId)
                                )
                            )
                    );
                }

                await Promise.all(ops);
            };

            collector.on('collect', async i => {
                if (i.isStringSelectMenu()) {
                    lastSelectedValues = i.values;
                    await i.deferUpdate();
                } else if (i.customId === 'confirm_skill_selection') {
                    await i.deferUpdate();
                    const selectedSkillIds = new Set(lastSelectedValues);

                    const skillsToAdd = [...selectedSkillIds].filter(id => !playerSkillIds.has(id));
                    const skillsToRemove = [...playerSkillIds].filter(id => !selectedSkillIds.has(id));

                    try {
                        await applySkillChanges(skillsToAdd, skillsToRemove);
                    } catch (err) {
                        log.error({ err }, 'Database errors during skill update');
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
            log.error({ error }, 'Error in /edit-skills');
            interaction.editReply('❌ An error occurred while managing skills.');
        }
    },
};
