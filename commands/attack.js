// commands/combat/attack.js (Refactored & Fixed v2)

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, Interaction, ComponentType } = require('discord.js');
// Import the NEW utility functions from the correct path
const { resolveAttack, parseAndRollDamage } = require('../utils/combatUtils'); // Adjust path if necessary
const axios = require('axios');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL;
if (!BACKEND_URL) { console.error("FATAL: BACKEND_URL missing!"); }

// Local rollDamage function and old rollDice import are REMOVED

/**
 * Executes the attack logic using combatUtils. Handles initial command and button follow-ups.
 * @param {Interaction} currentInteraction - The interaction triggering this execution (Command or Button).
 * @param {boolean} [isFollowUp=false] - Flag indicating if this is a follow-up from a button press.
 */
async function executeAttack(currentInteraction, isFollowUp = false) {
    const interaction = currentInteraction; // Use consistent variable name locally
    let interactionAcknowledged = false; // Track initial acknowledgement

    try {
        // Defer ONLY for the initial slash command run
        if (!isFollowUp && interaction.isChatInputCommand()) {
            await interaction.deferReply();
            interactionAcknowledged = true;
            console.log("[Attack Command] Initial command deferred.");
        }
        // REMOVED redundant deferUpdate for button follow-up (isFollowUp = true)
        // Acknowledgement now happens via buttonInteraction.update() in the collector below

        const discordId = interaction.user.id;
        const originalUsername = interaction.user.username;

        // --- Fetch player and weapon data ---
        let player;
        let weapon;
        try {
            console.log(`[Attack Command ${isFollowUp ? '(FollowUp)' : '(Initial)'}] Fetching player data for ${discordId}`);
            const playerResponse = await axios.get(`${BACKEND_URL}/player/selected/${discordId}`, {
                params: { relations: ['weapons', 'stats'] } // Ensure relations needed are fetched
            });
            player = playerResponse.data;

            if (!player || !player.stats) { throw new Error('❌ No character or stats found! Select a character first.'); }
            if (!Array.isArray(player.weapons)) { throw new Error('❌ Character weapon data invalid.'); }

            weapon = player.weapons.find(w => w.isEquipped === "Y" && (w.equippedSlot === "OFFENSE" || w.equippedSlot === "ADAPTIVE"));
            if (!weapon) { throw new Error(`❌ ${originalUsername}, no weapon equipped in OFFENSE or ADAPTIVE slot.`); }
            if (weapon.at === undefined || weapon.at === null || !weapon.tp) { throw new Error(`❌ Equipped weapon "${weapon.name}" is missing AT or TP values.`); } // Added check for undefined/null AT

            console.log(`[Attack Command] Attacking with ${weapon.name} (AT: ${weapon.at}, TP: ${weapon.tp})`);

        } catch (fetchError) {
            console.error(`[Attack Command ${isFollowUp ? '(FollowUp)' : '(Initial)'}] Error fetching data:`, fetchError);
            const content = (fetchError instanceof Error) ? fetchError.message : '❌ Error fetching data.';
             try { // Reply handling based on context
                  if (!isFollowUp && interactionAcknowledged) { await interaction.editReply({ content, components: [], embeds: []}); }
                  else if (isFollowUp && interaction.isButton()) { await interaction.followUp({ content, ephemeral: true }); }
                  else if (interaction.isRepliable()) { await interaction.reply({ content, ephemeral: true }); }
             } catch (replyError) { console.error("Failed to send fetch error reply:", replyError); }
             return;
        }

        // --- Resolve Attack using Utility ---
        const attackResult = resolveAttack(weapon.at);

        let damage = 0;
        let description = '';
        const files = [];
        const extraFields = [];
        let embedColor = 0x808080; // Use numeric color (grey)

        // Fetch avatar
        if (player.avatar) {
             try { const url = `${BACKEND_URL}/uploads/${player.avatar}`; const img = await axios.get(url, { responseType: 'arraybuffer' }); files.push(new AttachmentBuilder(Buffer.from(img.data), { name: 'avatar.png' })); }
             catch (e) { console.warn("Failed avatar fetch:", e.message); }
        }

        // --- Determine Outcome based on attackResult ---
        switch (attackResult.outcome) {
            case 'CRITICAL_SUCCESS':
                description = `🎯 **CRITICAL HIT!**`; embedColor = 0xFFD700; // Gold
                extraFields.push({ name: 'Crit Confirm', value: `Roll: \`${attackResult.confirmRoll}\` vs AT: \`${weapon.at}\``, inline: true });
                try { damage = parseAndRollDamage(weapon.tp) * 2; } catch (tpError) { console.error("TP Err Crit:", tpError); description += `\n⚠️ Dmg Err!`; damage = 0; }
                break;
            case 'BOTCH':
                description = `💥 **BOTCH CONFIRMED!**`; embedColor = 0x000001; // Black
                extraFields.push({ name: 'Botch Confirm', value: `Roll: \`${attackResult.confirmRoll}\` vs AT: \`${weapon.at}\``, inline: true });
                extraFields.push({ name: 'Consequence', value: 'Attack fails disastrously!', inline: false }); damage = 0;
                break;
            case 'NORMAL_HIT':
                description = `✅ **Hit!**`; embedColor = 0x57F287; // Green
                if (attackResult.confirmRoll !== null && attackResult.roll === 1) { description = `⚠️ **Critical Failed!** (Normal Hit)`; extraFields.push({ name: 'Crit Confirm Fail', value: `Roll: \`${attackResult.confirmRoll}\` vs AT: \`${weapon.at}\``, inline: true }); }
                try { damage = parseAndRollDamage(weapon.tp); } catch (tpError) { console.error("TP Err Hit:", tpError); description += `\n⚠️ Dmg Err!`; damage = 0; }
                break;
            case 'NORMAL_MISS':
            default:
                description = '❌ **Miss!**'; embedColor = 0xED4245; // Red
                 if (attackResult.confirmRoll !== null && attackResult.roll === 20) { description = `✅ **Botch Averted!** (Miss)`; extraFields.push({ name: 'Botch Averted', value: `Roll: \`${attackResult.confirmRoll}\` vs AT: \`${weapon.at}\``, inline: true }); }
                damage = 0;
                break;
        }

        // --- Build Embed ---
        // *** FIX: Ensure description is never empty string ***
        const finalDescription = description || '\u200B'; // Use zero-width space if empty

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`⚔️ ${player.name}'s Attack`)
            .setThumbnail(files.length > 0 ? 'attachment://avatar.png' : null)
            .setDescription(finalDescription) // Use guaranteed non-empty description
            .addFields(
                { name: 'Weapon', value: `\`${weapon.name}\`\nAT: \`${weapon.at}\` | TP: \`${weapon.tp}\``, inline: true },
                { name: 'Attack Roll', value: `\`${attackResult.roll}\``, inline: true },
                ...extraFields,
                 { name: 'Damage Dealt', value: damage > 0 ? `💥 \`${damage}\`` : 'None', inline: false } // Always inline: false
            );

        // --- Setup Button and Action Row ---
        const attackButton = new ButtonBuilder()
            .setCustomId('attack_cmd_rerun')
            .setLabel('Attack Again')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji({ name: '⚔️' });

        const actionRow = new ActionRowBuilder().addComponents(attackButton);

        // --- Send Reply ---
        const replyOptions = { embeds: [embed], components: [actionRow], files, fetchReply: true };
        let message;

        if (!isFollowUp) {
            console.log(`[Attack Command (Initial)] Sending editReply for interaction ${interaction.id}`);
            message = await interaction.editReply(replyOptions);
        } else {
            // Send a new public message as a follow-up to the button interaction
            console.log(`[Attack Command (FollowUp)] Sending followUp for interaction ${interaction.id}`);
            message = await interaction.followUp({...replyOptions, ephemeral: false }); // Followups usually public
        }

        // --- Setup Button Collector for the NEW message ---
        console.log(`[Attack Command ${isFollowUp ? '(FollowUp)' : '(Initial)'}] Setting up collector for message ${message.id}`);
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.customId === 'attack_cmd_rerun' && i.user.id === discordId,
            time: 30_000
        });

        collector.on('collect', async buttonInteraction => {
            // buttonInteraction is the new interaction from clicking THIS button
            console.log(`[Attack Command] Rerunning attack for ${buttonInteraction.user.username} (Button ID: ${buttonInteraction.id})`);
            collector.stop('rerun');

             try { // Disable button on the message just clicked
                 const disabledButton = ButtonBuilder.from(attackButton).setDisabled(true);
                 const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
                 // Use update() on the buttonInteraction to acknowledge it AND edit the message
                 await buttonInteraction.update({ components: [disabledRow] }); // This acknowledges
                 console.log(`[Attack Command] Disabled button via interaction update for ${buttonInteraction.id}`);
             } catch (updateError) { console.error("Failed to disable button on rerun:", updateError); }

             // Pass the buttonInteraction, which is now acknowledged
             await executeAttack(buttonInteraction, true);

        });

        collector.on('end', (collected, reason) => {
            // If collector timed out, disable the button on the message it was attached to
            if (reason !== 'rerun') {
                console.log(`[Attack Command] Collector timed out for message ${message.id}`);
                 const disabledButton = ButtonBuilder.from(attackButton).setDisabled(true);
                 const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
                 // Edit the specific message
                 message.edit({ components: [disabledRow] }).catch(e => { if (e.code !== 10008) console.error("Failed to disable button on timeout:", e) });
            }
        });

    } catch (error) { // Catch unexpected errors
        console.error(`[Attack Command ${isFollowUp ? '(FollowUp)' : '(Initial)'}] Unhandled Error in executeAttack:`, error);
        const content = '❌ An unexpected error occurred processing your attack.';
         try { // Try to send final error based on interaction state
              if (!isFollowUp && interactionAcknowledged) { await interaction.editReply({ content, components:[], embeds:[] }); }
              else if (isFollowUp && interaction.isButton()) { await interaction.followUp({ content, ephemeral: true }); }
              else if (interaction.isRepliable()) { await interaction.reply({ content, ephemeral: true }); } // Fallback
         } catch (replyError) { console.error('Failed to send final attack error reply:', replyError); }
    }
}

// --- module.exports ---
module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Perform a standalone combat attack (uses combat utils).'),
    execute: executeAttack
};