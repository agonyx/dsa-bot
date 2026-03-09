const { SlashCommandBuilder, EmbedBuilder, Interaction } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listmobs')
        .setDescription('Lists available mob templates defined for combat.')
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const { data: mobs, error } = await supabase
                .from('mobs')
                .select('*')
                .order('name');

            if (error) throw error;

            if (!mobs || mobs.length === 0) {
                await interaction.editReply("ℹ️ No mob templates have been defined yet. Use `/addmob` to create some.");
                return;
            }

            const listEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('👾 Available Mob Templates 👾')
                .setDescription(`Found ${mobs.length} mob template(s).`)
                .setTimestamp();

            const fieldsToShow = mobs.slice(0, 15).map(mob => {
                const hp = mob.base_max_hp ?? 'N/A';
                const ini = mob.base_initiative ?? 'N/A';
                const atk = mob.base_attack_value ?? 'N/A';
                const par = mob.base_parry_value ?? 'N/A';
                const arm = mob.base_armor_soak ?? 'N/A';
                const dmg = mob.base_damage_tp ?? 'N/A';
                const desc = mob.description ? `\n*${mob.description.substring(0, 100)}${mob.description.length > 100 ? '...' : ''}*` : '';

                return { name: `🔹 ${mob.name}`, value: `**HP:** ${hp} | **INI:** ${ini} | **AT:** ${atk} | **PA:** ${par} | **RS:** ${arm} | **TP:** ${dmg}${desc}`, inline: false };
            });
            listEmbed.addFields(fieldsToShow);

            if (mobs.length > 15) {
                listEmbed.setFooter({ text: `Displaying ${fieldsToShow.length} of ${mobs.length} total mobs.` });
            } else {
                listEmbed.setFooter({ text: `Total mobs: ${mobs.length}` });
            }

            await interaction.editReply({ embeds: [listEmbed] });

        } catch (error) {
            console.error('Error executing /listmobs:', error);
            await interaction.editReply({ content: `❌ Error: ${error.message || 'Failed to fetch mob list.'}` });
        }
    }
};
