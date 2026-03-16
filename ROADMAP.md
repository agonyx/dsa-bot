# DSANewBot Roadmap

Feature audit and development roadmap for becoming a complete DSA 5th Edition tabletop companion.

---

## ✅ Implemented Features

### Character Management
| Feature | Command(s) | Details |
|---------|-----------|----------|
| Character Registration | `/register` | Creates player with name |
| Character Selection | `/choose-character` | Multi-character support per Discord user |
| Character Deletion | `/delete-character` | Remove characters |
| Avatar Upload | `/upload-avatar` | Custom character portraits (Supabase storage) |

### Attributes & Stats
| Feature | Location | Details |
|---------|----------|---------|
| 8 Core Attributes | `stats` table | MU, KL, IN, CH, FF, GE, KO, KK |
| Life Points (LP) | `stats.le_max`, `stats.le_current` | Current/max tracking |
| Initiative | `stats.initiative` | Base initiative value |
| Armor Soak (RS) | `stats.ruestungsschutz` | Rüstungsschutz |
| Dodge (Ausweichen) | `stats.ausweichen` | Evasion value |
| Interactive Editor | `/edit-stats` | Modal-based stat editing with live updates |

### Talent Probes (3d20 System)
| Feature | Location | Details |
|---------|----------|---------|
| Full Probe Resolution | `/check` | 3d20 against 3 attributes |
| FtW (Fertigkeitswert) | `player_talents.ftw` | Talent skill value |
| QS Calculation | `check.js` | Quality Level 1-6 based on remaining FtW |
| Modifiers | `/check modifier:` | +/- modifiers to FtW |
| Autocomplete | `/check talent:` | Fuzzy talent search |

### Combat System
| Feature | Location | Details |
|---------|----------|---------|
| Session Setup | `/start-combat` | SETUP phase with join/add mobs |
| Initiative Rolling | `combatSetupHandler.js` | 1d6 + base initiative |
| Turn Order | `turn_order` array | Sorted by initiative, ties by base |
| Attack Resolution | `combatUtils.js` | d20 vs AT with crit/botch |
| Critical Hits | Natural 1 → confirm roll | Double damage on confirmed crit |
| Botches | Natural 20 → confirm roll | Self-damage on botch |
| Defense/Parry | `combatUtils.js` | d20 vs PA after hit |
| Damage Calculation | `parseAndRollDamage()` | Parses "1w6+4" notation |
| Armor Soak | `applySoak()` | RS subtraction, min 1 damage rule |
| Combat Maneuvers | `action_modifications` table | AT/PA/damage modifiers |
| DM NPC Control | `npcHandler.js` | DM controls hostile NPCs |
| Combat Log | `combat_sessions.combat_log` | Recent events display |
| Session Persistence | `recoverActiveCombats()` | Bot restart recovery |
| Pause/Resume | `/park-combat`, `/resume-combat` | Park active sessions |

### Weapons & Equipment
| Feature | Command(s) | Details |
|---------|-----------|----------|
| Weapon Creation | `/add-weapon` | Name, type, TP, AT, PA |
| Weapon Types | MELEE, RANGED | Type classification |
| Equipment Slots | ADAPTIVE, OFFENSE, DEFENSE | DSA 5e slot system |
| Equip Weapons | `/equip-weapon` | Interactive slot selection |
| Delete Weapons | `/delete-weapon` | Remove from inventory |
| View Weapons | `/show-weapons` | Categorized display |

### Inventory System
| Feature | Command(s) | Details |
|---------|-----------|----------|
| Item Creation | `/add-item` | Name, type, effect, description |
| Item Types | POTION, FOOD, SCROLL, WEAPON, ARMOR, VALUABLE, MISC | 7 categories |
| Item Stacking | Auto-stacks same name+type | Quantity tracking |
| Use Items | `/use-item` | Dice-based effect resolution |
| Remove Items | `/remove-item` | Delete from inventory |
| View Inventory | `/show-items` | Grouped by type |

### NPC/Mob Templates
| Feature | Command(s) | Details |
|---------|-----------|----------|
| Mob Creation | `/add-mob` | HP, INI, AT, PA, RS, TP |
| List Mobs | `/list-mobs` | DM reference |
| View Mob Details | `/view-mob` | Full stat block with autocomplete |
| Edit Mobs | `/edit-mob` | Update templates with autocomplete |
| Add to Combat | Setup phase modal | Instantiates from template |

### Skills/Combat Maneuvers
| Feature | Command(s) | Details |
|---------|-----------|----------|
| Skill Assignment | `/manage-skills` | Multi-select interface |
| View Skills | `/show-skills` | List learned maneuvers |
| Use in Combat | `/use-skill` | Applies AT/PA/damage mods |

### Utility Commands
| Feature | Command(s) | Details |
|---------|-----------|----------|
| Dice Rolling | `/roll` | DSA notation (1w20, 3w6+2) |
| Healing | `/heal` | HP restoration (self or DM heal others) |
| Evasion | `/evade` | d20 vs Ausweichen |
| Help | `/help` | Command reference |

---

## ⚠️ Partially Implemented

| Feature | Current State | Needs Expansion |
|---------|---------------|-----------------|
| **Status Effects** | `combatant.effects[]` array exists | Only "defend" bonus implemented; no poison, disease, stun, etc. |
| **Combat Maneuvers** | AT/PA/damage mods only | Missing: disarm, trip, called shot, etc. |
| **Ranged Combat** | RANGED weapon type exists | No range bands, cover, reload times |
| **Armor** | RS stat exists | No separate armor items/equipment |
| **Multiple Defense** | PA works once | No declining PA penalty after multiple defenses |
| **NPC Skills** | `handleDmNpcSkillAction` placeholder | Returns "not implemented" |

---

## ❌ Missing Features

### Priority 1: Core Mechanics

#### Wound System
- [ ] Wound tracking (separate from LP)
- [ ] Wound thresholds based on KO
- [ ] Wound penalties (-1 to attributes per wound)
- [ ] Natural healing rates
- [ ] First aid / wound treatment
- [ ] Incapacitation at wound limit

#### Status Effects
- [ ] Poison (DOT, stat penalties)
- [ ] Disease (progressive effects)
- [ ] Stun / Paralysis
- [ ] Fear / Terror (MU-based checks)
- [ ] Exhaustion / Fatigue
- [ ] Buff tracking (positive effects)
- [ ] Effect duration (rounds)
- [ ] Effect tick on turn start/end

#### Combat Options
- [ ] Called shots (target body parts)
- [ ] Disarm attempts
- [ ] Trip / Knockdown
- [ ] Grappling
- [ ] Two-weapon fighting
- [ ] Attacks of opportunity
- [ ] Charge attack (bonus damage, movement)
- [ ] Full defense stance
- [ ] Multiple defense penalty (-2 per extra parry)

### Priority 2: Character Systems

#### Magic System
- [ ] `spells` database table
- [ ] AsP (Astral Points) tracking
- [ ] Spell casting probes
- [ ] Spell effects (damage, healing, utility)
- [ ] Spell schools / traditions
- [ ] Spell learning requirements
- [ ] Ritual magic support
- [ ] Spell duration tracking

#### Karma System
- [ ] `liturgies` database table
- [ ] KaP (Karma Points) tracking
- [ ] Blessed actions
- [ ] Religious traditions / gods
- [ ] Miracle mechanics

#### Character Advancement
- [ ] AP (Abenteuerpunkte) tracking
- [ ] Level-up mechanics
- [ ] Attribute advancement
- [ ] Learning new talents (AP cost)
- [ ] Raising FtW values
- [ ] Learning spells/liturgies
- [ ] Special abilities (Sonderfertigkeiten)

### Priority 3: Equipment & Economy

#### Economy
- [ ] Currency tracking (Dukaten, Silbertaler, Heller, Kreuzer)
- [ ] Buy/sell commands
- [ ] Price lists for items
- [ ] Loot distribution
- [ ] Trade between players

#### Armor System
- [ ] `armor` database table
- [ ] Armor items with RS and BE (Behinderung)
- [ ] Armor slots
- [ ] Shield mechanics
- [ ] Encumbrance rules
- [ ] Carrying capacity

#### Complete Equipment
- [ ] Clothing / non-armor equipment
- [ ] Equipment weight
- [ ] Full slot system (head, body, hands, feet, etc.)

---

## 💡 Nice-to-Have

### Quality of Life
- [ ] Character sheet export (PDF/text)
- [ ] Dice macros (save common rolls)
- [ ] Initiative tracker (non-combat)
- [ ] Party view (DM overview of all players)
- [ ] Quick reference / rule lookups
- [ ] Inline roll results formatting

### Campaign Tools
- [ ] Session notes (DM)
- [ ] Quest log / objectives
- [ ] NPC generator (quick random NPCs)
- [ ] Random encounter tables
- [ ] Weather / time tracking
- [ ] Map linking

### Advanced Mechanics
- [ ] Familiars / companions
- [ ] Mounts / riding animals
- [ ] Strongholds / bases
- [ ] Crafting system
- [ ] Reputation / faction standing
- [ ] Culture / profession backgrounds
- [ ] Alchemy / potion brewing

### Integration
- [ ] Dice So Nice integration (animated dice)
- [ ] Character import from official tools
- [ ] API / webhooks
- [ ] Backup / restore functionality

---

## Database Tables Status

| Table | Status | Usage |
|-------|--------|-------|
| `players` | ✅ Active | Character records |
| `stats` | ✅ Active | Attribute storage |
| `weapons` | ✅ Active | Weapon inventory |
| `items` | ✅ Active | General inventory |
| `player_talents` | ✅ Active | Talent skill values |
| `talents` | ✅ Active | Talent definitions |
| `action_modifications` | ✅ Active | Combat maneuvers |
| `player_action_modifications` | ✅ Active | Player-maneuver assignments |
| `mobs` | ✅ Active | NPC templates |
| `combat_sessions` | ✅ Active | Combat state |
| `combatants` | ✅ Active | Combat participants |
| `spells` | ❌ Missing | Magic system |
| `liturgies` | ❌ Missing | Karma system |
| `armor` | ❌ Missing | Armor items |
| `currency` | ❌ Missing | Money tracking |
| `status_effects` | ❌ Missing | Effect definitions |

---

## Development Priorities

### Sprint 1: Combat Completeness
1. Status effects system
2. Multiple defense penalties
3. Combat options (disarm, trip)

### Sprint 2: Wounds & Healing
1. Wound tracking
2. Wound penalties
3. First aid mechanics

### Sprint 3: Magic
1. Spells database
2. AsP tracking
3. Basic spell casting

### Sprint 4: Economy & Equipment
1. Currency system
2. Armor items
3. Trading commands

### Sprint 5: Advancement
1. AP tracking
2. Level-up mechanics
3. Skill improvement

---

*Last updated: March 2026*
