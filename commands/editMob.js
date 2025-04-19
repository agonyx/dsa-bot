// commands/combat/editmob.js (Using temporary listener, NO ephemeral modal feedback)

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, PermissionFlagsBits, Interaction } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL;
if (!BACKEND_URL) { console.error("FATAL: BACKEND_URL missing!"); }

// Configuration for editable mob stats
const MOB_STAT_CONFIG = [
    { key: 'hp', backendKey: 'baseMaxHP', label: 'Max HP', type: 'integer', min: 1, style: TextInputStyle.Short },
    { key: 'initiative', backendKey: 'baseInitiative', label: 'Initiative', type: 'integer', style: TextInputStyle.Short },
    { key: 'attack', backendKey: 'baseAttackValue', label: 'Attack (AT)', type: 'integer', min: 0, style: TextInputStyle.Short },
    { key: 'parry', backendKey: 'baseParryValue', label: 'Parry (PA)', type: 'integer', min: 0, style: TextInputStyle.Short },
    { key: 'armor', backendKey: 'baseArmorSoak', label: 'Armor (RS)', type: 'integer', min: 0, style: TextInputStyle.Short },
    { key: 'damage', backendKey: 'baseDamageTP', label: 'Damage (TP)', type: 'string', validationRegex: /^\d+w\d+(\s*\+\s*\d+)?$/i, style: TextInputStyle.Short },
    { key: 'description', backendKey: 'description', label: 'Description', type: 'string_long', style: TextInputStyle.Paragraph }
];

const damageDiceRegex = /^\d+w\d+(\s*\+\s*\d+)?$/i;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editmob')
        .setDescription('Interactively edits an existing mob template (Original Pattern).')
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

            let mob;
            try { // --- Fetch initial Mob data ---
                const encodedName = encodeURIComponent(mobNameToEdit);
                console.log(`[EditMob ${instanceId}] Fetching mob "${mobNameToEdit}"`);
                const response = await axios.get(`${BACKEND_URL}/mob/name/${encodedName}`);
                if (!response.data?.id) throw new Error(`Mob "${mobNameToEdit}" not found.`);
                mob = response.data;
            } catch (fetchError) { /* ... handle fetch error ... */
                 console.error(`[EditMob ${instanceId}] Failed fetch mob "${mobNameToEdit}"`, fetchError);
                 let errorMsg = `❌ Failed fetch mob template "${mobNameToEdit}".`;
                 if (axios.isAxiosError(fetchError) && fetchError.response) {
                     if (fetchError.response.status === 404) errorMsg = `❌ Mob template named **${mobNameToEdit}** not found.`;
                     else errorMsg = `❌ Backend Error (${fetchError.response.status}): ${fetchError.response.data?.message || 'Failed fetch.'}`;
                 }
                 return interaction.editReply({ content: errorMsg, ephemeral: true});
             }

            // --- Helper Functions ---
             const createMobStatSelect = (currentMobData) => new StringSelectMenuBuilder()
                 .setCustomId('editmob_stat_select').setPlaceholder('📝 Select mob stat...').addOptions(MOB_STAT_CONFIG.map(stat => ({ label: stat.label, value: stat.key, description: `Current: ${String(currentMobData[stat.backendKey] ?? 'N/A').substring(0, 95)}` })));
             const createMobStatsEmbed = (currentMobData) => new EmbedBuilder()
                 .setColor(0x8B4513).setTitle(`🔧 Editing Mob: ${currentMobData.name} (ID: ${currentMobData.id})`).setDescription(currentMobData.description || '*No description.*').addFields( MOB_STAT_CONFIG.filter(s => s.key !== 'description').map(stat => ({ name: `**${stat.label}**`, value: `\`${currentMobData[stat.backendKey] ?? 'N/A'}\``, inline: true })) ).setFooter({ text: 'Session expires after 5 minutes' });
             const exitButton = new ButtonBuilder().setCustomId('editmob_exit_editor').setLabel('❌ Exit Editor').setStyle(ButtonStyle.Danger);
            // --- End Helpers ---

            const message = await interaction.editReply({ embeds: [createMobStatsEmbed(mob)], components: [ new ActionRowBuilder().addComponents(createMobStatSelect(mob)), new ActionRowBuilder().addComponents(exitButton) ], fetchReply: true });
            const collector = message.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && i.message.id === message.id, time: 300_000 });

            // --- Temporary Modal Handler (Original Pattern) ---
            const modalHandler = async modalInteraction => {
                 if (!modalInteraction.isModalSubmit()) return;
                 if (!modalInteraction.customId.startsWith('editmob_modal_')) return;
                 if (collector.ended) { console.log("Collector ended, ignoring modal"); try { await modalInteraction.deferUpdate({ephemeral: true}); } catch(e){/*ignore*/} return; }

                 // Defer update immediately before processing to acknowledge
                 // This prevents "interaction failed" if processing takes time,
                 // but means we cannot use interaction.reply later, only followUp or editReply on original.
                 await modalInteraction.deferUpdate({ ephemeral: true });

                 try {
                     const statKey = modalInteraction.customId.split('_')[2];
                     const newValue = modalInteraction.fields.getTextInputValue('value');
                     const statConfig = MOB_STAT_CONFIG.find(s => s.key === statKey);
                     if (!statConfig) { throw new Error(`Invalid StatKey ${statKey}`); }

                     let validatedValue;
                     // Validation (Now just returns early on failure, no ephemeral message)
                     if (statConfig.type === 'integer') {
                         validatedValue = parseInt(newValue);
                         if (isNaN(validatedValue)) { console.error(`Validation fail: ${statConfig.label} not number`); return; }
                         if (statConfig.min !== undefined && validatedValue < statConfig.min) { console.error(`Validation fail: ${statConfig.label} < ${statConfig.min}`); return; }
                     } else if (statConfig.type === 'string') {
                         validatedValue = newValue;
                          if (statConfig.validationRegex && !statConfig.validationRegex.test(validatedValue)) { console.error(`Validation fail: ${statConfig.label} regex mismatch`); return; }
                     } else if (statConfig.type === 'string_long') {
                         validatedValue = newValue.trim() === '' ? null : newValue;
                     } else { throw new Error("Unknown stat type"); }

                     if (mob[statConfig.backendKey] === validatedValue) {
                          console.log("Value unchanged."); // Log instead of replying
                          return;
                     }

                     // --- API Call ---
                     console.log(`Attempting PUT ${BACKEND_URL}/mob/id/${mob.id} full object`);
                     const updatedMobData = { ...mob, [statConfig.backendKey]: validatedValue };
                     await axios.put(`${BACKEND_URL}/mob/id/${mob.id}`, updatedMobData);

                     // --- Refresh & Update ---
                     console.log("Mob stat updated, refreshing...");
                     const refreshedData = (await axios.get(`${BACKEND_URL}/mob/id/${mob.id}`)).data;
                     mob = refreshedData;

                     await interaction.editReply({ // Use original interaction
                         embeds: [createMobStatsEmbed(mob)],
                         components: [ new ActionRowBuilder().addComponents(createMobStatSelect(mob)), new ActionRowBuilder().addComponents(exitButton) ]
                     });
                     console.log("Original message updated.");

                     // *** NO success message sent here ***

                 } catch (error) {
                     console.error(`Modal Handler Error (Instance ${instanceId}):`, error);
                     // We cannot reliably reply here as the interaction was already deferred.
                     // Maybe try a followup on the original interaction? Risky.
                     // interaction.followUp({ content: '❌ Failed to update mob stat!', ephemeral: true }).catch(console.error);
                 }
            }; // End of modalHandler

            // Register Listener
             interaction.client.on('interactionCreate', modalHandler);
             console.log(`[EditMob ${interaction.id}] Registered temporary modal listener.`);

            // Collector Logic
            collector.on('collect', async i => {
                 if (i.customId === 'editmob_stat_select' && i.isStringSelectMenu()) {
                    const statKey = i.values[0]; const statConfig = MOB_STAT_CONFIG.find(s => s.key === statKey); const currentValue = mob[statConfig.backendKey]; if (!statConfig) { return; }
                    const modal = new ModalBuilder().setCustomId(`editmob_modal_${statKey}`).setTitle(`Edit ${statConfig.label} for ${mob.name}`);
                    const valueInput = new TextInputBuilder().setCustomId('value').setLabel(`Current: ${currentValue ?? 'N/A'}`).setStyle(statConfig.style).setPlaceholder(`Enter new ${statConfig.label}...`).setValue(currentValue != null ? String(currentValue) : '').setRequired(statConfig.key !== 'description');
                    if (statConfig.type === 'string_long') valueInput.setMinLength(0).setMaxLength(1000);
                    modal.addComponents(new ActionRowBuilder().addComponents(valueInput));
                    await i.showModal(modal);
                 } else if (i.customId === 'editmob_exit_editor' && i.isButton()) {
                      console.log(`[Collector ${interaction.id}] Exit button matched.`);
                      try { await i.update({ content: '✅ Editor closed.', components: [], embeds: [] }); collector.stop('user_exit'); }
                      catch(exitUpdateError) { console.error("Error updating on exit click:", exitUpdateError); collector.stop('exit_error'); }
                 }
            });

            collector.on('end', (collected, reason) => {
                 console.log(`Original editMob collector ended (Instance ${interaction.id}). Reason: ${reason}`);
                if (reason !== 'user_exit') {
                    interaction.editReply({ content: '🕒 Session expired - Editor closed', embeds: [createMobStatsEmbed(mob)], components: [] }) .catch(e => { if (e.code !== 10008) console.error("Error editing message on collector end:", e); });
                }
                 interaction.client.removeListener('interactionCreate', modalHandler);
                 console.log(`[EditMob ${interaction.id}] Removed temporary modal listener.`);
            });

        } catch (error) { // Catch errors from initial deferReply or mob fetch
            console.error(`EditMob Main Error (Instance ${interaction.id}):`, error);
            const errorMsg = '❌ Failed to initialize mob editor!';
             try { if (!interaction.deferred && !interaction.replied) { await interaction.reply({ content: errorMsg, ephemeral: true }); } else { await interaction.editReply({ content: errorMsg, components: [], embeds: [] }); } }
             catch (replyError) { console.error(`Error sending init error reply (Instance ${interaction.id}):`, replyError); }
        }
    }
};