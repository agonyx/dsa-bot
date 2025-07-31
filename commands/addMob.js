// commands/combat/addmob.js (or commands/admin/addmob.js)

const { SlashCommandBuilder, PermissionFlagsBits, Interaction } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// Basic regex to validate DSA-style damage dice strings (e.g., 1w6, 2w6+4)
const damageDiceRegex = /^\d+w\d+(\s*\+\s*\d+)?$/i;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addmob')
        .setDescription('Defines a new reusable mob template for combat.')
        // Recommended: Restrict to users who can manage the server or have a specific 'DM' role
        // You might check roles dynamically in execute() instead if preferred
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Example: Only users who can manage guild
        .setDMPermission(false) // This command likely only makes sense in a server context

        // Add options for all the base stats stored in your Mob entity
        .addStringOption(option => option
            .setName('name')
            .setDescription('Unique name for the mob template (e.g., Goblin Scout, Orc Warrior)')
            .setRequired(true)
            .setMaxLength(100)) // Match entity constraints if possible
        .addIntegerOption(option => option
            .setName('hp')
            .setDescription('Base Maximum Hit Points (LP) for this mob type')
            .setRequired(true)
            .setMinValue(1)) // Mobs should have at least 1 HP
        .addIntegerOption(option => option
            .setName('initiative')
            .setDescription('Base Initiative value (INI)')
            .setRequired(true))
        .addIntegerOption(option => option
            .setName('attack')
            .setDescription('Base Attack value (AT) for primary attack')
            .setRequired(true)
            .setMinValue(0)) // AT could theoretically be 0
        .addIntegerOption(option => option
            .setName('parry')
            .setDescription('Base Parry value (PA) for primary defense')
            .setRequired(true)
            .setMinValue(0)) // PA could theoretically be 0
        .addIntegerOption(option => option
            .setName('armor')
            .setDescription('Base Armor Soak value (RS)')
            .setRequired(true)
            .setMinValue(0)) // Armor Soak cannot be negative
        .addStringOption(option => option
            .setName('damage')
            .setDescription('Base Damage string (TP) like "1w6+2" or "2w6"')
            .setRequired(true)
            .setMaxLength(50)) // Match entity constraints
        .addStringOption(option => option
            .setName('description')
            .setDescription('Optional flavor text or notes for this mob')
            .setRequired(false)),

    /**
     * @param {Interaction} interaction
     */
    async execute(interaction) {
        const BACKEND_URL = process.env.BACKEND_URL;
        if (!BACKEND_URL) {
            console.error("FATAL: BACKEND_URL environment variable is not set.");
            // Handle missing env var appropriately
        }
        // No need to defer usually, this should be quick unless backend is slow

        // --- Get Option Values ---
        const name = interaction.options.getString('name');
        const hp = interaction.options.getInteger('hp');
        const initiative = interaction.options.getInteger('initiative');
        const attack = interaction.options.getInteger('attack');
        const parry = interaction.options.getInteger('parry');
        const armor = interaction.options.getInteger('armor');
        const damage = interaction.options.getString('damage');
        const description = interaction.options.getString('description'); // Optional, will be null if not provided

        // --- Basic Input Validation ---
        if (!damageDiceRegex.test(damage)) {
            return interaction.reply({
                content: `❌ Invalid damage format for "${damage}". Please use a format like "1w6" or "2w6+4".`,
                ephemeral: true
            });
        }
        // Add any other validation needed (e.g., max values for stats?)

        // --- Prepare Data for API ---
        const mobData = {
            name: name,
            baseMaxHP: hp,
            baseInitiative: initiative,
            baseAttackValue: attack,
            baseParryValue: parry,
            baseArmorSoak: armor,
            baseDamageTP: damage,
            // Only include description if it was provided
            ...(description && { description: description })
        };

        // --- API Call ---
        try {
            console.log(`Attempting POST ${BACKEND_URL}/mob with data:`, mobData);
            const response = await axios.post(`${BACKEND_URL}/mob`, mobData);

            // Check for successful creation (201 Created)
            if (response.status === 201) {
                console.log(`Mob template "${name}" created successfully.`);
                await interaction.reply({ content: `✅ Mob template **${name}** created successfully!`, ephemeral: true });
            } else {
                // This case is less likely if Axios throws on non-2xx, but good fallback
                console.warn(`Addmob: Unexpected success status: ${response.status}`, response.data);
                await interaction.reply({ content: `❓ Mob template might have been created, but the backend responded with an unexpected status: ${response.status}.`, ephemeral: true });
            }

        } catch (error) {
            console.error(`Error creating mob template "${name}":`, error);
            let errorMsg = 'An error occurred while creating the mob template.';

            if (axios.isAxiosError(error) && error.response) {
                 console.error(`Backend error details: Status=${error.response.status}, Data=${JSON.stringify(error.response.data)}`);
                 if (error.response.status === 409) { // Conflict - Name likely exists
                     errorMsg = `❌ Failed: A mob template named **${name}** already exists. Choose a unique name.`;
                 } else if (error.response.status === 400) { // Bad Request - Validation likely failed backend-side
                     errorMsg = `❌ Failed: Invalid data provided. ${error.response.data?.message || '(Check backend logs for details)'}`;
                 }
                 else { // Other backend errors (500 etc)
                     errorMsg = `❌ Backend Error (${error.response.status}): ${error.response.data?.message || JSON.stringify(error.response.data) || 'Failed to create mob.'}`;
                 }
            } else if (error instanceof Error) { // Network or other errors
                errorMsg = `❌ Error: ${error.message}`;
            }
            // Reply ephemerally with the error
            await interaction.reply({ content: errorMsg, ephemeral: true });
        }
    }
};