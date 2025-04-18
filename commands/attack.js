const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, Interaction } = require('discord.js');
const { rollDice } = require('../utils/rollUtil'); // Assuming this utility exists and works
const axios = require('axios');
require('dotenv').config();

// Function to parse TP string and roll dice (Keep this as is)
function rollDamage(tp) {
    // ... (implementation from your code) ...
    const tpRegex = /^(\d+)w(\d+)(\+(\d+))?$/;
    const match = tp.match(tpRegex);
    if (!match) throw new Error('Invalid TP format. Expected format like "2w6" or "1w8+2".');

    const numDice = parseInt(match[1], 10);
    const numSides = parseInt(match[2], 10);
    const constant = parseInt(match[4]) || 0;

    if (numSides <= 0) throw new Error('Dice must have at least 1 side.');
    if (numDice <= 0) throw new Error('Must roll at least 1 die.');

    let total = constant;
    for (let i = 0; i < numDice; i++) {
        total += rollDice(numSides);
    }
    return total;
}

/**
 * Executes the attack logic, handling both initial command and follow-up button interactions.
 * @param {Interaction} interaction - The incoming interaction (ChatInputCommandInteraction or ButtonInteraction).
 * @param {boolean} [isFollowUp=false] - Flag indicating if this is a follow-up from a button press.
 */
async function executeAttack(interaction, isFollowUp = false) {
    try {
        if (!isFollowUp) {
            await interaction.deferReply();
        }

        const discordId = interaction.user.id;
        const originalUsername = interaction.user.username;

        // Fetch player data (Keep this part)
        let player;
        try {
            const playerResponse = await axios.get(`${process.env.BACKEND_URL}/player/selected/${discordId}`, {
                params: { relations: ['weapons', 'stats'] }
            });
            player = playerResponse.data;
        } catch (backendError) {
            console.error(`Backend Error fetching player data for ${discordId}:`, backendError.message);
            const content = '❌ Could not fetch your character data from the backend.';
            const replyMethod = isFollowUp ? interaction.followUp.bind(interaction) : interaction.editReply.bind(interaction);
            return replyMethod({ content, ephemeral: true });
        }

        // Check player and weapon data (Keep this part)
        if (!player || !Array.isArray(player.weapons)) {
            const content = '❌ Character data invalid or no weapons array found.';
            const replyMethod = isFollowUp ? interaction.followUp.bind(interaction) : interaction.editReply.bind(interaction);
            return replyMethod({ content, ephemeral: true });
        }
        const weapon = player.weapons.find(w =>
            w.isEquipped === "Y" &&
            (w.equippedSlot === "OFFENSE" || w.equippedSlot === "ADAPTIVE")
        );
        if (!weapon) {
            const content = `❌ ${originalUsername}, you have no weapon equipped in the OFFENSE or ADAPTIVE slot.`;
            const replyMethod = isFollowUp ? interaction.followUp.bind(interaction) : interaction.editReply.bind(interaction);
            return replyMethod({ content, ephemeral: true });
        }

        // --- Core Attack Logic ---
        const attackRoll = rollDice(20); // Roll d20 for attack
        const isNaturalCrit = attackRoll === 1;
        const isNaturalBotch = attackRoll === 20; // <<< Check for Nat 20

        let damage = 0;
        let description = '';
        const files = []; // For attachments like avatar
        const extraFields = []; // Array to hold dynamic fields (crit or botch info)
        let embedColor = '#808080'; // Default grey, will be overwritten

        // Fetch and prepare avatar image if available (Keep this part)
        if (player.avatar) {
            try {
                const avatarUrl = `${process.env.BACKEND_URL}/uploads/${player.avatar}`;
                const imageResponse = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
                files.push(new AttachmentBuilder(Buffer.from(imageResponse.data), { name: 'avatar.png' }));
            } catch (avatarError) {
                console.warn(`Failed to load avatar for ${player.name} (${discordId}):`, avatarError.message);
            }
        }

        // --- Determine Outcome: Botch > Crit > Hit > Miss ---

        // 1. Check for Botch (Natural 20)
        if (isNaturalBotch) {
            description = `⚠️ **Botch Attempt!** (Rolled \`${attackRoll}\`)`;
            const confirmRoll = rollDice(20); // Roll d20 to confirm botch
            // Botch confirms if the confirmation roll ALSO FAILS the check (is greater than AT)
            const botchConfirmed = confirmRoll > weapon.at;

            extraFields.push({
                name: 'Botch Confirm',
                value: `Roll: \`${confirmRoll}\` vs AT: \`${weapon.at}\``,
                inline: true
            });

            if (botchConfirmed) {
                description = `💥 **BOTCH CONFIRMED!**`;
                embedColor = '#000001'; // Black for confirmed botch
                // Define a simple consequence for now
                extraFields.push({ name: 'Consequence', value: 'Fumble! Attack fails disastrously.', inline: false });
                damage = 0; // No damage on a botch
            } else {
                description = `✅ **Botch Averted!** (Treated as Miss)`; // Failed confirmation = normal miss
                embedColor = '#ED4245'; // Red for miss
                damage = 0;
            }
        }
        // 2. Check for Hit/Crit (if not a botch attempt)
        else {
            const hit = attackRoll <= weapon.at;

            if (hit) {
                // Calculate base damage first
                try {
                    damage = rollDamage(weapon.tp);
                } catch (tpError) {
                     console.error("Error parsing TP string:", tpError);
                     // Handle invalid TP - maybe reply with error? For now, set damage 0 and note it.
                     description = `⚠️ **Hit, but error rolling damage!** (Invalid TP: ${weapon.tp})`;
                     embedColor = '#FFA500'; // Orange for warning
                     damage = 0;
                     // Skip crit check if damage couldn't be rolled
                     isNaturalCrit = false; // Ensure crit logic doesn't run
                }


                // Check for Critical Hit (Natural 1, only if AT allows success and damage was rolled)
                if (isNaturalCrit && weapon.at > 1 && description === '') { // Check description hasn't been set to an error
                    const confirmRoll = rollDice(20); // Roll d20 to confirm critical
                    const critConfirmed = confirmRoll <= weapon.at;

                    extraFields.push({
                        name: 'Critical Confirm',
                        value: `Roll: \`${confirmRoll}\` vs AT: \`${weapon.at}\``,
                        inline: true
                    });

                    if (critConfirmed) {
                        damage *= 2; // Double damage on confirmed critical
                        description = `🎯 **CRITICAL HIT!**`;
                        embedColor = '#FFD700'; // Gold for confirmed crit
                    } else {
                        description = `⚠️ **Critical Failed!** (Normal Hit)`;
                        embedColor = '#57F287'; // Green for normal hit
                    }
                } else if (description === '') { // Normal Hit (and not a failed crit)
                    description = `✅ **Hit!**`;
                    embedColor = '#57F287'; // Green for normal hit
                }
            } else { // Miss (and not a Nat 20)
                description = '❌ **Miss!**';
                embedColor = '#ED4245'; // Red for miss
                damage = 0;
            }
        }

        // --- Build Embed ---
        const embed = new EmbedBuilder()
            .setColor(embedColor) // Use the determined color
            .setTitle(`⚔️ ${player.name}'s Attack`)
            .setThumbnail(files.length > 0 ? 'attachment://avatar.png' : null)
            .setDescription(description) // Set dynamic description
            .addFields(
                { name: 'Weapon', value: `\`${weapon.name}\`\nAT: \`${weapon.at}\` | TP: \`${weapon.tp}\``, inline: true },
                { name: 'Attack Roll', value: `\`${attackRoll}\``, inline: true },
                // Add Crit/Botch confirmation fields dynamically
                ...extraFields,
                // Add damage field - show 'None' if damage is 0 (miss, botch, or failed crit w/ 0 base)
                 { name: 'Damage Dealt', value: damage > 0 ? `💥 \`${damage}\`` : 'None', inline: false }
            );


        // --- Setup Button and Action Row (Keep this part) ---
        const attackButton = new ButtonBuilder()
            .setCustomId('new-attack')
            .setLabel('Attack Again')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚔️');
        const actionRow = new ActionRowBuilder().addComponents(attackButton);

        // --- Send Reply (Keep this part) ---
        const message = isFollowUp
            ? await interaction.followUp({ embeds: [embed], components: [actionRow], files, fetchReply: true })
            : await interaction.editReply({ embeds: [embed], components: [actionRow], files });

        // --- Setup Button Disabling Logic & Collector (Keep this part) ---
        const messageId = message.id;
        const channelId = message.channelId;
        const authorizedUserId = interaction.user.id;

        const disableAttackButton = async (chId, msgId) => {
             try {
                 const channel = await interaction.client.channels.fetch(chId);
                 if (!channel || !channel.isTextBased()) return;
                 const targetMessage = await channel.messages.fetch(msgId);
                 // Check if components exist before trying to modify them
                 if (targetMessage.components.length > 0 && targetMessage.components[0].components.length > 0) {
                    const disabledButton = ButtonBuilder.from(targetMessage.components[0].components[0]).setDisabled(true);
                    const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
                    await targetMessage.edit({ components: [disabledRow] });
                 }
             } catch (error) {
                 // Simplified error handling for disabling
                 if (![10008, 10003, 50001, 50013].includes(error.code)) {
                      console.error(`Failed to disable button on msg ${msgId}:`, error);
                 }
             }
        };


        const inactivityTimeout = setTimeout(() => disableAttackButton(channelId, messageId), 30_000);

        const collector = message.createMessageComponentCollector({
            filter: i => i.customId === 'new-attack',
            time: 30_000
        });

        collector.on('collect', async buttonInteraction => {
            if (buttonInteraction.user.id !== authorizedUserId) {
                try {
                    await buttonInteraction.reply({
                        content: `👋 Sorry, only ${originalUsername} can use this button.`,
                        ephemeral: true
                    });
                } catch (replyError) { console.error("Failed to send ephemeral 'wrong user' reply:", replyError); }
                return;
            }

            collector.stop(); // Stop collector once the correct user clicks

            try {
                clearTimeout(inactivityTimeout);
                await buttonInteraction.deferUpdate(); // Acknowledge button click
                await disableAttackButton(channelId, messageId); // Disable button immediately
                await executeAttack(buttonInteraction, true); // Rerun the attack logic
            } catch (error) {
                console.error(`Error during button collect/reroll for user ${authorizedUserId}:`, error);
                await buttonInteraction.followUp({ content: '❌ Failed to process the new attack!', ephemeral: true }).catch(() => {});
            }
        });

        collector.on('end', (collected, reason) => {
            clearTimeout(inactivityTimeout); // Clear timeout regardless of reason
            // Only try to disable if the reason was 'time' and button might still be active
             if (reason === 'time') {
                 disableAttackButton(channelId, messageId);
             }
        });

    } catch (error) {
        // Catch unexpected errors in the main execution flow (Keep this part)
        console.error('Unhandled Error in Attack Command:', error);
        const content = '❌ An unexpected error occurred while processing your attack.';
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content, ephemeral: true });
            } else if (!isFollowUp) {
                await interaction.reply({ content, ephemeral: true });
            } else {
                console.error("Could not send error message for follow-up interaction.");
            }
        } catch (replyError) {
            console.error('Failed to send error reply to user:', replyError);
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Perform a combat attack with your equipped weapon.'),
    execute: executeAttack
};