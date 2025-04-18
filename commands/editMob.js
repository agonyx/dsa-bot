// commands/combat/editmob.js (Using temporary listener, corrected message edit)

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

    /**
     * @param {Interaction} interaction - The initial command interaction
     */
    async execute(interaction) {
        const mobNameToEdit = interaction.options.getString('name');
        const instanceId = interaction.id; // Use interaction ID for some uniqueness if needed

        try {
            await interaction.deferReply({ ephemeral: true });

            // --- Fetch initial Mob data ---
            let mob; // Mutable mob variable
            try {
                const encodedName = encodeURIComponent(mobNameToEdit);
                console.log(`[EditMob ${instanceId}] Fetching mob "${mobNameToEdit}"`);
                const response = await axios.get(`${BACKEND_URL}/mob/name/${encodedName}`);
                if (!response.data?.id) throw new Error(`Mob "${mobNameToEdit}" not found or missing ID.`);
                mob = response.data;
                console.log(`[EditMob ${instanceId}] Found Mob ID: ${mob.id}`);
            } catch (fetchError) {
                 console.error(`[EditMob ${instanceId}] Failed fetch mob "${mobNameToEdit}"`, fetchError);
                 let errorMsg = `❌ Failed fetch mob template "${mobNameToEdit}".`;
                  if (axios.isAxiosError(fetchError) && fetchError.response) {
                       if (fetchError.response.status === 404) errorMsg = `❌ Mob template named **${mobNameToEdit}** not found.`;
                       else errorMsg = `❌ Backend Error (${fetchError.response.status}): ${fetchError.response.data?.message || 'Failed fetch.'}`;
                  }
                 return interaction.editReply({ content: errorMsg, ephemeral: true});
            }

            // --- Helper Functions (defined inside execute scope) ---
             const createMobStatSelect = (currentMobData) => new StringSelectMenuBuilder()
                 .setCustomId('editmob_stat_select') // Static ID for this command instance
                 .setPlaceholder('📝 Select mob stat to edit...')
                 .addOptions(MOB_STAT_CONFIG.map(stat => ({
                     label: stat.label, value: stat.key,
                     description: `Current: ${String(currentMobData[stat.backendKey] ?? 'N/A').substring(0, 95)}`
                 })));

             const createMobStatsEmbed = (currentMobData) => new EmbedBuilder()
                 .setColor(0x8B4513) .setTitle(`🔧 Editing Mob: ${currentMobData.name} (ID: ${currentMobData.id})`)
                 .setDescription(currentMobData.description || '*No description.*')
                 .addFields( MOB_STAT_CONFIG.filter(s => s.key !== 'description').map(stat => ({ name: `**${stat.label}**`, value: `\`${currentMobData[stat.backendKey] ?? 'N/A'}\``, inline: true })) )
                 .setFooter({ text: 'Session expires after 5 minutes' });

             const exitButton = new ButtonBuilder()
                 .setCustomId('editmob_exit_editor') // Static ID for this command instance
                 .setLabel('❌ Exit Editor')
                 .setStyle(ButtonStyle.Danger);
            // --- End Helpers ---

            const message = await interaction.editReply({ // Send the initial reply
                embeds: [createMobStatsEmbed(mob)],
                components: [ new ActionRowBuilder().addComponents(createMobStatSelect(mob)), new ActionRowBuilder().addComponents(exitButton) ],
                fetchReply: true // Need message object for collector
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id && i.message.id === message.id, // Filter for user and this specific message
                time: 300_000
            });

            // --- Temporary Modal Handler (Original Pattern) ---
            const modalHandler = async modalInteraction => {
                 if (!modalInteraction.isModalSubmit()) return;
                 // Check if it's an editmob modal for *this* specific command instance potentially?
                 // Simple check:
                 if (!modalInteraction.customId.startsWith('editmob_modal_')) return;
                 // More robust: Pass instanceId into modal customId and check here?
                 // e.g., `editmob_modal_${statKey}_${instanceId}`

                 if (collector.ended) { console.log(`Collector ended, ignoring modal ${modalInteraction.customId}`); try { await modalInteraction.deferUpdate({ephemeral: true}); } catch(e){/*ignore*/} return; }

                 try {
                     // Extract statKey (e.g., 'hp') from modal customId (assuming format `editmob_modal_{statKey}`)
                     const statKey = modalInteraction.customId.split('_')[2]; // Adjust index if format changes
                     const newValue = modalInteraction.fields.getTextInputValue('value');
                     const statConfig = MOB_STAT_CONFIG.find(s => s.key === statKey);
                     if (!statConfig) { throw new Error(`Invalid StatKey ${statKey} from modal`); }

                     let validatedValue;
                     // Validation...
                     if (statConfig.type === 'integer') {
                         validatedValue = parseInt(newValue);
                         if (isNaN(validatedValue)) { const m = await modalInteraction.reply({ content: `❌ ${statConfig.label} must be number!`, ephemeral: true, fetchReply: true }); setTimeout(() => m.delete().catch(console.error), 3000); return; }
                         if (statConfig.min !== undefined && validatedValue < statConfig.min) { const m = await modalInteraction.reply({ content: `❌ ${statConfig.label} must be >= ${statConfig.min}!`, ephemeral: true, fetchReply: true }); setTimeout(() => m.delete().catch(console.error), 3000); return; }
                     } else if (statConfig.type === 'string') {
                         validatedValue = newValue;
                          if (statConfig.validationRegex && !statConfig.validationRegex.test(validatedValue)) { const m = await modalInteraction.reply({ content: `❌ Invalid ${statConfig.label} format.`, ephemeral: true, fetchReply: true }); setTimeout(() => m.delete().catch(console.error), 3000); return; }
                     } else if (statConfig.type === 'string_long') {
                         validatedValue = newValue.trim() === '' ? null : newValue;
                     } else { throw new Error("Unknown stat type"); }

                     // Use current 'mob' variable from outer scope for comparison
                     if (mob[statConfig.backendKey] === validatedValue) {
                          const m = await modalInteraction.reply({ content: 'ℹ️ Value unchanged', ephemeral: true, fetchReply: true });
                          setTimeout(() => m.delete().catch(console.error), 2000); return;
                     }

                     // API Call (PUT full object)
                     console.log(`Attempting PUT ${BACKEND_URL}/mob/id/${mob.id} full object (Original Pattern)`);
                     const updatedMobData = { ...mob, [statConfig.backendKey]: validatedValue };
                     await axios.put(`${BACKEND_URL}/mob/id/${mob.id}`, updatedMobData);

                     // Refresh data and update ORIGINAL message
                     console.log("Mob stat updated, refreshing... (Original Pattern)");
                     // Use the interaction object from the execute scope to edit the original reply
                     const refreshedData = (await axios.get(`${BACKEND_URL}/mob/id/${mob.id}`)).data;
                     mob = refreshedData; // Update outer scope variable

                     // *** FIX: Use interaction.editReply instead of message.edit ***
                     await interaction.editReply({ // Use the original command interaction object
                         embeds: [createMobStatsEmbed(mob)], // Use new data
                         components: [
                             new ActionRowBuilder().addComponents(createMobStatSelect(mob)), // Use new data
                             new ActionRowBuilder().addComponents(exitButton)
                         ]
                     });
                     console.log("Original message updated via interaction.editReply. (Original Pattern)");

                     // Temporary success indicator
                     const successMsg = await modalInteraction.reply({ content: `🔄 Updated **${statConfig.label}** to \`${validatedValue ?? 'cleared'}\`!`, ephemeral: true, fetchReply: true });
                     // Auto-remove success message (still potentially unreliable)
                     setTimeout(() => successMsg.delete().catch(e => { if (e.code !== 10008) console.error("Error deleting success msg:", e); }), 2000);

                 } catch (error) { // Catch errors within modal processing
                     console.error('Modal Handler Error:', error);
                      if (!modalInteraction.replied && !modalInteraction.deferred && modalInteraction.isRepliable()) {
                          try {
                               const errorMsg = await modalInteraction.reply({ content: '❌ Failed to update mob stat!', ephemeral: true, fetchReply: true });
                               setTimeout(() => errorMsg.delete().catch(e => { if (e.code !== 10008) console.error("Error deleting error msg:", e); }), 3000);
                          } catch (replyError) { console.error("Failed trying to reply to modal error:", replyError); }
                      } else { console.error("Modal interaction already handled on error."); }
                 }
            }; // End of modalHandler function definition

            // --- Register Temporary Listener ---
             interaction.client.on('interactionCreate', modalHandler);
             console.log(`[EditMob ${interaction.id}] Registered temporary modal listener.`);

            // --- Collector Logic ---
            collector.on('collect', async i => {
                 // Handles select menu and exit button for THIS message instance
                 if (i.customId === 'editmob_stat_select' && i.isStringSelectMenu()) {
                    const statKey = i.values[0];
                    const statConfig = MOB_STAT_CONFIG.find(s => s.key === statKey);
                    const currentValue = mob[statConfig.backendKey]; // Use current outer 'mob'
                    if (!statConfig) { console.error("Invalid stat key in collector:", statKey); return; }

                    // Construct modal ID simply - modalHandler uses startsWith('editmob_modal_')
                    const modal = new ModalBuilder().setCustomId(`editmob_modal_${statKey}`).setTitle(`Edit ${statConfig.label} for ${mob.name}`);
                    const valueInput = new TextInputBuilder().setCustomId('value').setLabel(`Current: ${currentValue ?? 'N/A'}`).setStyle(statConfig.style).setPlaceholder(`Enter new ${statConfig.label}...`).setValue(currentValue != null ? String(currentValue) : '').setRequired(statConfig.key !== 'description');
                    if (statConfig.type === 'string_long') valueInput.setMinLength(0).setMaxLength(1000);
                    modal.addComponents(new ActionRowBuilder().addComponents(valueInput));

                    await i.showModal(modal); // Show the modal via select menu interaction

                 } else if (i.customId === 'editmob_exit_editor' && i.isButton()) {
                      console.log(`[Collector ${interaction.id}] Exit button matched.`); // Log match
                      try {
                         await i.update({ content: '✅ Editor closed.', components: [], embeds: [] });
                         collector.stop('user_exit');
                      } catch(exitUpdateError) {
                           console.error("Error updating on exit click:", exitUpdateError);
                           collector.stop('exit_error'); // Stop collector even if update fails
                      }
                 }
            });

            collector.on('end', (collected, reason) => {
                 console.log(`Original editMob collector ended (Instance ${interaction.id}). Reason: ${reason}`);
                if (reason !== 'user_exit') { // Don't edit if closed manually
                    interaction.editReply({ // Use interaction.editReply
                        content: '🕒 Session expired - Editor closed',
                        embeds: [createMobStatsEmbed(mob)], // Show last known state
                        components: []
                    }).catch(e => { if (e.code !== 10008) console.error("Error editing message on collector end:", e); });
                }
                 // --- Remove Temporary Listener ---
                 interaction.client.removeListener('interactionCreate', modalHandler);
                 console.log(`[EditMob ${interaction.id}] Removed temporary modal listener.`);
            });

        } catch (error) { // Catch errors from initial deferReply or mob fetch
            console.error(`EditMob Main Error (Instance ${interaction.id}):`, error);
            const errorMsg = '❌ Failed to initialize mob editor!';
             try {
                 if (!interaction.deferred && !interaction.replied) { await interaction.reply({ content: errorMsg, ephemeral: true }); }
                 else { await interaction.editReply({ content: errorMsg, components: [], embeds: [] }); }
             } catch (replyError) { console.error(`Error sending init error reply (Instance ${interaction.id}):`, replyError); }
        }
    }
};