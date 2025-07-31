const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const STAT_CONFIG = [
    { key: 'mu', label: 'MU' },
    { key: 'kl', label: 'KL' },
    { key: 'in', label: 'IN' },
    { key: 'ch', label: 'CH' },
    { key: 'ff', label: 'FF' },
    { key: 'ge', label: 'GE' },
    { key: 'ko', label: 'KO' },
    { key: 'kk', label: 'KK' },
    { key: 'le_max', label: 'Max LP' },
    { key: 'le_current', label: 'Current LP' },
    { key: 'initiative', label: 'Initiative' },
    { key: 'ruestungsschutz', label: 'Armor (RS)' },
    { key: 'ausweichen', label: 'Ausweichen' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editstats')
        .setDescription('Edit your character stats through an interactive interface'),
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const playerResponse = await axios.get(`${process.env.BACKEND_URL}/player/selected/${interaction.user.id}`);
            let player = playerResponse.data;

            if (!player?.stats) {
                return interaction.editReply('❌ No character stats found! Select a character first.');
            }

            // Helper functions
            const createStatSelect = (stats) => new StringSelectMenuBuilder()
                .setCustomId('stat_select')
                .setPlaceholder('📝 Select stat to edit...')
                .addOptions(STAT_CONFIG.map(stat => ({
                    label: stat.label,
                    value: stat.key,
                    description: `Current: ${stats[stat.key]}`
                })));

            const createStatsEmbed = (stats) => new EmbedBuilder()
                .setColor(0x2F3136)
                .setTitle('🔧 Character Stat Editor')
                .setThumbnail(player.avatar ? `${process.env.BACKEND_URL}/uploads/${player.avatar}` : null)
                .setDescription('**Select a stat from the dropdown below to modify it**')
                .addFields(
                    STAT_CONFIG.map(stat => ({
                        name: `**${stat.label}**`,
                        value: `\`${stats[stat.key]}\``,
                        inline: true
                    }))
                )
                .setFooter({ text: 'Session expires after 5 minutes of inactivity' });

            const exitButton = new ButtonBuilder()
                .setCustomId('exit_editor')
                .setLabel('❌ Exit')
                .setStyle(ButtonStyle.Danger);

            const message = await interaction.editReply({
                embeds: [createStatsEmbed(player.stats)],
                components: [
                    new ActionRowBuilder().addComponents(createStatSelect(player.stats)),
                    new ActionRowBuilder().addComponents(exitButton)
                ]
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 300_000
            });

            collector.on('collect', async i => {
                if (i.customId === 'stat_select') {
                    const statKey = i.values[0];
                    const statConfig = STAT_CONFIG.find(s => s.key === statKey);
                    const currentValue = player.stats[statKey];

                    const modal = new ModalBuilder()
                        .setCustomId(`edit_${statKey}`)
                        .setTitle(`Edit ${statConfig.label}`)
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('value')
                                    .setLabel(`Current: ${currentValue}`)
                                    .setStyle(TextInputStyle.Short)
                                    .setPlaceholder('Enter new value...')
                                    .setValue(currentValue.toString())
                                    .setRequired(true)
                            )
                        );

                    await i.showModal(modal);
                } else if (i.customId === 'exit_editor') {
                    await i.update({
                        content: '✅ Editor closed successfully',
                        components: [],
                        embeds: []
                    });
                    collector.stop();
                }
            });

            const modalHandler = async modalInteraction => {
                if (!modalInteraction.isModalSubmit()) return;
                if (!modalInteraction.customId.startsWith('edit_')) return;

                try {
                    const statKey = modalInteraction.customId.replace('edit_', '');
                    const newValue = modalInteraction.fields.getTextInputValue('value');
                    const parsedValue = parseInt(newValue);
                    const statLabel = STAT_CONFIG.find(s => s.key === statKey)?.label || 'Unknown Stat';

                    // Validation checks
                    if (isNaN(parsedValue)) {
                        const msg = await modalInteraction.reply({
                            content: '❌ Must be a whole number!',
                            ephemeral: true
                        });
                        setTimeout(() => msg.delete(), 3000);
                        return;
                    }

                    if (!player.stats.hasOwnProperty(statKey)) {
                        const msg = await modalInteraction.reply({
                            content: '❌ Invalid stat selection!',
                            ephemeral: true
                        });
                        setTimeout(() => msg.delete(), 3000);
                        return;
                    }

                    if (player.stats[statKey] === parsedValue) {
                        const msg = await modalInteraction.reply({
                            content: 'ℹ️ Value unchanged',
                            ephemeral: true
                        });
                        setTimeout(() => msg.delete(), 2000);
                        return;
                    }

                    // Update stats
                    const updatedStats = { ...player.stats, [statKey]: parsedValue };
                    await axios.put(`${process.env.BACKEND_URL}/stats/${player.stats.id}`, updatedStats);

                    // Refresh data and update interface
                    const refreshedData = (await axios.get(
                        `${process.env.BACKEND_URL}/player/selected/${interaction.user.id}`
                    )).data;
                    player = refreshedData;

                    await interaction.editReply({
                        embeds: [createStatsEmbed(refreshedData.stats)],
                        components: [
                            new ActionRowBuilder().addComponents(createStatSelect(refreshedData.stats)),
                            new ActionRowBuilder().addComponents(exitButton)
                        ]
                    });

                    // Temporary success indicator
                    const successMsg = await modalInteraction.reply({
                        content: `🔄 Updated **${statLabel}** to \`${parsedValue}\`!`,
                        ephemeral: true
                    });
                    
                    // Auto-remove success message after 2 seconds
                    setTimeout(async () => {
                        await successMsg.delete().catch(console.error);
                    }, 2000);

                } catch (error) {
                    console.error('Modal Error:', error);
                    const errorMsg = await modalInteraction.reply({
                        content: '❌ Failed to update stat!',
                        ephemeral: true
                    });
                    setTimeout(() => errorMsg.delete(), 3000);
                }
            };

            interaction.client.on('interactionCreate', modalHandler);

            collector.on('end', () => {
                interaction.editReply({
                    content: '🕒 Session expired - Editor closed',
                    components: []
                });
                interaction.client.removeListener('interactionCreate', modalHandler);
            });

        } catch (error) {
            console.error('EditStats Error:', error);
            interaction.editReply('❌ Failed to initialize editor!');
        }
    }
};