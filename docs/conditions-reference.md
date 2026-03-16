# DSA 5e Zustände (Conditions) Reference

Reference for implementing the status/condition system in DSANewBot.

---

## Core Rules

### Stacking Rules
Conditions stack by adding levels together. Penalties from different conditions also stack. Maximum total penalty from all conditions is 5. A character becomes Handlungsunfähig (Incapacitated) when they reach 8 or more total condition levels.

### General Recovery
Most conditions recover over time, with the rate specified per condition. When Life Points rise above a pain threshold, that pain level disappears immediately. Conditions caused by spells or liturgies end immediately when the effect ends.

---

## Selbstbeherrschung (Self-Control) Talent

Essential for resisting wound effects and remaining capable of action.

**Probe:** MU/MU/KO (Courage/Courage/Constitution)

**Applications:**
- Folter widerstehen: Resist torture
- Handlungsfähigkeit bewahren: Remain capable of action, used for wound effects and Pain Stufe IV
- Störungen ignorieren: Ignore disturbances, used for dropping items or falling prone

**Special Rules:** NOT affected by Belastung (Encumbrance)

**Quality Levels:** Effect lasts for extended period
- Critical Success: Can ignore pain up to Stufe III and distractions for the whole day
- Fumble: Receive 2 levels of Schmerz for the next hour OR become Überrascht (Surprised)

---

## Related Advantages and Disadvantages

### Hart im Nehmen (Tough)
- cost: Variable AP
- effect: +1 Erleichterung (bonus) on Selbstbeherrschung checks for wound effects

### Verweichlicht (Soft)
- cost: -8 AP per level
- effect: +2 Erschwernis (penalty) on Selbstbeherrschung checks for wound effects

### Angst vor... (Fear of...)
- cost: -8 AP per level, levels I through III
- effect: Each level causes 1 level of Furcht while exposed to the trigger
- examples: Angst vor Engeln, Angst vor Insekten, Angst vor Magie

---

## Core Conditions (Combat-Relevant)

### Schmerz (Pain)
Triggered by Life Point thresholds. This is the most common condition in combat.

**Recovery:** 1 level per 4 hours

#### Stufe I
- trigger: LP at or below 75% of maximum
- test penalty: All tests -1
- speed penalty: GS -1

#### Stufe II
- trigger: LP at or below 50% of maximum
- test penalty: All tests -2
- speed penalty: GS -2

#### Stufe III
- trigger: LP at or below 25% of maximum
- test penalty: All tests -3
- speed penalty: GS -3

#### Stufe IV
- trigger: LP at or below 5
- effect: Incapacitated (Handlungsunfähig), otherwise all tests -4
- special: Must pass Selbstbeherrschung Handlungsfähigkeit bewahren check to act

---

### Betäubung (Stun)
Caused by too much wine, exhaustion, or a proper brawl.

**Recovery:** 1 level per 3 hours of rest

#### Stufe I
- test penalty: All tests -1

#### Stufe II
- test penalty: All tests -2

#### Stufe III
- test penalty: All tests -3

#### Stufe IV
- effect: Handlungsunfähig (Incapacitated)

---

### Verwirrung (Confusion)
Caused by Ikanarias butterflies, poisons, spells, or demonic abilities.

**Recovery:** 1 level per hour

#### Stufe I
- test penalty: All tests -1

#### Stufe II
- test penalty: All tests -2

#### Stufe III
- test penalty: All tests -3
- blocked actions: Zaubern (Spellcasting), Liturgien wirken (Performing liturgies), Anwendung von Wissenstalenten (Using knowledge talents), all complex activities impossible

#### Stufe IV
- effect: Handlungsunfähig (Incapacitated)

---

### Furcht (Fear)
Caused by terrifying creatures, spells, or the disadvantage Angst vor...

**Recovery:** While trigger is present, effects persist. After trigger is gone: 1 level per 5 minutes.

#### Stufe I
- test penalty: All tests -1
- state: beunruhigt (uneasy)

#### Stufe II
- test penalty: All tests -2
- state: verängstigt (frightened)

#### Stufe III
- test penalty: All tests -3
- state: in Panik (in panic)

#### Stufe IV
- effect: Catatonic, Handlungsunfähig (Incapacitated)

---

### Paralyse
Caused by ghoul attacks or the PARALYSIS spell.

**Recovery:** 1 level per 30 minutes

#### Stufe I
- test penalty: Movement and speech tests -1
- speed: GS reduced to 75%

#### Stufe II
- test penalty: Movement and speech tests -2
- speed: GS reduced to 50%

#### Stufe III
- test penalty: Movement and speech tests -3
- speed: GS reduced to 25%

#### Stufe IV
- effect: Bewegungsunfähig (Immobile)

---

### Belastung (Encumbrance)
Caused by heavy equipment and armor.

**Recovery:** Immediately when load is dropped

**Note:** Armor weight is ignored for encumbrance calculation

#### Stufe I
- talent penalty: Load-affected talent tests -1
- attack penalty: AT -1
- defense penalty: Defense -1
- initiative penalty: INI -1
- speed penalty: GS -1

#### Stufe II
- talent penalty: Load-affected talent tests -2
- attack penalty: AT -2
- defense penalty: Defense -2
- initiative penalty: INI -2
- speed penalty: GS -2

#### Stufe III
- talent penalty: Load-affected talent tests -3
- attack penalty: AT -3
- defense penalty: Defense -3
- initiative penalty: INI -3
- speed penalty: GS -3

#### Stufe IV
- effect: Handlungsunfähig (Incapacitated) until load is dropped

---

## Extended Conditions

### Berauscht (Intoxicated)
Caused by alcohol as an alternative to Betäubung for drinking.

**Recovery:** 1 level per 2 hours if no more alcohol is consumed

#### Stufe I
- test penalty: Zechen tests -1

#### Stufe II
- test penalty: Zechen tests -2

#### Stufe III
- test penalty: Zechen tests -3

#### Stufe IV
- effect: Gain 1 Stufe Betäubung, remove 4 Stufen Berauscht

---

### Überanstrengung (Exhaustion)
Caused by more than 4 ZE of heroic deeds per day.

**Recovery:** 1 level per 6 hours of sleep

#### Stufe I
- test penalty: Knowledge talent tests -1

#### Stufe II
- test penalty: Knowledge talent tests -2
- regeneration: LeP, AsP, KaP regeneration -1 (minimum 0)

#### Stufe III
- test penalty: Knowledge talent tests -3
- regeneration: LeP, AsP, KaP regeneration -2 (minimum 0)

#### Stufe IV
- effect: Gain 1 Stufe Betäubung, remove 1 Stufe Überanstrengung. The Betäubung lasts until 12 or more hours of sleep.

---

### Entrückung (Rapture)
Caused by spending KaP quickly. Affects blessed ones (Geweihte).

**Recovery:** 1 level per hour

#### Stufe I
- god-favored tests: No change
- other tests: Talent and spell tests -1

#### Stufe II
- god-favored tests: +1 bonus
- other tests: -2 penalty

#### Stufe III
- god-favored tests: +2 bonus
- other tests: -3 penalty

#### Stufe IV
- god-favored tests: +3 bonus
- other tests: -4 penalty

---

### Trance
Light form of rapture from ceremonial items or special abilities.

**Recovery:** 1 level per 24 hours

#### Stufe I
- effect: AsP regeneration skipped next phase

#### Stufe II
- test penalty: All tests -2 except liturgies and favored talents
- regeneration: No AsP regeneration

#### Stufe III
- test penalty: All tests -3 including favored talents
- regeneration: No AsP regeneration

#### Stufe IV
- effect: Handlungsunfähig (Incapacitated)
- regeneration: No AsP regeneration

---

### Dämonische Auszehrung (Demonic Attrition)
Caused by pact gifts. Paktierer can ignore KdV levels per 24 hours.

**Recovery:** 1 level per 6 hours

#### Stufe I
- regeneration: LeP and AsP regeneration -1
- test penalty: All tests -1
- pact probe: +1 bonus

#### Stufe II
- regeneration: LeP and AsP regeneration reduced to 50%
- test penalty: All tests -2
- pact probe: +2 bonus

#### Stufe III
- regeneration: No LeP or AsP regeneration
- test penalty: All tests -3
- pact probe: +3 bonus

#### Stufe IV
- effect: Handlungsunfähig (Incapacitated)
- regeneration: No regeneration
- pact probe: +4 bonus

---

### Sikaryan-Verlust (Sikaryan Loss)
Caused by Sikaryan thieves including vampires and some fae.

**Recovery:** 1 level per 30 days, but not at Stufe IV

#### Stufe I
- regeneration: LeP regeneration -1 (minimum 0)

#### Stufe II
- regeneration: LeP regeneration -2 (minimum 0)
- test penalty: Willenskraft Sikaryan-Durst -2

#### Stufe III
- regeneration: LeP regeneration -3 (minimum 0)
- test penalty: Willenskraft Sikaryan-Durst -4

#### Stufe IV
- effect: Sikaryan exhausted, Willenskraft -6, may become vampire

---

## Setting-Specific Conditions

### Animosität (Animosity)
For Nostria/Andergast region. Hatred of the other nation.

**Recovery:** Heilkunde Seele once per week, or 4+ weeks away gives 1 level per month

#### Stufe I
- disadvantage: Feindseligkeit (Hostility)
- test penalty: Willenskraft -1 to suppress

#### Stufe II
- test penalty: Willenskraft -2 to suppress

#### Stufe III
- test penalty: Willenskraft -3 to suppress

#### Stufe IV
- advantage: Hass auf Andergaster or Nostrier (Hatred)
- special: Auto-fail suppression attempts

---

### Begehren (Desire)
Attraction toward a specific person. Does NOT count toward the 8-level incapacitation threshold.

**Recovery:** 1 level per week

**Note:** Can have multiple Begehren toward different people simultaneously

#### Stufe I
- test penalty: Willenskraft Betören widerstehen -1 vs target

#### Stufe II
- test penalty: Willenskraft Betören widerstehen -2 vs target

#### Stufe III
- test penalty: Willenskraft Betören widerstehen -3 vs target

#### Stufe IV
- test penalty: Willenskraft Betören widerstehen -4 vs target

---

### Eiskalte Einflüsterung (Icy Whisper)
Caused by Shakagra-Endurium items.

**Recovery:** 1 level per day if separated from item. Stufe IV is permanent.

#### Stufe I
- bad habit: Gefühlskalt (Cold-hearted)
- test penalty: Willenskraft -2 to drop item

#### Stufe II
- behavior: Sadistic for 2 hours per day
- test penalty: Willenskraft -4 to drop item

#### Stufe III
- status: Hörigkeit (Enslaved) to the Nameless
- test penalty: Willenskraft -6 to drop item

#### Stufe IV
- effect: Permanent. Character becomes convinced follower of the Nameless.

---

### Brazirakus heilige Wut (Braziraku's Holy Wrath)
Caused by Braziraku statuette activated with blood.

**Recovery:** 1 level per 2 days without gaining a new level

#### Stufe I
- bad habit: wütend (angry), 2 hours per day of angry behavior

#### Stufe II
- disadvantage: Schlechte Eigenschaft Jähzorn (Bad Temper)
- behavior: 4 hours per day of angry behavior

#### Stufe III
- behavior: 8 hours per day of angry behavior
- combat effect: Attacks people on failed Willenskraft check for 10 combat rounds

#### Stufe IV
- status: Blutrausch (Blood Rage)
- special: After effect ends, drops back to Stufe III

---

### Erregung (Arousal)
Adult content condition. Does NOT count toward the 8-level incapacitation threshold.

**Recovery:** During lovemaking, 1 level at end of round. Outside lovemaking, 1 level per minute.

#### Stufe I
- test penalty: KL tests -1 for skills

#### Stufe II
- test penalty: KL tests -2 for skills

#### Stufe III
- test penalty: KL tests -3 for skills

#### Stufe IV
- effect: Orgasm occurs, Erregung drops to 0

---

### Theriak-Vorrat (Theriak Supply)
POSITIVE condition from consuming Theriak. Based on LP above normal maximum.

**Recovery:** Decreases when LP drops below thresholds of 5 LP, 25%, 50%, or 75% above normal max

#### Stufe I
- regeneration: LeP regeneration +1

#### Stufe II
- regeneration: LeP regeneration +2
- resistance: Dämonische Theriak-Einflüsterung SK -1

#### Stufe III
- regeneration: LeP regeneration +3
- resistance: Dämonische Theriak-Einflüsterung SK -2

#### Stufe IV
- regeneration: LeP regeneration +4
- resistance: Dämonische Theriak-Einflüsterung SK -3

---

## Status Effects (Separate from Conditions)

Statuses are distinct from conditions (Zustände) and do not count toward the 8-level incapacitation threshold.

### Complete Status List

- Baumartig: Treant-like transformation
- Bewegungsunfähig: Immobile, cannot move at all
- Bewusstlos: Unconscious, cannot act
- Blind: Cannot see, specific test modifiers apply
- Blutend: Bleeding, loses 1 SP per combat round (detailed mechanics below)
- Blutrausch: Blood rage, berserker status with combat bonuses and penalties
- Brennend: Burning, takes fire damage
- Dunkelfresser: Darkness eater
- Eingeengt: Constrained, movement limited
- Feuerförmig: Fire-formed elemental state
- Feylamia: Feylamia transformation
- Fixiert: Fixed or held in place
- Gasförmig: Gaseous form
- Handlungsunfähig: Incapacitated, cannot execute actions or defenses (detailed mechanics below)
- Hörigkeit: Enslaved or thrall to another
- Kind der Finsternis: Child of darkness
- Kind der Nacht: Child of the night
- Krank: Sick, illness effects
- Lamijah: Lamijah transformation
- Liegend: Prone, must spend action to stand up
- Lykanthrop: Lycanthrope, werewolf
- Minderer Feylamia: Lesser Feylamia
- Minderer Vampir: Lesser Vampire
- Pechmagnet: Bad luck magnet
- Raserei: Frenzy state
- Stumm: Mute, cannot speak
- Taub: Deaf, cannot hear
- Überrascht: Surprised, caught off-guard
- Übler Geruch: Bad smell
- Unsichtbar: Invisible
- Vereist: Frozen
- Verflüssigt: Liquefied
- Vergiftet: Poisoned
- Versteinert: Petrified, turned to stone
- Wergestalt: Beast form

---

## Blutend (Bleeding) - Full Mechanics

**Triggers:**
- Deep wounds from critical hits
- Tiefe Wunde special maneuver, which costs -2 AT and requires at least 1 SP damage
- Certain weapons like Blutiger Zweihänder

**On Acquisition:**
When gaining the bleeding status, a Selbstbeherrschung check is required. The duration is 7 minus QS combat rounds. On a Patzer (Fumble), the duration is doubled. On a Critical Success, the bleeding stops immediately.

**Effect:**
The character loses 1 SP at the end of each combat round.

**Treatment:**
A Heilkunde Wunden check at +2 bonus can treat bleeding. This takes 1 action. The treatment reduces remaining rounds by QS divided by 2, rounded down.

**Stacking:**
Bleeding cannot stack. Only the longer duration applies if reapplied. A new application requires a new Selbstbeherrschung check.

---

## Handlungsunfähig (Incapacitated) - Full Mechanics

**Causes:**
- 8 or more total condition levels
- Pain Stufe IV when LP is at or below 5
- Stufe IV of Betäubung, Verwirrung, Furcht, Paralyse, Belastung, or Trance
- Certain spells and abilities

**Effects:**
- GS falls to 0
- Cannot execute actions or defenses
- Considered Liegend (Prone) in most situations
- DM may allow free actions to speak

**Recovery:**
- If caused by spell or liturgy: Ends immediately when the effect ends
- If caused by conditions: When condition levels drop below the threshold
- If caused by Pain Stufe IV: When LP rises above 5

---

## Liegend (Prone)

Caused by leg wounds, trips, or falls. The character must spend an action to stand up. Often associated with Handlungsunfähig.

---

## Blind and Taub (Blind and Deaf)

Caused by spells, injuries, or environmental effects. Specific test modifiers apply based on the situation.

---

## Blutrausch (Blood Rage)

Berserker status with specific combat bonuses and penalties. Often caused by abilities or conditions like Brazirakus heilige Wut Stufe IV.

---

## Implementation Priority

### Tier 1: Core Combat Conditions
1. Schmerz: Derived from LP, affects all tests
2. Betäubung: Most common wound result
3. Verwirrung: Common spell and poison effect
4. Furcht: Fear mechanics
5. Paralyse: Ghoul and spell effect

### Tier 2: Combat Modifiers
1. Belastung: Encumbrance tracking
2. Überanstrengung: Extended activity tracking
3. Berauscht: Alcohol mechanics

### Tier 3: Extended Mechanics
1. Entrückung and Trance: For magic and karma system
2. Dämonische Auszehrung: For pact system
3. Setting-specific conditions: Optional

---

## Database Schema

### combatant_conditions Table

```sql
CREATE TABLE combatant_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    combatant_id UUID REFERENCES combatants(id) ON DELETE CASCADE,
    condition_type VARCHAR(50) NOT NULL,
    level INTEGER DEFAULT 1 CHECK (level >= 1 AND level <= 4),
    source VARCHAR(100),
    duration_type VARCHAR(20), -- 'rounds', 'minutes', 'hours', 'days', 'permanent'
    duration_remaining INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Condition Types Enum

```javascript
const CONDITION_TYPES = {
    // Core (Tier 1)
    SCHMERZ: 'schmerz',         // Derived, not stored
    BETAEUBUNG: 'betaeubung',
    VERWIRRUNG: 'verwirrung',
    FURCHT: 'furcht',
    PARALYSE: 'paralyse',

    // Combat Modifiers (Tier 2)
    BELASTUNG: 'belastung',     // Derived from equipment
    UEBERANSTRENGUNG: 'ueberanstrengung',
    BERAUSCHT: 'berauscht',

    // Extended (Tier 3)
    ENTRUECKUNG: 'entrueckung',
    TRANCE: 'trance',
    DAEMONISCHE_AUSZEHRUNG: 'daemonische_auszehrung',

    // Setting-Specific
    ANIMOSITAET: 'animositaet',
    BEGEHREN: 'begehren',
    EISKALTE_EINFLUESTERUNG: 'eiskalte_einfluesterung',
    BRAZIRAKUS_WUT: 'brazirakus_wut',
    EREGUNG: 'erregung',
    SIKARYAN_VERLUST: 'sikaryan_verlust',

    // Positive
    THERIAK_VORRAT: 'theriak_vorrat',
};
```

---

## Utility Functions

### Calculate Total Penalty

```javascript
function calculateTotalPenalty(conditions) {
    // Sum all condition levels that add penalties
    let totalPenalty = 0;

    for (const cond of conditions) {
        if (PENALTY_CONDITIONS.includes(cond.type)) {
            totalPenalty += cond.level;
        }
    }

    // Cap at 5
    return Math.min(totalPenalty, 5);
}
```

### Check Incapacitation

```javascript
function isIncapacitated(conditions, currentLP) {
    // Check pain level IV
    if (currentLP <= 5) return true;

    // Count total levels
    let totalLevels = 0;
    for (const cond of conditions) {
        if (!EXCLUDED_FROM_INCAPACITATION.includes(cond.type)) {
            totalLevels += cond.level;
        }
    }

    return totalLevels >= 8;
}
```

### Calculate Pain Level

```javascript
function calculatePainLevel(currentLP, maxLP) {
    const percentage = currentLP / maxLP;

    if (currentLP <= 5) return 4;
    if (percentage <= 0.25) return 3;
    if (percentage <= 0.50) return 2;
    if (percentage <= 0.75) return 1;
    return 0;
}
```

---

*Source: https://dsa.ulisses-regelwiki.de/GR_Zustand.html*
*Source: https://dsa.ulisses-regelwiki.de/Sta_Schmerz.html*
*Source: https://dsa.ulisses-regelwiki.de/GR_Status.html*
*Source: https://dsa.ulisses-regelwiki.de/TA_Selbstbeherrschung.html*
