/**
 * Rolls a single die with the specified number of sides.
 * @param {number} sides - The number of sides on the die (e.g., 6 for d6, 20 for d20).
 * @returns {number} The result of the roll (1 to sides).
 */
function rollDice(sides) {
    if (sides <= 0) return 1; // Avoid errors/infinite loops
    return Math.floor(Math.random() * sides) + 1;
}

/**
 * Parses a DSA-style damage string (e.g., "1w6+4", "2w6") and rolls the dice.
 * Also handles plain numbers as static damage.
 * @param {string} tpString - The dice string or static damage number string to parse.
 * @returns {number} The total result of the dice roll or the static damage.
 * @throws {Error} If the format is invalid (and not a plain number).
 */
function parseAndRollDamage(tpString) {
    if (tpString === null || tpString === undefined) {
         console.warn("Received null or undefined tpString in parseAndRollDamage. Returning 0.");
         return 0;
    }
    const tpStringTrimmed = String(tpString).trim(); // Convert to string and trim just in case
    if (tpStringTrimmed === '') {
         console.warn("Received empty tpString in parseAndRollDamage. Returning 0.");
         return 0;
    }

    // Regex for XdW/D Y [+ Z] format, allows optional space around +
    const tpRegex = /^(\d+)w(\d+)(\s*\+\s*(\d+))?$/i; // W or D for Wuerfel/Dice
    const match = tpStringTrimmed.match(tpRegex);

    if (!match) {
        // If not dice format, check if it's just a plain number
        const staticDamage = parseInt(tpStringTrimmed, 10);
        if (!isNaN(staticDamage)) {
             // console.log(`Interpreting "${tpStringTrimmed}" as static damage ${staticDamage}`);
             return staticDamage;
        }
        // If not dice and not a plain number, throw error
        throw new Error(`Invalid TP format: "${tpStringTrimmed}". Expected like "1w6", "2w6+4", or a plain number.`);
    }

    const numDice = parseInt(match[1], 10);
    const numSides = parseInt(match[2], 10);
    const constant = parseInt(match[4]) || 0; // Use captured group 4 for constant

    if (numSides <= 0) throw new Error('Dice must have at least 1 side.');
    if (numDice <= 0) throw new Error('Must roll at least 1 die.');

    let total = constant;
    let rolls = []; // Keep track of individual rolls for logging if needed
    for (let i = 0; i < numDice; i++) {
        const roll = rollDice(numSides);
        rolls.push(roll);
        total += roll;
    }
    // console.log(`Rolled ${tpStringTrimmed}: ${rolls.join(', ')} + ${constant} = ${total}`);
    return total;
}

/**
 * Resolves a DSA 5 attack roll, including critical/botch checks and confirmation.
 * Based on standard DSA 5 rules (1=Crit check, 20=Botch check).
 * @param {number} attackerAT - The attacker's relevant Attack Value.
 * @returns {{ roll: number, confirmRoll: number|null, outcome: 'CRITICAL_SUCCESS' | 'NORMAL_HIT' | 'NORMAL_MISS' | 'BOTCH' }} Result object.
 */
function resolveAttack(attackerAT) {
    const attackRoll = rollDice(20);
    let confirmRoll = null;
    let outcome = '';

    console.log(`[Resolve Attack] Roll: ${attackRoll} vs AT: ${attackerAT}`);

    if (attackRoll === 1) {
        // --- Potential Critical Success ---
        // Crit always requires confirmation roll in DSA 5
        confirmRoll = rollDice(20);
        console.log(`  Potential CRIT! Confirm Roll: ${confirmRoll}`);
        // Confirmed if confirmation roll is ALSO a success (<= AT)
        if (confirmRoll <= attackerAT) {
            outcome = 'CRITICAL_SUCCESS';
        } else {
            // Failed confirmation on a Nat 1 still counts as a normal hit
            // (unless AT was 0 or less, edge case unlikely needed)
            outcome = 'NORMAL_HIT';
        }
    } else if (attackRoll === 20) {
        // --- Potential Botch ---
        // Botch always requires confirmation roll in DSA 5
        confirmRoll = rollDice(20);
        console.log(`  Potential BOTCH! Confirm Roll: ${confirmRoll}`);
        // Confirmed if confirmation roll ALSO fails (is > AT)
        if (confirmRoll > attackerAT) {
            outcome = 'BOTCH';
        } else {
            // Averted botch (confirmation roll succeeded) counts as a normal miss
            outcome = 'NORMAL_MISS';
        }
    } else {
        // --- Regular Roll (2-19) ---
        if (attackRoll <= attackerAT) {
            outcome = 'NORMAL_HIT';
        } else {
            outcome = 'NORMAL_MISS';
        }
        // No confirmation roll needed for regular hits/misses
    }

    const result = {
        roll: attackRoll,
        confirmRoll: confirmRoll, // This will be null if no confirmation was needed
        outcome: outcome // 'CRITICAL_SUCCESS', 'NORMAL_HIT', 'NORMAL_MISS', 'BOTCH'
    };
    console.log(`  Attack Result:`, result);
    return result;
}
/**
 * Resolves a DSA 5 defense roll (Parry/Dodge).
 * Determines if the defense roll succeeds against the target's PA value.
 * Note: Does not currently handle critical defense successes or botches.
 * @param {number} targetPA - The defender's relevant Parry/Dodge Value.
 * @returns {{ roll: number, success: boolean }} Result object indicating the roll and if it succeeded.
 */
function resolveDefense(targetPA) {
    // Ensure PA is treated as a number, default to 0 if null/undefined/NaN
    const effectivePA = Number.isFinite(targetPA) ? targetPA : 0;
    const defenseRoll = rollDice(20); // Use the existing d20 roller
    const success = defenseRoll <= effectivePA;

    console.log(`[Resolve Defense] Roll: ${defenseRoll} vs PA: ${effectivePA} -> ${success ? 'Success' : 'Failed'}`);

    // Return simple success/failure for now
    // TODO: Potentially expand later for defense criticals (roll 1) / botches (roll 20)
    return {
        roll: defenseRoll,
        success: success
    };
}

/**
 * Applies Armor Soak (RS) to rolled damage.
 * @param {number} damageAmount - The damage rolled (after potential crits).
 * @param {number} targetRS - The target's Armor Soak value (Rüstungsschutz).
 * @returns {number} The final damage dealt after soak (minimum 0).
 */
function applySoak(damageAmount, targetRS) {
    // Ensure values are valid numbers, defaulting to 0 otherwise
    const effectiveDamage = Number.isFinite(damageAmount) ? damageAmount : 0;
    const effectiveRS = Number.isFinite(targetRS) ? targetRS : 0;

    // Damage cannot be reduced below 0 by armor
    const finalDamage = Math.max(0, effectiveDamage - effectiveRS);

    console.log(`[Apply Soak] Damage: ${effectiveDamage} - RS: ${effectiveRS} = Final: ${finalDamage}`);
    return finalDamage;
}


// --- Update module.exports at the bottom of the file ---
module.exports = {
    rollDice,
    parseAndRollDamage,
    resolveAttack,
    resolveDefense, // <-- Add new function
    applySoak       // <-- Add new function
};