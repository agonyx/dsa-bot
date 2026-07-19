const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
} = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const log = createLogger('delete-mob');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-mob')
        .setDescription('Delete a mob template')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('The name of the mob template to delete')
                .setRequired(true)
                .setMaxLength(100)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();

        try {
            const { data: mobs } = await supabase
                .from('mobs')
                .select('name')
                .order('name');

            const choices = (mobs || []).map(m => ({ name: m.name, value: m.name }));
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
        const mobName = interaction.options.getString('name');

        try {
            await interaction.deferReply({ ephemeral: true });

            const { data: mob, error: fetchError } = await supabase
                .from('mobs')
                .select('*')
                .eq('name', mobName)
                .single();

            if (fetchError || !mob) {
                return interaction.editReply({
                    content: `Mob template **${mobName}** not found.`,
                });
            }

            const confirmButton = new ButtonBuilder()
                .setCustomId(`deletemob_confirm_${mob.id}`)
                .setLabel('Delete')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('deletemob_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            const message = await interaction.editReply({
                content: `Delete mob template **${mob.name}**?\n` +
                    `HP: ${mob.base_max_hp} | INI: ${mob.base_initiative} | AT: ${mob.base_attack_value} | PA: ${mob.base_parry_value} | RS: ${mob.base_armor_soak} | TP: ${mob.base_damage_tp}`,
                components: [row],
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000,
            });

            collector.on('collect', async i => {
                if (i.customId === 'deletemob_cancel') {
                    await i.update({ content: 'Deletion cancelled.', components: [] });
                    collector.stop();
                } else if (i.customId.startsWith('deletemob_confirm_')) {
                    const { error: deleteError } = await supabase
                        .from('mobs')
                        .delete()
                        .eq('id', mob.id);

                    if (deleteError) {
                        log.error({ error: deleteError }, 'Delete mob error');
                        await i.update({
                            content: `Failed to delete mob: ${deleteError.message}`,
                            components: [],
                        });
                    } else {
                        await i.update({
                            content: `Mob template **${mob.name}** has been deleted.`,
                            components: [],
                        });
                    }
                    collector.stop();
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction
                        .editReply({
                            content: 'Deletion timed out.',
                            components: [],
                        })
                        .catch(() => {});
                }
            });
        } catch (error) {
            log.error({ error }, 'Delete mob error');
            interaction.editReply({
                content: 'Failed to delete mob template.',
            });
        }
    },
};
