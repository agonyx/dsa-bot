const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { players, playerActionModifications, actionModifications } = require('../db/schema');
const { createLogger } = require('../utils/logger');
const log = createLogger('show-skills');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('show-skills')
        .setDescription('Displays the special combat skills of your selected character.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { user } = interaction;

        try {
            const [player] = await db
                .select({ id: players.id, name: players.name })
                .from(players)
                .where(and(eq(players.discord_id, user.id), eq(players.selected, 'YES')))
                .limit(1);

            if (!player) {
                return interaction.editReply('❌ You need to select a character first with `/choose-character`.');
            }

            const skillRows = await db
                .select({
                    ftw: playerActionModifications.ftw,
                    skill_id: actionModifications.id,
                    skill_name: actionModifications.name,
                    skill_description: actionModifications.description,
                    skill_action_type: actionModifications.action_type,
                })
                .from(playerActionModifications)
                .innerJoin(
                    actionModifications,
                    eq(playerActionModifications.action_modification_id, actionModifications.id)
                )
                .where(eq(playerActionModifications.player_id, player.id));

            const embed = new EmbedBuilder().setColor(0x0099ff).setTitle(`Combat Skills for ${player.name}`);

            if (skillRows && skillRows.length > 0) {
                const skillsDescription = skillRows
                    .map(s => {
                        if (s.skill_id == null) return null;
                        const skill = {
                            id: s.skill_id,
                            name: s.skill_name,
                            description: s.skill_description,
                            action_type: s.skill_action_type,
                        };
                        return `**${skill.name}**${s.ftw ? ` (FtW: ${s.ftw})` : ''}: ${skill.description}`;
                    })
                    .filter(Boolean)
                    .join('\n');
                embed.setDescription(
                    skillsDescription || 'This character has not learned any special combat skills yet.'
                );
            } else {
                embed.setDescription('This character has not learned any special combat skills yet.');
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            log.error({ error }, 'Error in /show-skills');
            await interaction.editReply('❌ An error occurred while fetching your skills.');
        }
    },
};
