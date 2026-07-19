const { rollDice } = require('./combatUtils');

/**
 * Rolls regeneration for a DSA 5e Regenerationsphase.
 *
 * Rules (DSA 5e Regelwiki):
 * - LeP: ALWAYS rolls 1W6, adds to le_current, caps at le_max
 * - AsP: Only if asp_max > 0 (character is Zauberer), rolls 1W6, caps at asp_max
 * - KaP: Only if kap_max > 0 (character is Geweihter), rolls 1W6, caps at kap_max
 *
 * DESIGN NOTE: Future versions will subtract Schlechte Regeneration levels
 * and add Verbesserte Regeneration levels to each roll.
 * The modifier parameter is reserved for this:
 * rollRegeneration(stats, { lepModifier: 0, aspModifier: 0, kapModifier: 0 })
 *
 * @param {object} stats - Player stats object with le_current, le_max, asp_current, asp_max, kap_current, kap_max
 * @param {object} [modifiers={}] - Optional modifiers for each energy type
 * @param {number} [modifiers.lepModifier=0] - Modifier added to LeP roll
 * @param {number} [modifiers.aspModifier=0] - Modifier added to AsP roll
 * @param {number} [modifiers.kapModifier=0] - Modifier added to KaP roll
 * @returns {{ results: Array<{ type: string, label: string, emoji: string, roll: number, modifier: number, effective: number, oldValue: number, newValue: number, maxValue: number }> }}
 */
function rollRegeneration(stats, modifiers = {}) {
    const results = [];
    const lepMod = modifiers.lepModifier || 0;
    const aspMod = modifiers.aspModifier || 0;
    const kapMod = modifiers.kapModifier || 0;

    // LeP regeneration (always)
    const lepRoll = rollDice(6);
    const lepEffective = Math.max(0, lepRoll + lepMod);
    const lepOld = stats.le_current;
    const lepNew = Math.min(stats.le_max, lepOld + lepEffective);
    results.push({
        type: 'lep',
        label: 'Lebenspunkte',
        emoji: '❤️',
        roll: lepRoll,
        modifier: lepMod,
        effective: lepEffective,
        oldValue: lepOld,
        newValue: lepNew,
        maxValue: stats.le_max,
    });

    // AsP regeneration (only if Zauberer)
    if (stats.asp_max > 0) {
        const aspRoll = rollDice(6);
        const aspEffective = Math.max(0, aspRoll + aspMod);
        const aspOld = stats.asp_current;
        const aspNew = Math.min(stats.asp_max, aspOld + aspEffective);
        results.push({
            type: 'asp',
            label: 'Astralpunkte',
            emoji: '✨',
            roll: aspRoll,
            modifier: aspMod,
            effective: aspEffective,
            oldValue: aspOld,
            newValue: aspNew,
            maxValue: stats.asp_max,
        });
    }

    // KaP regeneration (only if Geweihter)
    if (stats.kap_max > 0) {
        const kapRoll = rollDice(6);
        const kapEffective = Math.max(0, kapRoll + kapMod);
        const kapOld = stats.kap_current;
        const kapNew = Math.min(stats.kap_max, kapOld + kapEffective);
        results.push({
            type: 'kap',
            label: 'Karmapunkte',
            emoji: '🙏',
            roll: kapRoll,
            modifier: kapMod,
            effective: kapEffective,
            oldValue: kapOld,
            newValue: kapNew,
            maxValue: stats.kap_max,
        });
    }

    return { results };
}

module.exports = { rollRegeneration };
