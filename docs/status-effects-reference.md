# DSA 5e Status Effects Reference

Reference for implementing status effects (Status) in DSANewBot. Status effects are **distinct from conditions (Zustände)** and do not count toward the 8-level incapacitation threshold.

---

## Key Difference: Status vs Condition

### Status (Status)

- stacking: Individual effects
- incapacitation: Does not contribute
- duration: Varies widely
- source: Spells, injuries, abilities

### Condition (Zustand)

- stacking: Levels add up
- incapacitation: 8+ levels = incapacitated
- duration: Usually time-based recovery
- source: LP thresholds, poisons, etc.

---

## Complete Status List

### Baumartig

- german name: Baumartig
- category: Transformation
- description: Treant-like form

### Bewegungsunfähig

- german name: Bewegungsunfähig
- category: Incapacity
- description: Cannot move

### Bewusstlos

- german name: Bewusstlos
- category: Incapacity
- description: Unconscious

### Blind

- german name: Blind
- category: Sensory
- description: Cannot see

### Blutend

- german name: Blutend
- category: Injury
- description: Bleeding (detailed below)

### Blutrausch

- german name: Blutrausch
- category: Combat
- description: Blood rage/frenzy

### Brennend

- german name: Brennend
- category: Injury
- description: On fire

### Dunkelfresser

- german name: Dunkelfresser
- category: Supernatural
- description: Darkness eater

### Eingeengt

- german name: Eingeengt
- category: Position
- description: Constrained space

### Feuerförmig

- german name: Feuerförmig
- category: Transformation
- description: Fire-formed

### Feylamia

- german name: Feylamia
- category: Supernatural
- description: Feylamia state

### Fixiert

- german name: Fixiert
- category: Position
- description: Fixed/held in place

### Gasförmig

- german name: Gasförmig
- category: Transformation
- description: Gaseous form

### Handlungsunfähig

- german name: Handlungsunfähig
- category: Incapacity
- description: Incapacitated (detailed below)

### Hörigkeit

- german name: Hörigkeit
- category: Mental
- description: Enslaved/thrall

### Kind der Finsternis

- german name: Kind der Finsternis
- category: Supernatural
- description: Child of darkness

### Kind der Nacht

- german name: Kind der Nacht
- category: Supernatural
- description: Child of the night

### Krank

- german name: Krank
- category: Disease
- description: Sick/diseased

### Lamijah

- german name: Lamijah
- category: Supernatural
- description: Lamijah state

### Liegend

- german name: Liegend
- category: Position
- description: Prone on ground

### Lykanthrop

- german name: Lykanthrop
- category: Transformation
- description: Lycanthrope/werewolf

### Minderer Feylamia

- german name: Minderer Feylamia
- category: Supernatural
- description: Lesser Feylamia

### Minderer Vampir

- german name: Minderer Vampir
- category: Supernatural
- description: Lesser Vampire

### Pechmagnet

- german name: Pechmagnet
- category: Curse
- description: Bad luck magnet

### Raserei

- german name: Raserei
- category: Combat
- description: Frenzy

### Stumm

- german name: Stumm
- category: Sensory
- description: Cannot speak

### Taub

- german name: Taub
- category: Sensory
- description: Cannot hear

### Überrascht

- german name: Überrascht
- category: Combat
- description: Surprised

### Übler Geruch

- german name: Übler Geruch
- category: Social
- description: Bad smell

### Unsichtbar

- german name: Unsichtbar
- category: Supernatural
- description: Invisible

### Vereist

- german name: Vereist
- category: Injury
- description: Frozen

### Verflüssigt

- german name: Verflüssigt
- category: Transformation
- description: Liquefied

### Vergiftet

- german name: Vergiftet
- category: Injury
- description: Poisoned

### Versteinert

- german name: Versteinert
- category: Transformation
- description: Petrified

### Wergestalt

- german name: Wergestalt
- category: Transformation
- description: Beast form

---

## Detailed Status Mechanics

### Blutend (Bleeding)

- category: Injury Status

#### Triggers

- trigger 1: Deep wounds (critical hits)
- trigger 2: Tiefe Wunde special maneuver (-2 AT, requires 1+ SP damage)
- trigger 3: Certain weapons (e.g., Blutiger Zweihänder)

#### On Acquisition

- requirement: Selbstbeherrschung check required
- duration formula: 7 - QS combat rounds
- fumble effect: Duration doubled
- critical success effect: Bleeding stops immediately

#### Effect

- damage: 1 SP at the end of each combat round

#### Treatment

- method: Heilkunde Wunden check at +2 bonus
- time cost: 1 action
- duration reduction: Reduces remaining rounds by QS/2 (rounded down)

#### Stacking

- stacking rule: Cannot stack
- duration rule: Only longer duration applies
- new application: Requires new Selbstbeherrschung check

#### Related Modifiers

- Hart im Nehmen (Tough): +1 on Selbstbeherrschung for wound effects
- Verweichlicht (Soft): +2 penalty on Selbstbeherrschung for wound effects

---

### Handlungsunfähig (Incapacitated)

- category: Incapacity Status

#### Causes

- cause 1: 8+ total condition levels
- cause 2: Pain Stufe IV (LP ≤ 5)
- cause 3: Stufe IV of Betäubung, Verwirrung, Furcht, Paralyse, Belastung, Trance
- cause 4: Certain spells and abilities
- cause 5: Specific status effects

#### Effects

- movement speed: GS falls to 0
- actions: Cannot execute actions
- defenses: Cannot execute defenses
- position: Considered Liegend (Prone) in most situations
- dm option: DM may allow free actions to speak

#### Recovery

- spell/liturgy cause: Ends immediately when effect ends
- condition cause: When condition levels drop below 8
- pain cause: When LP rises above 5

#### Special Case - Spell/Liturgy Caused

- incapacitation end: Immediately when the spell or liturgy effect ends
- recovery time: None needed

---

### Liegend (Prone)

- category: Position Status

#### Causes

- cause 1: Leg wound effects (failed Selbstbeherrschung check)
- cause 2: Trips, falls, knockdown attacks
- cause 3: Associated with Handlungsunfähig

#### Effects

- position: Character is on the ground
- recovery action: Must spend action to stand up
- combat modifiers: May apply (melee attacks against prone targets)

#### Recovery

- method: Stand up action required
- special abilities: Some abilities may allow standing as free action

---

### Bewusstlos (Unconscious)

- category: Incapacity Status

#### Causes

- cause 1: LP reduced to 0 or below
- cause 2: Certain spells (e.g., Sleep)
- cause 3: Physical trauma
- cause 4: Poison

#### Effects

- actions: Cannot take any actions
- awareness: No awareness of surroundings
- defense: Defenseless (no active defense)
- status relation: May be considered Handlungsunfähig

#### Recovery

- natural recovery: LP regeneration (if applicable)
- healing methods: Healing magic or First Aid
- duration based: For spell effects

---

### Blind / Taub (Blind / Deaf)

- category: Sensory Status

#### Causes

- cause 1: Spells (e.g., Blinder Schild, Blenden)
- cause 2: Physical injury
- cause 3: Environmental effects
- cause 4: Poisons

#### Effects

- test modifiers: Specific test modifiers based on situation
- perception: Perception penalties
- combat modifiers: Blindness causes defense penalties, etc.

#### Recovery

- method: Based on source (spell duration, healing, etc.)

---

### Überrascht (Surprised)

- category: Combat Status

#### Causes

- cause 1: Ambush
- cause 2: Sudden appearance of threat
- cause 3: Fumble on Selbstbeherrschung check

#### Effects

- combat modifiers: Combat modifiers apply
- called shot bonus: Called shot penalties reduced by 2 against surprised targets
- first round limitation: Limited actions in first combat round

#### Recovery

- standard duration: Usually ends after first combat round
- ability modifier: Specific abilities may extend or shorten

---

### Blutrausch (Blood Rage)

- category: Combat Status

#### Causes

- cause 1: Brazirakus heilige Wut Stufe IV (condition progression)
- cause 2: Certain special abilities
- cause 3: Lycanthrope transformation

#### Effects

- combat bonuses: Berserker combat bonuses
- attack bonus: May include attack bonuses
- defense penalty: May include defense penalties
- control: Limited control over actions

#### Recovery

- trigger end: When triggering condition ends
- source specific: Specific to source

---

### Vergiftet (Poisoned)

- category: Injury Status

#### Causes

- cause 1: Poisoned weapons
- cause 2: Environmental poisons
- cause 3: Creature attacks (spiders, snakes, etc.)

#### Effects

- variation: Varies by poison type
- possible effects: SP damage, conditions, incapacitation
- severity: Duration and severity based on poison

#### Recovery

- antidotes: Available for some poisons
- natural recovery: Varies by poison
- healing magic: May help with some poisons

---

### Brennend (Burning)

- category: Injury Status

#### Causes

- cause 1: Fire damage
- cause 2: Spells (e.g., Flammenwand, Feuerball)
- cause 3: Environmental hazards

#### Effects

- damage: Damage each round while burning
- secondary effects: May cause additional effects (smoke, panic)

#### Recovery

- extinguish action: Action required to put out flames
- environmental assistance: Water, rolling on ground
- spell duration: Ends when spell effect expires

---

### Krank (Sick/Diseased)

- category: Disease Status

#### Causes

- cause 1: Disease exposure
- cause 2: Wound fever (Wundfieber)
- cause 3: Curses

#### Effects

- variation: Varies by disease
- possible effects: SP damage, condition levels, stat penalties

#### Recovery

- recovery time: Disease-specific
- healing magic: May accelerate recovery
- medical treatment: May be required

---

## Implementation Priority

### Tier 1: Core Combat Status

- priority 1: Handlungsunfähig - Central to condition system
- priority 2: Blutend - Common combat result
- priority 3: Liegend - Position tracking
- priority 4: Überrascht - Combat initiation

### Tier 2: Common Combat Effects

- priority 1: Bewusstlos - Death/dying mechanics
- priority 2: Blind/Taub - Sensory effects
- priority 3: Vergiftet - Poison system
- priority 4: Brennend - Fire damage

### Tier 3: Specialized Effects

- priority 1: Blutrausch - Berserker mechanics
- priority 2: Krank - Disease system
- priority 3: Transformation statuses (as needed)

---

## Database Schema

### status_effects Table

```sql
CREATE TABLE status_effects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    combatant_id UUID REFERENCES combatants(id) ON DELETE CASCADE,
    status_type VARCHAR(50) NOT NULL,
    level INTEGER DEFAULT 1,
    duration_rounds INTEGER, -- null = permanent until removed
    source VARCHAR(100), -- what caused this effect
    source_id UUID, -- optional reference to spell/ability
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Status Types Enum

```javascript
const STATUS_TYPES = {
    // Incapacity
    BEWEGUNGSUNFAEHIG: 'bewegungsunfaehig',
    BEWUSSTLOS: 'bewusstlos',
    HANDLUNGSUNFAEHIG: 'handlungsunfaehig',
    
    // Injury
    BLUTEND: 'blutend',
    BRENNEND: 'brennend',
    VERGIFTET: 'vergiftet',
    VEREIST: 'vereist',
    KRANK: 'krank',
    
    // Position
    LIEGEND: 'liegend',
    EINGEENGT: 'eingeengt',
    FIXIERT: 'fixiert',
    
    // Sensory
    BLIND: 'blind',
    TAUB: 'taub',
    STUMM: 'stumm',
    
    // Combat
    UEBERRASCHT: 'ueberrascht',
    BLUTRAUSCH: 'blutrausch',
    RASEREI: 'raserei',
    
    // Supernatural/Transformation
    UNSICHTBAR: 'unsichtbar',
    VERSTEINERT: 'versteinert',
    GASFOERMIG: 'gasfoermig',
    LYKANTHROP: 'lykanthrop',
    WERGESTALT: 'wergestalt',
    
    // Mental
    HOERIGKEIT: 'hoerigkeit',
};
```

---

## Utility Functions

### Apply Bleeding

```javascript
function applyBleeding(combatant, source) {
    // Check if already bleeding
    const existing = combatant.statuses.find(s => s.type === STATUS_TYPES.BLUTEND);
    
    // Selbstbeherrschung check required on acquisition
    const checkResult = rollTalentCheck(combatant, 'Selbstbeherrschung', 'Störungen ignorieren');
    
    if (checkResult.criticalSuccess) {
        return { success: false, reason: 'critical_success_stops_bleeding' };
    }
    
    const duration = checkResult.fumble 
        ? (7 - checkResult.qs) * 2 
        : (7 - checkResult.qs);
    
    if (existing) {
        // Only longer duration applies
        if (duration > existing.duration_rounds) {
            existing.duration_rounds = duration;
            return { success: true, updated: true };
        }
        return { success: true, updated: false, reason: 'shorter_duration' };
    }
    
    // Add new bleeding status
    combatant.statuses.push({
        type: STATUS_TYPES.BLUTEND,
        duration_rounds: duration,
        source: source,
    });
    
    return { success: true, added: true, duration };
}
```

### Check Incapacitation

```javascript
function checkIncapacitation(combatant) {
    // Check Pain Stufe IV
    if (combatant.current_lp <= 5) {
        return { incapacitated: true, reason: 'pain_stufe_iv' };
    }
    
    // Count condition levels
    let totalLevels = 0;
    for (const cond of combatant.conditions) {
        if (!EXCLUDED_FROM_INCAPACITATION.includes(cond.type)) {
            totalLevels += cond.level;
        }
    }
    
    if (totalLevels >= 8) {
        return { incapacitated: true, reason: 'condition_levels', total: totalLevels };
    }
    
    // Check for direct incapacitation status
    if (combatant.statuses.some(s => s.type === STATUS_TYPES.HANDLUNGSUNFAEHIG)) {
        return { incapacitated: true, reason: 'direct_status' };
    }
    
    return { incapacitated: false };
}
```

---

*Source: https://dsa.ulisses-regelwiki.de/GR_Status.html*
*Source: https://dsa.ulisses-regelwiki.de/TA_Selbstbeherrschung.html*
