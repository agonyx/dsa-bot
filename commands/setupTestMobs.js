const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const testMobs = [
    {
        name: 'Goblin Shaman',
        description: 'A cunning goblin with basic magical abilities.',
        baseMaxHP: 15,
        baseInitiative: 12,
        baseAttackValue: 9,
        baseParryValue: 7,
        baseArmorSoak: 1,
        baseDamageTP: '1w6+1'
    },
    {
        name: 'Orc Grunt',
        description: 'A brutish warrior, strong but not very bright.',
        baseMaxHP: 30,
        baseInitiative: 8,
        baseAttackValue: 13,
        baseParryValue: 10,
        baseArmorSoak: 3,
        baseDamageTP: '1w6+4'
    },
    {
        name: 'Forest Spider',
        description: 'A large, venomous spider that lurks in the woods.',
        baseMaxHP: 22,
        baseInitiative: 15,
        baseAttackValue: 12,
        baseParryValue: 8,
        baseArmorSoak: 2,
        baseDamageTP: '1w6+2'
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
                const response = await axios.post(`${process.env.BACKEND_URL}/mob`, mob);
                if (response.status === 201) {
                    results.push(`✅ Successfully created **${mob.name}**.`);
                    successCount++;
                } else {
                    results.push(`❌ Failed to create **${mob.name}** (Status: ${response.status}).`);
                    failCount++;
                }
            } catch (error) {
                let errorMessage = `❌ Failed to create **${mob.name}**.`;
                if (error.response?.status === 409) {
                    errorMessage += ' (Reason: Mob with this name already exists).';
                } else {
                    errorMessage += ' (Reason: An unknown error occurred).';
                }
                results.push(errorMessage);
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