const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('equipweapon')
        .setDescription('Equip a weapon for your selected character'),
    
    async execute(interaction) {
        try {

            
            // Defer the initial response
            await interaction.deferReply({ ephemeral: true });

            // Fetch player data
            const playerResponse = await axios.get(
                `${process.env.BACKEND_URL}/player/selected/${interaction.user.id}`
            );
            
            const player = playerResponse.data;
            if (!player?.weapons?.length) {
                return interaction.editReply({ 
                    content: player ? 'No weapons available!' : 'No selected character!',
                    components: []
                });
            }

            // Weapon selection menu
            const weaponMenu = new StringSelectMenuBuilder()
                .setCustomId('weapon_select')
                .setPlaceholder('Select a weapon')
                .addOptions(player.weapons.map(weapon => ({
                    label: weapon.name,
                    description: `${weapon.type} | TP: ${weapon.tp}`,
                    value: weapon.id.toString()
                })));

            const message = await interaction.editReply({
                content: 'Choose a weapon to equip:',
                components: [new ActionRowBuilder().addComponents(weaponMenu)]
            });

            // Weapon selection collector
            const weaponCollector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id && i.customId === 'weapon_select',
                time: 60_000
            });

            weaponCollector.on('collect', async weaponInteraction => {
                await weaponInteraction.deferUpdate();
                const weaponId = weaponInteraction.values[0];

                // Slot selection menu
                const slotMenu = new StringSelectMenuBuilder()
                    .setCustomId('slot_select')
                    .setPlaceholder('Select equipment slot')
                    .addOptions([
                        { label: 'Adaptive', value: 'ADAPTIVE' },
                        { label: 'Offense', value: 'OFFENSE' },
                        { label: 'Defense', value: 'DEFENSE' }
                    ]);

                const slotMessage = await interaction.editReply({
                    content: 'Choose equipment slot:',
                    components: [new ActionRowBuilder().addComponents(slotMenu)]
                });

                // Slot selection collector
                const slotCollector = slotMessage.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id && i.customId === 'slot_select',
                    time: 60_000
                });

                slotCollector.on('collect', async slotInteraction => {
                    await slotInteraction.deferUpdate();
                    const slot = slotInteraction.values[0];

                    try {
                        await axios.post(
                            `${process.env.BACKEND_URL}/weapon/equip/${weaponId}`,
                            { equippedSlot: slot }
                        );

                        await interaction.editReply({
                            content: `✅ Successfully equipped ${weaponInteraction.component.options.find(o => o.value === weaponId).label} in ${slot} slot!`,
                            components: []
                        });
                    } catch (error) {
                        console.error('Equip error:', error);
                        await interaction.editReply({
                            content: '❌ Failed to equip weapon!',
                            components: []
                        });
                    } finally {
                        weaponCollector.stop();
                        slotCollector.stop();
                    }
                });

                slotCollector.on('end', () => {
                    if (!slotCollector.collected.size) {
                        interaction.editReply({
                            content: '⌛ Slot selection timed out',
                            components: []
                        });
                    }
                });
            });

            weaponCollector.on('end', () => {
                if (!weaponCollector.collected.size) {
                    interaction.editReply({
                        content: '⌛ Weapon selection timed out',
                        components: []
                    });
                }
            });

        } catch (error) {
            console.error('Equip command error:', error);
            interaction.editReply({
                content: '❌ An error occurred while processing your request',
                components: []
            });
        }
    }
};