const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { createLogger } = require('../utils/logger');
const {
    CONDITION_TYPES,
    CONDITION_LABELS,
    getConditionEmoji,
    calculateTotalPenalty,
} = require('../utils/conditionUtils');

const { updateCombatDisplay } = require('../handlers/combatHandler');
const log = createLogger('condition');

/**
 * Storable condition types — excludes SCHMERZ (derived from LP).
 * Used to build slash command choices.
 */
const STORABLE_CONDITIONS = Object.entries(CONDITION_TYPES)
    .filter(([key]) => key !== 'SCHMERZ')
    .map(([, value]) => ({
        name: CONDITION_LABELS[value],
        value,
    }));

/**
 * Finds the combatant for a given Discord user in the active combat session.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} discordUserId
 * @returns {{ combatant: object|null, error: string|null }}
 */
function findCombatant(interaction, discordUserId) {
    const sessionData = interaction.client.activeCombats.get(interaction.channelId);
    if (!sessionData || (sessionData.state !== 'RUNNING' && sessionData.state !== 'PAUSED')) {
        return { combatant: null, error: '❌ No active combat in this channel.' };
    }

    const combatant = sessionData.combatants.find(c => c.discordUserId === discordUserId);
    if (!combatant) {
        return { combatant: null, error: '❌ That user is not in this combat.' };
    }

    return { combatant, error: null };
}

/**
 * Builds a summary embed showing all active conditions for a combatant.
 * @param {string} characterName
 * @param {Array<{ condition_type: string, level: number, source: string|null }>} conditions
 * @param {import('discord.js').User} user - The Discord user for the footer
 * @returns {EmbedBuilder}
 */
function buildConditionEmbed(characterName, conditions, user) {
    const embed = new EmbedBuilder()
        .setColor(conditions.length > 0 ? 0xe74c3c : 0x2ecc71)
        .setTitle(`${conditions.length > 0 ? '⚠️' : '✅'} Zustände — ${characterName}`)
        .setTimestamp()
        .setFooter({
            text: `Aktualisiert von ${user.username}`,
            iconURL: user.avatarURL(),
        });

    if (conditions.length === 0) {
        embed.setDescription('Keine aktiven Zustände.');
        return embed;
    }

    const lines = conditions.map(c => {
        const emoji = getConditionEmoji(c.condition_type);
        const label = CONDITION_LABELS[c.condition_type] || c.condition_type;
        const levelBar = '●'.repeat(c.level) + '○'.repeat(4 - c.level);
        const source = c.source ? ` *(${c.source})*` : '';
        return `${emoji} **${label}** ${levelBar} (Stufe ${c.level})${source}`;
    });

    embed.setDescription(lines.join('\n'));

    const penalty = calculateTotalPenalty(conditions);
    embed.addFields({ name: 'Gesamtabzug', value: `**-${penalty}** (max -5)`, inline: true });

    return embed;
}

/**
 * Fetches all conditions for a combatant from the database.
 * @param {string} combatantId
 * @returns {Promise<Array>}
 */
async function fetchConditions(combatantId) {
    const { data, error } = await supabase
        .from('combatant_conditions')
        .select('condition_type, level, source, duration_type, duration_remaining')
        .eq('combatant_id', combatantId)
        .order('condition_type');

    if (error) throw error;
    return data || [];
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleAdd(interaction) {
    const targetUser = interaction.options.getUser('target');
    const conditionType = interaction.options.getString('condition_type');
    const level = interaction.options.getInteger('level');
    const source = interaction.options.getString('source') || null;
    const durationType = interaction.options.getString('duration_type') || null;
    const durationRemaining = interaction.options.getInteger('duration_remaining') || null;

    const { combatant, error: findError } = findCombatant(interaction, targetUser.id);
    if (findError) return interaction.editReply({ content: findError });

    const { error: upsertError } = await supabase.from('combatant_conditions').upsert(
        {
            combatant_id: combatant.id,
            condition_type: conditionType,
            level,
            source,
            duration_type: durationType,
            duration_remaining: durationRemaining,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'combatant_id,condition_type' }
    );

    if (upsertError) throw upsertError;

    const label = CONDITION_LABELS[conditionType] || conditionType;
    log.info({ combatantId: combatant.id, conditionType, level }, `Condition added: ${label} ${level}`);

    const conditions = await fetchConditions(combatant.id);

    // Sync in-memory combatant so combat display reflects the change
    combatant.conditions = conditions;
    updateCombatDisplay(interaction.client, interaction.channelId).catch(() => {});

    const characterName = combatant.name || targetUser.username;
    const embed = buildConditionEmbed(characterName, conditions, interaction.user);
    embed.setTitle(`${getConditionEmoji(conditionType)} ${label} Stufe ${level} — ${characterName}`);

    return interaction.editReply({ embeds: [embed] });
}

async function handleRemove(interaction) {
    const targetUser = interaction.options.getUser('target');
    const conditionType = interaction.options.getString('condition_type');

    const { combatant, error: findError } = findCombatant(interaction, targetUser.id);
    if (findError) return interaction.editReply({ content: findError });

    const { error: deleteError, count } = await supabase
        .from('combatant_conditions')
        .delete()
        .eq('combatant_id', combatant.id)
        .eq('condition_type', conditionType);

    if (deleteError) throw deleteError;

    const label = CONDITION_LABELS[conditionType] || conditionType;

    if (count === 0) {
        return interaction.editReply({
            content: `ℹ️ **${combatant.name || targetUser.username}** hatte keinen Zustand **${label}**.`,
        });
    }

    log.info({ combatantId: combatant.id, conditionType }, `Condition removed: ${label}`);

    const conditions = await fetchConditions(combatant.id);

    // Sync in-memory combatant so combat display reflects the change
    combatant.conditions = conditions;
    updateCombatDisplay(interaction.client, interaction.channelId).catch(() => {});

    const characterName = combatant.name || targetUser.username;
    const embed = buildConditionEmbed(characterName, conditions, interaction.user);

    return interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction) {
    const targetUser = interaction.options.getUser('target') || interaction.user;

    const { combatant, error: findError } = findCombatant(interaction, targetUser.id);
    if (findError) return interaction.editReply({ content: findError });

    const conditions = await fetchConditions(combatant.id);
    const characterName = combatant.name || targetUser.username;
    const embed = buildConditionEmbed(characterName, conditions, interaction.user);

    return interaction.editReply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Command export
// ---------------------------------------------------------------------------

module.exports = {
    data: new SlashCommandBuilder()
        .setName('condition')
        .setDescription('Manage DSA 5e conditions (Zustände) on combatants')
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('Add or update a condition on a combatant')
                .addUserOption(opt => opt.setName('target').setDescription('Target combatant').setRequired(true))
                .addStringOption(opt =>
                    opt
                        .setName('condition_type')
                        .setDescription('The condition to apply')
                        .setRequired(true)
                        .addChoices(...STORABLE_CONDITIONS)
                )
                .addIntegerOption(opt =>
                    opt
                        .setName('level')
                        .setDescription('Condition level (Stufe I-IV)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(4)
                )
                .addStringOption(opt =>
                    opt.setName('source').setDescription('Source of the condition (e.g. spell name, poison)')
                )
                .addStringOption(opt =>
                    opt
                        .setName('duration_type')
                        .setDescription('How the duration is tracked')
                        .addChoices(
                            { name: 'Kampfrunden', value: 'rounds' },
                            { name: 'Minuten', value: 'minutes' },
                            { name: 'Stunden', value: 'hours' },
                            { name: 'Bis Rast', value: 'rest' },
                            { name: 'Permanent', value: 'permanent' }
                        )
                )
                .addIntegerOption(opt =>
                    opt
                        .setName('duration_remaining')
                        .setDescription('Remaining duration (in units of duration_type)')
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('remove')
                .setDescription('Remove a condition from a combatant')
                .addUserOption(opt => opt.setName('target').setDescription('Target combatant').setRequired(true))
                .addStringOption(opt =>
                    opt
                        .setName('condition_type')
                        .setDescription('The condition to remove')
                        .setRequired(true)
                        .addChoices(...STORABLE_CONDITIONS)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('List all active conditions on a combatant')
                .addUserOption(opt => opt.setName('target').setDescription('Target combatant (defaults to yourself)'))
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'add':
                    return await handleAdd(interaction);
                case 'remove':
                    return await handleRemove(interaction);
                case 'list':
                    return await handleList(interaction);
                default:
                    return interaction.editReply({ content: '❌ Unknown subcommand.' });
            }
        } catch (error) {
            log.error({ error }, 'Condition command error');
            return interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
            });
        }
    },
};
