# Heilkunde Wunden (Healing Wounds) - Talent

Reference for implementing wound treatment mechanics in DSANewBot.

---

## Talent Details

- **probe:** KL/FF/FF (Clarity/Dexterity/Dexterity)
- **applications:** Healing, Pain Relief, Stabilization
- **encumbrance:** Yes (affected by BE)
- **tools:** Bandages, surgical equipment, herbs, needle and thread

---

## Applications (Einsätze)

### Heilung fördern (Promote Healing)

Accelerates natural recovery from wounds.

- **time:** 30 minutes
- **check:** Heilkunde Wunden
- **difficulty:** Based on wound severity (typically +0)

#### Quality Level Effects

| QS | Effect |
|----|--------|
| 1-3 | Patient recovers QS LeP at next regeneration phase |
| 4-6 | Patient recovers QS+1 LeP at next regeneration phase |

#### Critical Success

- **effect:** Add full skill points (TaW) to LeP recovered at next regeneration phase

#### Patzer (Fumble)

- **effect:** Patient takes 1W6 SP damage from poor treatment
- **complication:** Possible Wundfieber if wound was infected

---

### Schmerzen nehmen (Remove Pain)

Temporarily suppresses pain effects.

- **time:** 4 action minutes
- **check:** Heilkunde Wunden
- **difficulty:** Based on pain source severity

#### Quality Level Effects

| QS | Effect |
|----|--------|
| 1-3 | Each QS ignores 1 level of Schmerz until end of next regeneration phase |
| 4-6 | Each QS ignores 1 level of Schmerz; 2 levels ignored at QS 6 |

#### Example

- QS 2 on a character with Schmerz Stufe III: Ignores 2 levels, effectively at Schmerz Stufe I until end of next regeneration phase

#### Critical Success

- **effect:** Pain levels ignored persist for 2 regeneration phases instead of 1

#### Patzer

- **effect:** Treatment causes additional pain - patient gains +1 level Schmerz

---

### Stabilisieren (Stabilize)

Prevents death in critical condition.

- **time:** ~15 minutes
- **check:** Heilkunde Wunden
- **difficulty:** Penalty = half of negative LeP (rounded down)

#### Difficulty Calculation

```javascript
// Example: Character at -6 LeP
stabilizePenalty = Math.floor(Math.abs(negativeLeP) / 2);
// -6 LeP → penalty of -3
```

#### Success

- **effect:** Patient's LeP rises to 1
- **condition:** Patient no longer at risk of immediate death

#### Failure

- **effect:** Patient continues to deteriorate
- **retry:** May attempt again, but each failure increases next difficulty by -1

#### Special Cases

- **LeP ≤ -KO:** Instant death, stabilization impossible
- **treatment window:** Must receive stabilization within KO (Constitution) combat rounds of reaching 0 or below LeP

---

## Bleeding Treatment

Specific application for treating Blutend status.

- **time:** 1 Action
- **check:** Heilkunde Wunden
- **difficulty:** +2 bonus (easier than normal)

### Quality Level Effects

| QS | Effect |
|----|--------|
| 1 | Reduce bleeding rounds by 0 (no effect) |
| 2 | Reduce bleeding rounds by 1 |
| 3 | Reduce bleeding rounds by 1 |
| 4 | Reduce bleeding rounds by 2 |
| 5 | Reduce bleeding rounds by 2 |
| 6 | Reduce bleeding rounds by 3 |

**Formula:** `reduction = Math.floor(QS / 2)`

---

## Special Injury Treatments

### Amputation (Amputieren)

- **check:** Heilkunde Wunden
- **difficulty:** +0 to -6 (based on injury severity)
- **success:** 2W6 SP damage, limb removed (gain Verstümmelt disadvantage)
- **failure:** 6W6 SP damage, 50% chance of Wound Fever

### Bone Fractures (Knochenbrüche)

- **check:** Heilkunde Wunden
- **difficulty:** +0 to -6 (based on fracture type)
- **success:** 1W3-1 SP (Trümmerbruch: +1W6 SP)
- **failure:** 1W6+1 SP, 20% Wound Fever (open fracture)

### Burns (Verbrennungen)

- **check:** Heilkunde Wunden
- **difficulty:** -2 to -4 (based on burn severity)
- **success:** Standard healing
- **failure:** 1W6 days of 1W3 SP each day

### Surgery (Chirurgischer Eingriff)

- **check:** Heilkunde Wunden
- **difficulty:** -5 to -11 (based on procedure)
- **success:** 3W6+6 SP, 10% Wound Fever
- **failure:** 6W6+12 SP, 75% Wound Fever

---

## Tools & Equipment

### Basic Equipment

- **bandages:** Required for most treatments
- **antiseptic herbs:** Reduces infection risk
- **clean water:** For cleaning wounds

### Surgical Equipment

- **needle and thread:** Required for surgery, deep wound treatment
- **bone saw:** Required for amputation
- **surgical knife:** Required for surgery, improves quality

### Equipment Bonuses

| Equipment | Bonus |
|-----------|-------|
| High-quality bandages | +1 to healing checks |
| Healer's kit | +2 to all applications |
| Temple surgical tools | +3 to surgery checks |
| Missing required tools | -2 to -4 penalty |

---

## Related Conditions

### Wundfieber (Wound Fever)

Risk from untreated or poorly treated wounds.

- **cause:** No treatment OR treatment result of 1-2 on W20 (10% chance)
- **treatment:** Heilkunde Wunden checks to reduce fever effects
- **prevention:** Proper wound care with antiseptic

---

## Implementation Notes

### Treatment Flow

1. Identify wound type and severity
2. Determine appropriate application
3. Calculate difficulty modifier
4. Roll talent check (3d20 against KL/FF/FF)
5. Determine QS (Quality Level)
6. Apply effects based on QS

### Database Considerations

```sql
-- Treatment tracking
CREATE TABLE wound_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    combatant_id UUID REFERENCES combatants(id),
    healer_id UUID REFERENCES players(id),
    treatment_type VARCHAR(50), -- 'healing', 'pain', 'stabilize', 'bleeding', 'surgery'
    difficulty INTEGER,
    qs_achieved INTEGER,
    sp_healed INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

*Source: https://dsa.ulisses-regelwiki.de/talent.html?talent=Heilkunde+Wunden*
