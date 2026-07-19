const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db');
const { eq, and } = require('drizzle-orm');
const { combatantStatuses } = require('../db/schema');
const { createLogger } = require('../utils/logger');
const { STATUS_TYPES, STATUS_LABELS, getStatusEmoji } = require('../utils/conditionUtils');

const { updateCombatDisplay } = require('../handlers/combatHandler');
const log = createLogger('status');

/**
 * All status types as slash command choices.
 */
const STATUS_CHOICES = Object.entries(STATUS_TYPES).map(([, value]) => ({
    name: STATUS_LABELS[value],
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
 * Builds a summary embed showing all active statuses for a combatant.
 * @param {string} characterName
 * @param {Array<{ status_type: string, source: string|null, duration_rounds: number|null }>} statuses
 * @param {import('discord.js').User} user - The Discord user for the footer
 * @returns {EmbedBuilder}
 */
function buildStatusEmbed(characterName, statuses, user) {
    const embed = new EmbedBuilder()
        .setColor(statuses.length > 0 ? 0xe67e22 : 0x2ecc71)
        .setTitle(`${statuses.length > 0 ? '⚡' : '✅'} Status — ${characterName}`)
        .setTimestamp()
        .setFooter({
            text: `Aktualisiert von ${user.username}`,
            iconURL: user.avatarURL(),
        });

    if (statuses.length === 0) {
        embed.setDescription('Keine aktiven Statuseffekte.');
        return embed;
    }

    const lines = statuses.map(s => {
        const emoji = getStatusEmoji(s.status_type);
        const label = STATUS_LABELS[s.status_type] || s.status_type;
        const duration = s.duration_rounds != null ? ` (${s.duration_rounds} Runden)` : ' (permanent)';
        const source = s.source ? ` — *${s.source}*` : '';
        return `${emoji} **${label}**${duration}${source}`;
    });

    embed.setDescription(lines.join('\n'));

    return embed;
}

/**
 * Fetches all statuses for a combatant from the database.
 * @param {string} combatantId
 * @returns {Promise<Array>}
 */
async function fetchStatuses(combatantId) {
    return db
        .select({
            status_type: combatantStatuses.status_type,
            source: combatantStatuses.source,
            duration_rounds: combatantStatuses.duration_rounds,
        })
        .from(combatantStatuses)
        .where(eq(combatantStatuses.combatant_id, combatantId))
        .orderBy(combatantStatuses.status_type);
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleAdd(interaction) {
    const targetUser = interaction.options.getUser('target');
    const statusType = interaction.options.getString('status_type');
    const source = interaction.options.getString('source') || null;
    const durationRounds = interaction.options.getInteger('duration_rounds') || null;

    const { combatant, error: findError } = findCombatant(interaction, targetUser.id);
    if (findError) return interaction.editReply({ content: findError });

    await db
        .insert(combatantStatuses)
        .values({
            combatant_id: combatant.id,
            status_type: statusType,
            source,
            duration_rounds: durationRounds,
            updated_at: new Date(),
        })
        .onConflictDoUpdate({
            target: [combatantStatuses.combatant_id, combatantStatuses.status_type],
            set: {
                source,
                duration_rounds: durationRounds,
                updated_at: new Date(),
            },
        });

    const label = STATUS_LABELS[statusType] || statusType;
    log.info({ combatantId: combatant.id, statusType }, `Status added: ${label}`);

    const statuses = await fetchStatuses(combatant.id);

    // Sync in-memory combatant so combat display reflects the change
    combatant.statuses = statuses;
    updateCombatDisplay(interaction.client, interaction.channelId).catch(() => {});

    const characterName = combatant.name || targetUser.username;
    const embed = buildStatusEmbed(characterName, statuses, interaction.user);
    embed.setTitle(`${getStatusEmoji(statusType)} ${label} — ${characterName}`);

    return interaction.editReply({ embeds: [embed] });
}

async function handleRemove(interaction) {
    const targetUser = interaction.options.getUser('target');
    const statusType = interaction.options.getString('status_type');

    const { combatant, error: findError } = findCombatant(interaction, targetUser.id);
    if (findError) return interaction.editReply({ content: findError });

    const deleted = await db
        .delete(combatantStatuses)
        .where(
            and(
                eq(combatantStatuses.combatant_id, combatant.id),
                eq(combatantStatuses.status_type, statusType)
            )
        )
        .returning({ id: combatantStatuses.id });
    const count = deleted.length;

    const label = STATUS_LABELS[statusType] || statusType;

    if (count === 0) {
        return interaction.editReply({
            content: `ℹ️ **${combatant.name || targetUser.username}** hatte keinen Status **${label}**.`,
        });
    }

    log.info({ combatantId: combatant.id, statusType }, `Status removed: ${label}`);

    const statuses = await fetchStatuses(combatant.id);

    // Sync in-memory combatant so combat display reflects the change
    combatant.statuses = statuses;
    updateCombatDisplay(interaction.client, interaction.channelId).catch(() => {});

    const characterName = combatant.name || targetUser.username;
    const embed = buildStatusEmbed(characterName, statuses, interaction.user);

    return interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction) {
    const targetUser = interaction.options.getUser('target') || interaction.user;

    const { combatant, error: findError } = findCombatant(interaction, targetUser.id);
    if (findError) return interaction.editReply({ content: findError });

    const statuses = await fetchStatuses(combatant.id);
    const characterName = combatant.name || targetUser.username;
    const embed = buildStatusEmbed(characterName, statuses, interaction.user);

    return interaction.editReply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Command export
// ---------------------------------------------------------------------------

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Manage DSA 5e status effects on combatants')
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('Apply a status effect to a combatant')
                .addUserOption(opt => opt.setName('target').setDescription('Target combatant').setRequired(true))
                .addStringOption(opt =>
                    opt
                        .setName('status_type')
                        .setDescription('The status effect to apply')
                        .setRequired(true)
                        .addChoices(...STATUS_CHOICES)
                )
                .addStringOption(opt => opt.setName('source').setDescription('Source of the status (e.g. spell, trap)'))
                .addIntegerOption(opt =>
                    opt
                        .setName('duration_rounds')
                        .setDescription('Duration in combat rounds (leave empty for permanent)')
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('remove')
                .setDescription('Remove a status effect from a combatant')
                .addUserOption(opt => opt.setName('target').setDescription('Target combatant').setRequired(true))
                .addStringOption(opt =>
                    opt
                        .setName('status_type')
                        .setDescription('The status effect to remove')
                        .setRequired(true)
                        .addChoices(...STATUS_CHOICES)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('List all active status effects on a combatant')
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
            log.error({ error }, 'Status command error');
            return interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
            });
        }
    },
};
