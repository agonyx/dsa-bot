// commands/combat/listmobs.js
const { SlashCommandBuilder, EmbedBuilder, Interaction } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL;
// ... (ensure BACKEND_URL check) ...

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listmobs')
        .setDescription('Lists available mob templates defined for combat.')
        .setDMPermission(false),

    /**
     * @param {Interaction} interaction
     */
    async execute(interaction) {
        // *** FIX: Added ephemeral: true to the deferReply ***
        await interaction.deferReply({ ephemeral: true });

        try {
            // --- 1. API Call to fetch all mobs ---
            console.log(`Attempting GET ${BACKEND_URL}/mob to list mobs.`);
            const response = await axios.get(`${BACKEND_URL}/mob`);

            // --- 2. Process Response ---
            if (response.status === 200 && Array.isArray(response.data)) {
                const mobs = response.data;

                // --- Handle Empty List ---
                if (mobs.length === 0) {
                    // Edit the ephemeral reply
                    await interaction.editReply("ℹ️ No mob templates have been defined yet. Use `/addmob` to create some.");
                    return;
                }

                // --- Create Visually Appealing Embed ---
                const listEmbed = new EmbedBuilder()
                    .setColor(0x5865F2) // Discord blurple
                    .setTitle('👾 Available Mob Templates 👾')
                    .setDescription(`Found ${mobs.length} mob template(s).`)
                    .setTimestamp();

                // --- Add Mobs as Fields (Limit for readability/embed limits) ---
                const fieldsToShow = mobs.slice(0, 15).map(mob => {
                     const hp = mob.baseMaxHP ?? 'N/A';
                     const ini = mob.baseInitiative ?? 'N/A';
                     const atk = mob.baseAttackValue ?? 'N/A';
                     const par = mob.baseParryValue ?? 'N/A';
                     const arm = mob.baseArmorSoak ?? 'N/A';
                     const dmg = mob.baseDamageTP ?? 'N/A';
                     const desc = mob.description ? `\n*${mob.description.substring(0, 100)}${mob.description.length > 100 ? '...' : ''}*` : '';

                    return { name: `🔹 ${mob.name}`, value: `**HP:** ${hp} | **INI:** ${ini} | **AT:** ${atk} | **PA:** ${par} | **RS:** ${arm} | **TP:** ${dmg}${desc}`, inline: false };
                });
                listEmbed.addFields(fieldsToShow);

                // Add footer
                if (mobs.length > 15) {
                    listEmbed.setFooter({ text: `Displaying ${fieldsToShow.length} of ${mobs.length} total mobs.` });
                } else {
                     listEmbed.setFooter({ text: `Total mobs: ${mobs.length}` });
                }

                // --- 3. Send Reply (Edit the ephemeral deferral) ---
                await interaction.editReply({ embeds: [listEmbed] });

            } else {
                console.error("Listmobs: Unexpected backend response:", response.status, response.data);
                // Edit the ephemeral reply
                await interaction.editReply({ content: `❓ Failed to list mobs. Backend responded with status ${response.status}.` });
            }

        } catch (error) {
            console.error('Error executing /listmobs:', error);
            let errorMsg = 'An error occurred while fetching the mob list.';
            if (axios.isAxiosError(error)) { /* ... detailed error handling ... */
                 if (error.response) { errorMsg = `❌ Backend Error (${error.response.status}): ${error.response.data?.message || JSON.stringify(error.response.data) || 'Failed fetch.'}`; }
                 else if (error.request) { errorMsg = '❌ Could not connect to backend.'; }
                 else { errorMsg = `❌ Axios setup error: ${error.message}`; }
            } else if (error instanceof Error) { errorMsg = `❌ Error: ${error.message}`; }

            // Ensure deferred reply is handled - edit the ephemeral reply
            await interaction.editReply({ content: errorMsg, embeds: [], components: [] }).catch(console.error);
        }
    }
};
