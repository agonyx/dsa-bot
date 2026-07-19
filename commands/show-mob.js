const { SlashCommandBuilder, EmbedBuilder, Interaction } = require('discord.js');
const { db } = require('../db');
const { eq } = require('drizzle-orm');
const { mobs } = require('../db/schema');
const { createLogger } = require('../utils/logger');
const log = createLogger('show-mob');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('show-mob')
        .setDescription('Display the details of a specific mob template.')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('The exact name of the mob template to show.')
                .setRequired(true)
                .setMaxLength(100)
                .setAutocomplete(true)
        )
        .setDMPermission(false),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();

        try {
            const mobRows = await db.select({ name: mobs.name }).from(mobs).orderBy(mobs.name);

            const choices = (mobRows || []).map(m => ({ name: m.name, value: m.name }));
            const filtered = choices.filter(c =>
                c.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            await interaction.respond(filtered.slice(0, 25));
        } catch (error) {
            log.error({ error }, 'Autocomplete error');
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const mobName = interaction.options.getString('name');

        try {
            const [mob] = await db.select().from(mobs).where(eq(mobs.name, mobName)).limit(1);

            if (!mob) {
                return interaction.editReply({
                    content: `❌ Mob template named **${mobName}** not found. Check the spelling or use \`/list-mobs\`.`,
                });
            }

            const mobEmbed = new EmbedBuilder()
                .setColor(0x8b4513)
                .setTitle(`👾 Mob Details: ${mob.name} 👾`)
                .setTimestamp();

            if (mob.description) {
                mobEmbed.setDescription(`*${mob.description}*`);
            }

            mobEmbed.addFields(
                { name: 'Max HP (LP)', value: `\`${mob.base_max_hp ?? 'N/A'}\``, inline: true },
                { name: 'Initiative (INI)', value: `\`${mob.base_initiative ?? 'N/A'}\``, inline: true },
                { name: 'Armor (RS)', value: `\`${mob.base_armor_soak ?? 'N/A'}\``, inline: true },
                { name: 'Attack (AT)', value: `\`${mob.base_attack_value ?? 'N/A'}\``, inline: true },
                { name: 'Parry (PA)', value: `\`${mob.base_parry_value ?? 'N/A'}\``, inline: true },
                { name: 'Damage (TP)', value: `\`${mob.base_damage_tp ?? 'N/A'}\``, inline: true }
            );

            await interaction.editReply({ embeds: [mobEmbed] });
        } catch (error) {
            log.error({ error, mobName }, 'Error executing /show-mob');
            await interaction.editReply({ content: `❌ Error: ${error.message || 'Failed to fetch mob details.'}` });
        }
    },
};
