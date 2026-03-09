const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, PermissionFlagsBits, Interaction } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');

const MOB_STAT_CONFIG = [
    { key: 'hp', backendKey: 'base_max_hp', label: 'Max HP', type: 'integer', min: 1, style: TextInputStyle.Short },
    { key: 'initiative', backendKey: 'base_initiative', label: 'Initiative', type: 'integer', style: TextInputStyle.Short },
    { key: 'attack', backendKey: 'base_attack_value', label: 'Attack (AT)', type: 'integer', min: 0, style: TextInputStyle.Short },
    { key: 'parry', backendKey: 'base_parry_value', label: 'Parry (PA)', type: 'integer', min: 0, style: TextInputStyle.Short },
    { key: 'armor', backendKey: 'base_armor_soak', label: 'Armor (RS)', type: 'integer', min: 0, style: TextInputStyle.Short },
    { key: 'damage', backendKey: 'base_damage_tp', label: 'Damage (TP)', type: 'string', validationRegex: /^\d+w\d+(\s*\+\s*\d+)?$/i, style: TextInputStyle.Short },
    { key: 'description', backendKey: 'description', label: 'Description', type: 'string_long', style: TextInputStyle.Paragraph }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editmob')
        .setDescription('Interactively edits an existing mob template.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addStringOption(option => option
            .setName('name')
            .setDescription('The current name of the mob template to edit.')
            .setRequired(true)
            .setMaxLength(100)),

    async execute(interaction) {
        const mobNameToEdit = interaction.options.getString('name');
        const instanceId = interaction.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            // Fetch initial Mob data
            const { data: mob, error: fetchError } = await supabase
                .from('mobs')
                .select('*')
                .eq('name', mobNameToEdit)
                .single();

            if (fetchError || !mob) {
                return interaction.editReply({ 
                    content: `❌ Mob template named **${mobNameToEdit}** not found.` 
                });
            }

            let currentMob = mob;

            // Helper Functions
            const createMobStatSelect = (currentMobData) => new StringSelectMenuBuilder()
                .setCustomId('editmob_stat_select')
                .setPlaceholder('📝 Select mob stat...')
                .addOptions(MOB_STAT_CONFIG.map(stat => ({ 
                    label: stat.label, 
                    value: stat.key, 
                    description: `Current: ${String(currentMobData[stat.backendKey] ?? 'N/A').substring(0, 95)}` 
                })));

            const createMobStatsEmbed = (currentMobData) => new EmbedBuilder()
                .setColor(0x8B4513)
                .setTitle(`🔧 Editing Mob: ${currentMobData.name} (ID: ${currentMobData.id})`)
                .setDescription(currentMobData.description || '*No description.*')
                .addFields(MOB_STAT_CONFIG.filter(s => s.key !== 'description').map(stat => ({ 
                    name: `**${stat.label}**`, 
                    value: `\`${currentMobData[stat.backendKey] ?? 'N/A'}\``, 
                    inline: true 
                })))
                .setFooter({ text: 'Session expires after 5 minutes' });

            const exitButton = new ButtonBuilder()
                .setCustomId('editmob_exit_editor')
                .setLabel('❌ Exit Editor')
                .setStyle(ButtonStyle.Danger);

            const message = await interaction.editReply({ 
                embeds: [createMobStatsEmbed(currentMob)], 
                components: [
                    new ActionRowBuilder().addComponents(createMobStatSelect(currentMob)), 
                    new ActionRowBuilder().addComponents(exitButton)
                ], 
                fetchReply: true 
            });

            const collector = message.createMessageComponentCollector({ 
                filter: i => i.user.id === interaction.user.id && i.message.id === message.id, 
                time: 300_000 
            });

            // Modal Handler
            const modalHandler = async modalInteraction => {
                if (!modalInteraction.isModalSubmit()) return;
                if (!modalInteraction.customId.startsWith('editmob_modal_')) return;
                if (collector.ended) return;

                await modalInteraction.deferUpdate({ ephemeral: true });

                try {
                    const statKey = modalInteraction.customId.split('_')[2];
                    const newValue = modalInteraction.fields.getTextInputValue('value');
                    const statConfig = MOB_STAT_CONFIG.find(s => s.key === statKey);
                    if (!statConfig) throw new Error(`Invalid StatKey ${statKey}`);

                    let validatedValue;
                    if (statConfig.type === 'integer') {
                        validatedValue = parseInt(newValue);
                        if (isNaN(validatedValue)) return;
                        if (statConfig.min !== undefined && validatedValue < statConfig.min) return;
                    } else if (statConfig.type === 'string') {
                        validatedValue = newValue;
                        if (statConfig.validationRegex && !statConfig.validationRegex.test(validatedValue)) return;
                    } else if (statConfig.type === 'string_long') {
                        validatedValue = newValue.trim() === '' ? null : newValue;
                    } else {
                        throw new Error("Unknown stat type");
                    }

                    if (currentMob[statConfig.backendKey] === validatedValue) return;

                    // Update in Supabase
                    const { error: updateError } = await supabase
                        .from('mobs')
                        .update({ [statConfig.backendKey]: validatedValue })
                        .eq('id', currentMob.id);

                    if (updateError) throw updateError;

                    // Refresh data
                    const { data: refreshedData, error: refreshError } = await supabase
                        .from('mobs')
                        .select('*')
                        .eq('id', currentMob.id)
                        .single();

                    if (refreshError) throw refreshError;
                    currentMob = refreshedData;

                    await interaction.editReply({
                        embeds: [createMobStatsEmbed(currentMob)],
                        components: [
                            new ActionRowBuilder().addComponents(createMobStatSelect(currentMob)), 
                            new ActionRowBuilder().addComponents(exitButton)
                        ]
                    });

                } catch (error) {
                    console.error(`Modal Handler Error (Instance ${instanceId}):`, error);
                }
            };

            interaction.client.on('interactionCreate', modalHandler);

            collector.on('collect', async i => {
                if (i.customId === 'editmob_stat_select' && i.isStringSelectMenu()) {
                    const statKey = i.values[0];
                    const statConfig = MOB_STAT_CONFIG.find(s => s.key === statKey);
                    if (!statConfig) return;
                    const currentValue = currentMob[statConfig.backendKey];

                    const modal = new ModalBuilder()
                        .setCustomId(`editmob_modal_${statKey}`)
                        .setTitle(`Edit ${statConfig.label} for ${currentMob.name}`);

                    const valueInput = new TextInputBuilder()
                        .setCustomId('value')
                        .setLabel(`Current: ${currentValue ?? 'N/A'}`)
                        .setStyle(statConfig.style)
                        .setPlaceholder(`Enter new ${statConfig.label}...`)
                        .setValue(currentValue != null ? String(currentValue) : '')
                        .setRequired(statConfig.key !== 'description');

                    if (statConfig.type === 'string_long') valueInput.setMinLength(0).setMaxLength(1000);
                    modal.addComponents(new ActionRowBuilder().addComponents(valueInput));
                    await i.showModal(modal);

                } else if (i.customId === 'editmob_exit_editor' && i.isButton()) {
                    try {
                        await i.update({ content: '✅ Editor closed.', components: [], embeds: [] });
                        collector.stop('user_exit');
                    } catch (exitUpdateError) {
                        console.error("Error updating on exit click:", exitUpdateError);
                        collector.stop('exit_error');
                    }
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason !== 'user_exit') {
                    interaction.editReply({ 
                        content: '🕒 Session expired - Editor closed', 
                        embeds: [createMobStatsEmbed(currentMob)], 
                        components: [] 
                    }).catch(e => { if (e.code !== 10008) console.error("Error editing message on collector end:", e); });
                }
                interaction.client.removeListener('interactionCreate', modalHandler);
            });

        } catch (error) {
            console.error(`EditMob Main Error (Instance ${interaction.id}):`, error);
            const errorMsg = '❌ Failed to initialize mob editor!';
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.reply({ content: errorMsg, ephemeral: true });
                } else {
                    await interaction.editReply({ content: errorMsg, components: [], embeds: [] });
                }
            } catch (replyError) {
                console.error(`Error sending init error reply:`, replyError);
            }
        }
    }
};
