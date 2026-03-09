const { SlashCommandBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setuptestcharacter')
        .setDescription('Sets up a test character with default stats, weapons, and items.'),
    async execute(interaction) {
        const discordId = interaction.user.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            // 1. Create Player with Stats using edge function
            const { callEdgeFunction } = require('../utils/supabaseClient');
            const { data: result } = await callEdgeFunction('create-player', {
                name: 'Test Character',
                discordId: discordId,
            });

            const player = result?.player || result;
            const stats = result?.stats;

            if (!player?.id) {
                throw new Error('Failed to create player');
            }

            // 2. Update the newly created Stats
            if (stats?.id) {
                await supabase
                    .from('stats')
                    .update({
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
                    })
                    .eq('id', stats.id);
            }

            // 3. Create Weapons
            await supabase.from('weapons').insert([
                {
                    name: 'Test Sword',
                    type: 'MELEE',
                    tp: '1w6+2',
                    at: 12,
                    pa: 8,
                    is_equipped: 'Y',
                    equipped_slot: 'OFFENSE',
                    player_id: player.id,
                },
                {
                    name: 'Test Bow',
                    type: 'RANGED',
                    tp: '1w6+4',
                    at: 10,
                    pa: 0,
                    is_equipped: 'N',
                    player_id: player.id,
                }
            ]);

            // 4. Create Items
            await supabase.from('items').insert([
                {
                    name: 'Health Potion',
                    description: 'Restores 1d6+4 health.',
                    quantity: 3,
                    player_id: player.id,
                },
                {
                    name: 'Lockpicks',
                    description: 'A set of lockpicks.',
                    quantity: 1,
                    player_id: player.id,
                }
            ]);

            await interaction.editReply({ content: 'Test character created successfully!' });

        } catch (error) {
            console.error('Error setting up test character:', error);
            await interaction.editReply({ content: `An error occurred: ${error.message}` });
        }
    },
};
