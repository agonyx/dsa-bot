const { SlashCommandBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

const testMobs = [
    {
        name: 'Goblin Shaman',
        description: 'A cunning goblin with basic magical abilities.',
        base_max_hp: 15,
        base_initiative: 12,
        base_attack_value: 9,
        base_parry_value: 7,
        base_armor_soak: 1,
        base_damage_tp: '1w6+1'
    },
    {
        name: 'Orc Grunt',
        description: 'A brutish warrior, strong but not very bright.',
        base_max_hp: 30,
        base_initiative: 8,
        base_attack_value: 13,
        base_parry_value: 10,
        base_armor_soak: 3,
        base_damage_tp: '1w6+4'
    },
    {
        name: 'Forest Spider',
        description: 'A large, venomous spider that lurks in the woods.',
        base_max_hp: 22,
        base_initiative: 15,
        base_attack_value: 12,
        base_parry_value: 8,
        base_armor_soak: 2,
        base_damage_tp: '1w6+2'
    }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setuptestmobs')
        .setDescription('Creates a set of standard test mobs in the database.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const mob of testMobs) {
            try {
                const { error } = await supabase
                    .from('mobs')
                    .insert(mob);

                if (error) {
                    if (error.code === '23505') {
                        results.push(`❌ Failed to create **${mob.name}** (Mob with this name already exists).`);
                    } else {
                        results.push(`❌ Failed to create **${mob.name}** (${error.message}).`);
                    }
                    failCount++;
                } else {
                    results.push(`✅ Successfully created **${mob.name}**.`);
                    successCount++;
                }
            } catch (error) {
                results.push(`❌ Failed to create **${mob.name}** (${error.message}).`);
                failCount++;
            }
        }

        const replyMessage = `**Test Mob Setup Complete**\n\n` +
                             `- **Successful:** ${successCount}\n` +
                             `- **Failed:** ${failCount}\n\n` +
                             results.join('\n');

        await interaction.editReply({ content: replyMessage });
    },
};
