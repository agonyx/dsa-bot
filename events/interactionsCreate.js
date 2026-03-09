const { InteractionType, ComponentType } = require('discord.js');
const { supabase, callEdgeFunction } = require('../utils/supabaseClient');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (interaction.type === InteractionType.MessageComponent && interaction.componentType === ComponentType.StringSelect) {
            if (interaction.customId === 'select-character') {
                const selectedPlayerId = interaction.values[0];
                const discordId = interaction.user.id;

                try {
                    const { data: player, error: fetchError } = await supabase
                        .from('players')
                        .select('name')
                        .eq('id', selectedPlayerId)
                        .single();

                    if (fetchError) throw fetchError;

                    await callEdgeFunction('set-selected-player', {
                        playerId: parseInt(selectedPlayerId),
                        discordId: discordId
                    });

                    await interaction.update({ content: `You have selected the character: ${player.name}.`, components: [] });
                } catch (error) {
                    console.error('Error selecting character:', error);
                    await interaction.update({ content: 'An error occurred while selecting your character. Please try again later.', components: [] });
                }
            }
        }
    },
};
