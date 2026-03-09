const { SlashCommandBuilder, EmbedBuilder, Interaction } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewmob')
        .setDescription('Displays the details of a specific mob template.')
        .addStringOption(option => option
            .setName('name')
            .setDescription('The exact name of the mob template to view.')
            .setRequired(true)
            .setMaxLength(100))
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const mobName = interaction.options.getString('name');

        try {
            const { data: mob, error } = await supabase
                .from('mobs')
                .select('*')
                .eq('name', mobName)
                .single();

            if (error || !mob) {
                return interaction.editReply({ 
                    content: `❌ Mob template named **${mobName}** not found. Check the spelling or use \`/listmobs\`.` 
                });
            }

            const mobEmbed = new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle(`👾 Mob Details: ${mob.name} 👾`)
                .setTimestamp();

            if (mob.description) {
                mobEmbed.setDescription(`*${mob.description}*`);
            }

            mobEmbed.addFields(
                { name: 'Max HP (LP)', value: `\`${mob.base_max_hp ?? 'N/A'}\``, inline: true },
                { name: 'Initiative (INI)', value: `\`${mob.base_initiative ?? 'N/A'}\``, inline: true },
                { name: 'Armor (RS)', value: `\`${mob.base_armor_soak ?? 'N/A'}\``, inline: true },
                { name: 'Attack (AT)', value: `\`${mob.base_attack_value ?? 'N/A'}\``, inline: true },
                { name: 'Parry (PA)', value: `\`${mob.base_parry_value ?? 'N/A'}\``, inline: true },
                { name: 'Damage (TP)', value: `\`${mob.base_damage_tp ?? 'N/A'}\``, inline: true }
            );

            await interaction.editReply({ embeds: [mobEmbed] });

        } catch (error) {
            console.error(`Error executing /viewmob for name "${mobName}":`, error);
            await interaction.editReply({ content: `❌ Error: ${error.message || 'Failed to fetch mob details.'}` });
        }
    }
};
