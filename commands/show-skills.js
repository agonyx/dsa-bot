const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
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
            const { data: player, error: playerError } = await supabase
                .from('players')
                .select('id, name')
                .eq('discord_id', user.id)
                .eq('selected', 'YES')
                .single();

            if (playerError || !player) {
                return interaction.editReply('❌ You need to select a character first with `/choose-character`.');
            }

            const { data: skills, error: skillsError } = await supabase
                .from('player_action_modifications')
                .select(
                    `
                    ftw,
                    action_modification:action_modifications(id, name, description, action_type)
                `
                )
                .eq('player_id', player.id);

            if (skillsError) throw skillsError;

            const embed = new EmbedBuilder().setColor(0x0099ff).setTitle(`Combat Skills for ${player.name}`);

            if (skills && skills.length > 0) {
                const skillsDescription = skills
                    .map(s => {
                        const skill = s.action_modification;
                        if (!skill) return null;
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
