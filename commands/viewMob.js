// commands/combat/viewmob.js
const { SlashCommandBuilder, EmbedBuilder, Interaction } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL;
if (!BACKEND_URL) { console.error("FATAL: BACKEND_URL missing!"); }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewmob')
        .setDescription('Displays the details of a specific mob template.')
        .addStringOption(option => option
            .setName('name')
            .setDescription('The exact name of the mob template to view.')
            .setRequired(true)
            .setMaxLength(100)) // Match name constraints
        .setDMPermission(false), // Likely used within a server context

    /**
     * @param {Interaction} interaction
     */
    async execute(interaction) {
        // Ephemeral reply is good for a specific lookup
        await interaction.deferReply({ ephemeral: true });

        const mobName = interaction.options.getString('name');

        try {
            // --- 1. API Call to fetch the specific mob by name ---
            // URL encode the name in case it contains special characters
            const encodedName = encodeURIComponent(mobName);
            console.log(`Attempting GET ${BACKEND_URL}/mob/name/${encodedName}`);
            const response = await axios.get(`${BACKEND_URL}/mob/name/${encodedName}`);

            // --- 2. Process Response ---
            if (response.status === 200 && response.data) {
                const mob = response.data;

                // --- Create Embed ---
                const mobEmbed = new EmbedBuilder()
                    .setColor(0x8B4513) // SaddleBrown color for mobs?
                    .setTitle(`👾 Mob Details: ${mob.name} 👾`)
                    .setTimestamp();

                // Add description if it exists
                if (mob.description) {
                    mobEmbed.setDescription(`*${mob.description}*`);
                }

                // Add stats as fields
                mobEmbed.addFields(
                    { name: 'Max HP (LP)', value: `\`${mob.baseMaxHP ?? 'N/A'}\``, inline: true },
                    { name: 'Initiative (INI)', value: `\`${mob.baseInitiative ?? 'N/A'}\``, inline: true },
                    { name: 'Armor (RS)', value: `\`${mob.baseArmorSoak ?? 'N/A'}\``, inline: true },
                    { name: 'Attack (AT)', value: `\`${mob.baseAttackValue ?? 'N/A'}\``, inline: true },
                    { name: 'Parry (PA)', value: `\`${mob.baseParryValue ?? 'N/A'}\``, inline: true },
                    { name: 'Damage (TP)', value: `\`${mob.baseDamageTP ?? 'N/A'}\``, inline: true }
                    // Add more fields here if the Mob entity expands later
                );

                // Send the embed
                await interaction.editReply({ embeds: [mobEmbed] });

            } else {
                // Should be caught by Axios error handling, but as fallback
                console.error("Viewmob: Unexpected backend response:", response.status, response.data);
                await interaction.editReply({ content: `❓ Failed to view mob. Backend responded with status ${response.status}.` });
            }

        } catch (error) {
            console.error(`Error executing /viewmob for name "${mobName}":`, error);
            let errorMsg = `An error occurred while fetching details for mob "${mobName}".`;

            if (axios.isAxiosError(error)) {
                 if (error.response) {
                    console.error(`Backend error details: Status=${error.response.status}, Data=${JSON.stringify(error.response.data)}`);
                    if (error.response.status === 404) {
                        errorMsg = `❌ Mob template named **${mobName}** not found. Check the spelling or use \`/listmobs\`.`;
                    } else {
                         errorMsg = `❌ Backend Error (${error.response.status}): ${error.response.data?.message || JSON.stringify(error.response.data) || 'Failed to fetch mob.'}`;
                    }
                 } else if (error.request) { errorMsg = '❌ Could not connect to backend.'; }
                 else { errorMsg = `❌ Axios setup error: ${error.message}`; }
            } else if (error instanceof Error) { errorMsg = `❌ Error: ${error.message}`; }

            // Ensure deferred reply is handled
            await interaction.editReply({ content: errorMsg, embeds: [], components: [] }).catch(console.error);
        }
    }
};