const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('showskills')
        .setDescription('Displays the special combat skills of your selected character.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { user } = interaction;

        try {
            // --- 1. Fetch Player Data ---
            const { data: player, error: playerError } = await supabase
                .from('players')
                .select('id, name')
                .eq('discord_id', user.id)
                .eq('selected', 'YES')
                .single();

            if (playerError || !player) {
                return interaction.editReply('❌ You need to select a character first with `/choosecharacter`.');
            }

            // --- 2. Fetch Player's Learned Skills via join ---
            const { data: skills, error: skillsError } = await supabase
                .from('player_action_modifications')
                .select(`
                    ftw,
                    action_modification:action_modifications(id, name, description, action_type)
                `)
                .eq('player_id', player.id);

            if (skillsError) throw skillsError;

            // --- 3. Create and Send the Embed ---
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Combat Skills for ${player.name}`);

            if (skills && skills.length > 0) {
                const skillsDescription = skills
                    .map(s => {
                        const skill = s.action_modification;
                        if (!skill) return null; // Handle broken foreign key
                        return `**${skill.name}**${s.ftw ? ` (FtW: ${s.ftw})` : ''}: ${skill.description}`;
                    })
                    .filter(Boolean) // Remove null entries from broken FKs
                    .join('\n');
                embed.setDescription(skillsDescription || 'This character has not learned any special combat skills yet.');
            } else {
                embed.setDescription('This character has not learned any special combat skills yet.');
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in /showskills:', error);
            await interaction.editReply('❌ An error occurred while fetching your skills.');
        }
    },
};
