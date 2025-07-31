const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setuptestcharacter')
        .setDescription('Sets up a test character with default stats, weapons, and items.'),
    async execute(interaction) {
        const discordId = interaction.user.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            // 1. Create Player
            const playerResponse = await axios.post(`${process.env.BACKEND_URL}/player`, {
                name: 'Test Character',
                discordId: discordId,
            });
            const player = playerResponse.data.player;
            const stats = playerResponse.data.stats;

            // 2. Update the newly created Stats
            await axios.put(`${process.env.BACKEND_URL}/stats/${stats.id}`, {
                mu: 10,
                kl: 10,
                in: 10,
                ch: 10,
                ff: 10,
                ge: 10,
                ko: 10,
                kk: 10,
                le_max: 20,
                le_current: 20,
                initiative: 10,
                ruestungsschutz: 2,
                ausweichen: 5,
            });

            // 3. Create Weapons
            await axios.post(`${process.env.BACKEND_URL}/weapon`, {
                name: 'Test Sword',
                type: 'MELEE',
                tp: '1w6+2',
                at: 12,
                pa: 8,
                isEquipped: 'Y',
                equippedSlot: 'OFFENSE',
                player: { id: player.id },
            });

            await axios.post(`${process.env.BACKEND_URL}/weapon`, {
                name: 'Test Bow',
                type: 'RANGED',
                tp: '1w6+4',
                at: 10,
                pa: 0,
                isEquipped: 'N',
                player: { id: player.id },
            });

            // 4. Create Items
            await axios.post(`${process.env.BACKEND_URL}/item`, {
                name: 'Health Potion',
                description: 'Restores 1d6+4 health.',
                quantity: 3,
                player: { id: player.id },
            });

            await axios.post(`${process.env.BACKEND_URL}/item`, {
                name: 'Lockpicks',
                description: 'A set of lockpicks.',
                quantity: 1,
                player: { id: player.id },
            });

            await interaction.editReply({ content: 'Test character created successfully!' });

        } catch (error) {
            console.error('Error setting up test character:', error);
            await interaction.editReply({ content: 'An error occurred while setting up the test character.' });
        }
    },
};
