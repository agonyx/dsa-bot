const { ButtonBuilder } = require("@discordjs/builders");
const { ActionRowBuilder } = require("@discordjs/builders");
const { EmbedBuilder } = require("@discordjs/builders");
const { ButtonStyle } = require("discord.js");

// --- Helper function to build the Setup Embed ---
function createSetupEmbed(sessionId, dmUsername, participants = []) {
    const playerList = participants
        .filter(p => p.type === 'PLAYER')
        .map(p => `- ${p.name || 'Unknown Player'}`)
        .join('\n');
    const npcList = participants
         .filter(p => p.type === 'NPC')
         .map(p => `- ${p.name || 'Unknown Mob'}`)
         .join('\n');

    const embed = new EmbedBuilder()
        // *** FIX: Use the numeric color value ***
        .setColor(39423) // Decimal for #0099FF
        .setTitle('⚔️ Combat Setup Initiated ⚔️')
        .setDescription(`Combat initiated by **${dmUsername}**.\n\nPlayers, click "Join Combat"!\nDM, use "Manage Participants".`)
        .setFooter({ text: `Session ID: ${sessionId.substring(0, 8)}...` });
    embed.addFields({ name: '👤 Players Joined', value: playerList || 'None yet.', inline: true });
    embed.addFields({ name: '👾 Mobs Added', value: npcList || 'None yet.', inline: true });
    return embed;
}


/**
 * Creates the Action Rows with buttons for the combat setup message.
 * @param {string} sessionId - The ID of the combat session.
 * @param {boolean} canStart - Whether the start button should be enabled.
 * @returns {ActionRowBuilder[]} An array of ActionRowBuilder instances.
 */
/**
 * Creates the Action Rows with buttons for the combat setup message.
 * Corrected to use emoji objects.
 * @param {string} sessionId - The ID of the combat session.
 * @param {boolean} canStart - Whether the start button should be enabled.
 * @returns {ActionRowBuilder[]} An array of ActionRowBuilder instances.
 */
function createSetupActionRows(sessionId, canStart) {
    const joinButton = new ButtonBuilder()
        .setCustomId(`join_combat_${sessionId}`)
        .setLabel('Join Combat')
        .setStyle(ButtonStyle.Success)
        // *** FIX: Use emoji object ***
        .setEmoji({ name: '➕' });

    const manageButton = new ButtonBuilder()
        .setCustomId(`manage_participants_${sessionId}`)
        .setLabel('Manage Participants')
        .setStyle(ButtonStyle.Primary)
        // *** FIX: Use emoji object ***
        .setEmoji({ name: '⚙️' });

    const startButton = new ButtonBuilder()
        .setCustomId(`start_fight_${sessionId}`)
        .setLabel('Start Fight')
        .setStyle(ButtonStyle.Primary)
        // *** FIX: Use emoji object ***
        .setEmoji({ name: '▶️' })
        .setDisabled(!canStart);

    const leaveButton = new ButtonBuilder()
        .setCustomId(`leave_setup_${sessionId}`)
        .setLabel('Leave Setup')
        .setStyle(ButtonStyle.Secondary)
        // *** FIX: Use emoji object ***
        .setEmoji({ name: '🚪' });

    const cancelButton = new ButtonBuilder()
        .setCustomId(`cancel_combat_${sessionId}`)
        .setLabel('Cancel Setup')
        .setStyle(ButtonStyle.Danger)
        // *** FIX: Use emoji object ***
        .setEmoji({ name: '✖️' });
    const addMobButton = new ButtonBuilder()
        .setCustomId(`add_mob_modal_${sessionId}`) // Button to trigger showing the modal
        .setLabel('Add Mob')
        .setStyle(ButtonStyle.Secondary) // Keep secondary style
        .setEmoji({ name: '👾' });
    // Arrange buttons in rows
    const row1 = new ActionRowBuilder().addComponents(joinButton, addMobButton, startButton);
    const row2 = new ActionRowBuilder().addComponents(leaveButton,manageButton, cancelButton);

    return [row1, row2];
}

// --- Export the functions ---
module.exports = {
    createSetupEmbed,
    createSetupActionRows
};