const { EmbedBuilder } = require('discord.js');
const { supabase } = require('./supabaseClient');
const { createLogger } = require('./logger');
const log = createLogger('resourceUtils');

/**
 * Resource type definitions for DSA 5e character resources.
 * Easily extensible — add new entries here and they'll work with all helper functions.
 *
 * Future Schicksalspunkte mechanics (Neuer Wurf, Qualität verbessern, Schicksalspunkt
 * zurückgewinnen, etc.) will hook into spendResource() by wrapping it with
 * game-specific logic in the command layer.
 */
const RESOURCE_TYPES = {
    SCHICKSALSPUNKTE: {
        key: 'schicksalspunkte',
        currentCol: 'schicksalspunkte_current',
        maxCol: 'schicksalspunkte_max',
        label: 'Schicksalspunkte',
        emoji: '🎲',
        color: 0xffd700, // gold
    },
    ASP: {
        key: 'asp',
        currentCol: 'asp_current',
        maxCol: 'asp_max',
        label: 'Astralpunkte',
        emoji: '✨',
        color: 0x9b59b6, // purple
    },
    KAP: {
        key: 'kap',
        currentCol: 'kap_current',
        maxCol: 'kap_max',
        label: 'Karmapunkte',
        emoji: '🙏',
        color: 0xf1c40f, // warm yellow
    },
};

/**
 * Fetches the selected player and their stats for a given Discord user.
 * @param {string} discordId - Discord user ID
 * @param {string} selectColumns - Additional stats columns to select (comma-separated)
 * @returns {Promise<{player: object, stats: object}|null>} Player and stats, or null if not found
 */
async function getPlayerWithStats(discordId, selectColumns = '*') {
    const { data: player, error } = await supabase
        .from('players')
        .select(
            `
            id,
            name,
            stats:stats(id, ${selectColumns})
        `
        )
        .eq('discord_id', discordId)
        .eq('selected', 'YES')
        .single();

    if (error || !player?.stats) {
        log.debug({ discordId, error }, 'No selected player found');
        return null;
    }

    const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;
    return { player, stats };
}

/**
 * Spends a resource (decrements current value).
 * @param {string} statsId - Stats row ID
 * @param {object} resourceType - Entry from RESOURCE_TYPES
 * @param {number} amount - Amount to spend
 * @param {number} currentValue - Current resource value
 * @returns {Promise<{newValue: number, error: string|null}>}
 */
async function spendResource(statsId, resourceType, amount, currentValue) {
    if (currentValue < amount) {
        return {
            newValue: currentValue,
            error: `Not enough ${resourceType.label}! (Current: ${currentValue})`,
        };
    }

    const newValue = currentValue - amount;

    const { error } = await supabase
        .from('stats')
        .update({ [resourceType.currentCol]: newValue })
        .eq('id', statsId);

    if (error) {
        log.error({ error, statsId, resourceType: resourceType.key }, 'Failed to spend resource');
        return { newValue: currentValue, error: `Database error: ${error.message}` };
    }

    return { newValue, error: null };
}

/**
 * Restores a resource (increments current value, capped at max).
 * @param {string} statsId - Stats row ID
 * @param {object} resourceType - Entry from RESOURCE_TYPES
 * @param {number} amount - Amount to restore
 * @param {number} currentValue - Current resource value
 * @param {number} maxValue - Maximum resource value
 * @returns {Promise<{newValue: number, actualAmount: number, error: string|null}>}
 */
async function restoreResource(statsId, resourceType, amount, currentValue, maxValue) {
    const newValue = Math.min(currentValue + amount, maxValue);
    const actualAmount = newValue - currentValue;

    if (actualAmount === 0) {
        return { newValue: currentValue, actualAmount: 0, error: null };
    }

    const { error } = await supabase
        .from('stats')
        .update({ [resourceType.currentCol]: newValue })
        .eq('id', statsId);

    if (error) {
        log.error({ error, statsId, resourceType: resourceType.key }, 'Failed to restore resource');
        return { newValue: currentValue, actualAmount: 0, error: `Database error: ${error.message}` };
    }

    return { newValue, actualAmount, error: null };
}

/**
 * Sets a resource to an exact value (DM override). Clamped between 0 and max.
 * @param {string} statsId - Stats row ID
 * @param {object} resourceType - Entry from RESOURCE_TYPES
 * @param {number} value - Value to set
 * @param {number} maxValue - Maximum resource value
 * @returns {Promise<{newValue: number, error: string|null}>}
 */
async function setResource(statsId, resourceType, value, maxValue) {
    const newValue = Math.max(0, Math.min(value, maxValue));

    const { error } = await supabase
        .from('stats')
        .update({ [resourceType.currentCol]: newValue })
        .eq('id', statsId);

    if (error) {
        log.error({ error, statsId, resourceType: resourceType.key }, 'Failed to set resource');
        return { newValue: value, error: `Database error: ${error.message}` };
    }

    return { newValue, error: null };
}

/**
 * Creates a visual resource bar string.
 * @param {number} current - Current value
 * @param {number} max - Maximum value
 * @param {number} [length=10] - Bar length in characters
 * @returns {string} Bar like ■■■■□□□□□□
 */
function createResourceBar(current, max, length = 10) {
    if (max <= 0) return '□'.repeat(length);
    const filled = Math.round((current / max) * length);
    return '■'.repeat(filled) + '□'.repeat(length - filled);
}

/**
 * Creates a Discord embed for a resource change.
 * @param {string} playerName - Character name
 * @param {object} resourceType - Entry from RESOURCE_TYPES
 * @param {number} oldValue - Value before change
 * @param {number} newValue - Value after change
 * @param {number} maxValue - Maximum value
 * @param {'spend'|'restore'|'set'|'show'} action - What action was taken
 * @returns {EmbedBuilder}
 */
function createResourceEmbed(playerName, resourceType, oldValue, newValue, maxValue, action) {
    const bar = createResourceBar(newValue, maxValue);
    const percentage = maxValue > 0 ? Math.round((newValue / maxValue) * 100) : 0;

    const titles = {
        spend: `${resourceType.emoji} ${resourceType.label} Spent`,
        restore: `${resourceType.emoji} ${resourceType.label} Restored`,
        set: `${resourceType.emoji} ${resourceType.label} Set`,
        show: `${resourceType.emoji} ${resourceType.label}`,
    };

    const embed = new EmbedBuilder()
        .setColor(resourceType.color)
        .setTitle(titles[action] || `${resourceType.emoji} ${resourceType.label}`);

    if (action === 'show') {
        embed.setDescription(`**${playerName}**`).addFields({
            name: resourceType.label,
            value: `${bar} **${percentage}%** (${newValue}/${maxValue})`,
        });
    } else {
        const diff = newValue - oldValue;
        const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

        embed.setDescription(`**${playerName}** — ${diffStr} ${resourceType.label}`).addFields(
            { name: 'Previous', value: `${oldValue}/${maxValue}`, inline: true },
            { name: 'Current', value: `${newValue}/${maxValue}`, inline: true },
            {
                name: resourceType.label,
                value: `${bar} **${percentage}%**`,
            }
        );
    }

    return embed;
}

module.exports = {
    RESOURCE_TYPES,
    getPlayerWithStats,
    spendResource,
    restoreResource,
    setResource,
    createResourceBar,
    createResourceEmbed,
};
