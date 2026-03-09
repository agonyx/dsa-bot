const { SlashCommandBuilder, PermissionFlagsBits, Interaction } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const log = createLogger('add-mob');

const damageDiceRegex = /^\d+w\d+(\s*\+\s*\d+)?$/i;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-mob')
        .setDescription('Defines a new reusable mob template for combat.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Unique name for the mob template (e.g., Goblin Scout, Orc Warrior)')
                .setRequired(true)
                .setMaxLength(100)
        )
        .addIntegerOption(option =>
            option
                .setName('hp')
                .setDescription('Base Maximum Hit Points (LP) for this mob type')
                .setRequired(true)
                .setMinValue(1)
        )
        .addIntegerOption(option =>
            option.setName('initiative').setDescription('Base Initiative value (INI)').setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('attack')
                .setDescription('Base Attack value (AT) for primary attack')
                .setRequired(true)
                .setMinValue(0)
        )
        .addIntegerOption(option =>
            option
                .setName('parry')
                .setDescription('Base Parry value (PA) for primary defense')
                .setRequired(true)
                .setMinValue(0)
        )
        .addIntegerOption(option =>
            option.setName('armor').setDescription('Base Armor Soak value (RS)').setRequired(true).setMinValue(0)
        )
        .addStringOption(option =>
            option
                .setName('damage')
                .setDescription('Base Damage string (TP) like "1w6+2" or "2w6"')
                .setRequired(true)
                .setMaxLength(50)
        )
        .addStringOption(option =>
            option
                .setName('description')
                .setDescription('Optional flavor text or notes for this mob')
                .setRequired(false)
        ),

    async execute(interaction) {
        const name = interaction.options.getString('name');
        const hp = interaction.options.getInteger('hp');
        const initiative = interaction.options.getInteger('initiative');
        const attack = interaction.options.getInteger('attack');
        const parry = interaction.options.getInteger('parry');
        const armor = interaction.options.getInteger('armor');
        const damage = interaction.options.getString('damage');
        const description = interaction.options.getString('description');

        if (!damageDiceRegex.test(damage)) {
            return interaction.reply({
                content: `❌ Invalid damage format for "${damage}". Please use a format like "1w6" or "2w6+4".`,
                ephemeral: true,
            });
        }

        const mobData = {
            name,
            base_max_hp: hp,
            base_initiative: initiative,
            base_attack_value: attack,
            base_parry_value: parry,
            base_armor_soak: armor,
            base_damage_tp: damage,
            ...(description && { description }),
        };

        try {
            const { data, error } = await supabase.from('mobs').insert(mobData).select().single();

            if (error) {
                if (error.code === '23505') {
                    return interaction.reply({
                        content: `❌ Failed: A mob template named **${name}** already exists. Choose a unique name.`,
                        ephemeral: true,
                    });
                }
                throw error;
            }

            await interaction.reply({ content: `✅ Mob template **${name}** created successfully!`, ephemeral: true });
        } catch (error) {
            log.error({ error, name }, 'Error creating mob template');
            await interaction.reply({
                content: `❌ Error: ${error.message || 'Failed to create mob template.'}`,
                ephemeral: true,
            });
        }
    },
};
