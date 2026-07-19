## Redundancies

None. Every command serves a distinct purpose. Closest overlaps:

- `/heal` vs `/use-item` (potion) — `/heal` is DM godmode, `/use-item` is in-game mechanic. Keep both.
- `/attack` (standalone) vs combat button attacks — different contexts (out-of-combat vs in-combat). Keep both.
- `/park-combat` + `/resume-combat` + `/end-combat` — three commands for session state. Could be one command with subcommands, but current approach is fine for discoverability.

## Missing Commands

### Tier 1 — CRUD Gaps (broken workflows) ✅ FIXED

| Command       | Status  | Notes                                                                              |
| ------------- | ------- | ---------------------------------------------------------------------------------- |
| `edit-weapon` | ✅ Done | Interactive editor for weapon properties (name, type, tp, at, pa, equipped, slot)  |
| `edit-item`   | ✅ Done | Interactive editor for item properties (name, type, quantity, effect, description) |
| `delete-mob`  | ✅ Done | Delete mob templates with confirmation (DM-only)                                   |

### Tier 2 — Core DSA Mechanics ✅ DONE

| Command              | Status  | Notes                                                                                     |
| -------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `/schicksalspunkte`  | ✅ Done | Subcommands: spend, restore, set, show. Tracks fate points (default 3/3).                 |
| `/asp`               | ✅ Done | Subcommands: spend, restore, show. Astralpunkte for Zauberer (max 0 = non-caster).        |
| `/kap`               | ✅ Done | Subcommands: spend, restore, show. Karmapunkte for Geweihte (max 0 = non-blessed).        |
| `/condition`         | ✅ Done | Subcommands: add, remove, list. Leveled conditions (Schmerz, Betäubung, etc.) in combat.  |
| `/status`            | ✅ Done | Subcommands: add, remove, list. Binary status effects (Blutend, Liegend, etc.) in combat. |
| `/regeneration`      | ✅ Done | Regenerationsphase — rolls 1W6 per energy type (LeP, AsP if caster, KaP if blessed).      |
| `show-stats` updated | ✅ Done | Displays SchP, AsP, KaP resource bars.                                                    |
| `edit-stats` updated | ✅ Done | All new resource fields editable.                                                         |
| Combat display       | ✅ Done | Pain levels (P1-P4), condition/status indicators in roster and spotlight.                 |

### Tier 3 — Session Quality of Life

| Feature                  | Why it matters                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Loot/Treasure tables** | DMs have no tool for rewarding players after combat. Random loot generation by difficulty/tier.                                 |
| **Combat log command**   | Handler has `handleShowFullLogInteraction()` but it's button-only — no command to review after combat ends.                     |
| **Maneuver library**     | Maneuvers exist in `action_modifications` DB table but players can't browse them. Needs `/list-maneuvers` and `/show-maneuver`. |

### Tier 4 — Nice to Have (later)

| Feature                         | Notes                                                              |
| ------------------------------- | ------------------------------------------------------------------ |
| Spell/Liturgy management        | Full spellcasting system (learn, cast, track costs) — big feature  |
| Advantage/Disadvantage tracking | Character creation completeness                                    |
| XP/AP tracking & leveling       | Character progression system                                       |
| Encumbrance                     | Weight-based inventory limits                                      |
| Character import (Optolith)     | Competitor "Das Weisse Auge" has 2-click hero import from Optolith |
| Name generator                  | Aventurian NPC names for DMs                                       |
| Notes/Journal                   | Session notes attached to combat encounters                        |
| Dice tables                     | DSA-specific critical hit and botch tables                         |

## Competitor: Das Weisse Auge

The most direct DSA 5e Discord bot competitor. Features they have that we don't:

- **Optolith import** — 2-click hero file import
- **7000+ visual playing cards** — equipment, spells, items rendered as card images
- **Botch/Crit tables** — random flavor tables for critical successes and failures
- **DM secret rolling** — roll checks without players seeing
- **Group management** — organize players into groups for secret checks
- **Full resource management** — increase/decrease LP/KP/AP with commands

The playing cards system is what our planned canvas integration could rival.

## Current Command Inventory (43 commands)

### Character Management (6)

- `/register` — Create new character
- `/choose-character` — Select active character
- `/show-stats` — View character attributes
- `/edit-stats` — Modify character attributes
- `/upload-avatar` — Set character image
- `/delete-character` — Remove character

### Combat (8)

- `/start-combat` — Begin encounter
- `/end-combat` — Terminate encounter
- `/park-combat` — Pause encounter
- `/resume-combat` — Resume paused encounter
- `/attack` — Standalone attack roll (outside formal combat)
- `/evade` — Dodge attack
- `/heal` — Restore HP
- `/use-skill` — Execute combat maneuver

### Equipment & Weapons (5)

- `/add-weapon` — Create weapon
- `/show-weapons` — List weapons
- `/equip-weapon` — Assign weapon to slot
- `/edit-weapon` — Modify weapon properties
- `/delete-weapon` — Remove weapon

### Items & Inventory (5)

- `/add-item` — Add inventory item
- `/show-items` — List inventory
- `/edit-item` — Modify item properties
- `/use-item` — Consume item
- `/remove-item` — Delete inventory item

### Skills & Talents (3)

- `/check` — Perform talent check (Talentprobe)
- `/manage-skills` — Assign combat skills
- `/show-skills` — List assigned skills

### Mob Management (5)

- `/add-mob` — Create mob template
- `/edit-mob` — Modify mob template
- `/delete-mob` — Delete mob template
- `/list-mobs` — View all templates
- `/view-mob` — View specific template

### Resources & Conditions (6) — NEW (Tier 2)

- `/schicksalspunkte` — Manage fate points (spend/restore/set/show)
- `/asp` — Manage Astralpunkte (spend/restore/show)
- `/kap` — Manage Karmapunkte (spend/restore/show)
- `/condition` — Add/remove/list conditions on combatants
- `/status` — Add/remove/list status effects on combatants
- `/regeneration` — Roll Regenerationsphase (1W6 per energy type)

### Regelwiki (1)

- `/regel` — Semantic search across 7,196 DSA 5e rules

### Utility (2)

- `/help` — Command documentation
- `/roll` — Dice roller (DSA notation)

### Dev Only (2)

- `/dev-test-character` — Create test character
- `/dev-test-mobs` — Create test mobs

## Implementation Priority

1. **Fix naming** (Tier 0) — rename `register`, `check`, `view-mob`, `manage-skills`
2. ~~**CRUD gaps** (Tier 1) — `edit-weapon`, `edit-item`, `delete-mob`~~ ✅ DONE
3. ~~**Core DSA resources** (Tier 2) — fate points, astral/karma points, conditions, rest/regen~~ ✅ DONE
4. **DM tools** (Tier 3) — loot tables, combat log command, maneuver library
5. **Canvas integration** — visual character cards, combat display, stat blocks
6. **Advanced features** (Tier 4) — spells, advantages/disadvantages, XP, encumbrance
