# Command Audit & Roadmap

Generated 2026-03-16. Comprehensive audit of all 34 slash commands — naming, gaps, and priorities.

## Naming Issues

| Command                | Status | Issue                                                                                                    | Suggestion                                      |
| ---------------------- | ------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `register`             | Fix    | Vague — register for what?                                                                               | `create-character`                              |
| `check`                | Fix    | Too generic — check what?                                                                                | `talent-check` or `probe`                       |
| `attack`               | Accept | Standalone attack vs button-based combat attack — slightly confusing but both serve distinct purposes    | —                                               |
| `evade`                | OK     | Clear                                                                                                    | —                                               |
| `heal`                 | OK     | Clear                                                                                                    | —                                               |
| `roll`                 | OK     | Universal                                                                                                | —                                               |
| `help`                 | OK     | Standard                                                                                                 | —                                               |
| `regel`                | Accept | Only German command in an English bot. Fine if group is German.                                          | —                                               |
| `show-*` vs `view-mob` | Fix    | `show-stats`, `show-weapons`, `show-items`, `show-skills` use `show-` prefix but `view-mob` uses `view-` | Pick one prefix everywhere. Recommend `show-` . |
| `manage-skills`        | Fix    | Doesn't match edit pattern. Other editing uses `edit-*`                                                  | `edit-skills` or `assign-skills`                |
| `choose-character`     | Minor  | Wordy                                                                                                    | `switch-character` or `select-character`        |

**Naming convention:** `verb-noun` with kebab-case. Mostly consistent, 5-6 commands drift from the pattern.

## Redundancies

None. Every command serves a distinct purpose. Closest overlaps:

- `/heal` vs `/use-item` (potion) — `/heal` is DM godmode, `/use-item` is in-game mechanic. Keep both.
- `/attack` (standalone) vs combat button attacks — different contexts (out-of-combat vs in-combat). Keep both.
- `/park-combat` + `/resume-combat` + `/end-combat` — three commands for session state. Could be one command with subcommands, but current approach is fine for discoverability.

## Missing Commands

### Tier 1 — CRUD Gaps (broken workflows)

| Command       | Problem                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `edit-weapon` | Can add & delete weapons, but can't fix a typo without delete + re-add     |
| `edit-item`   | Same — can't change quantity or fix description                            |
| `delete-mob`  | Can create/edit/view mobs, but can't remove them. They accumulate forever. |

### Tier 2 — Core DSA Mechanics Not Covered

| Feature                            | Why it matters                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Schicksalspunkte** (Fate Points) | Core DSA resource — reroll checks, avoid death. Every character has them. Needs: track, spend, restore.                      |
| **Astral/Karma Points** (AsP/KaP)  | Spellcasters and clerics literally can't function without these. Needs: track, spend, regenerate.                            |
| **Conditions/Status Effects**      | Stunned, prone, poisoned, bleeding — combat has no way to track these. Every major TTRPG bot has this.                       |
| **Rest/Regeneration**              | No way to recover HP/AsP/KaP between encounters. Currently only manual `/heal`. Needs short rest / long rest / custom regen. |

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

## Current Command Inventory (34 commands)

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

### Equipment & Weapons (4)

- `/add-weapon` — Create weapon
- `/show-weapons` — List weapons
- `/equip-weapon` — Assign weapon to slot
- `/delete-weapon` — Remove weapon

### Items & Inventory (4)

- `/add-item` — Add inventory item
- `/show-items` — List inventory
- `/use-item` — Consume item
- `/remove-item` — Delete inventory item

### Skills & Talents (3)

- `/check` — Perform talent check (Talentprobe)
- `/manage-skills` — Assign combat skills
- `/show-skills` — List assigned skills

### Mob Management (4)

- `/add-mob` — Create mob template
- `/edit-mob` — Modify mob template
- `/list-mobs` — View all templates
- `/view-mob` — View specific template

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
2. **CRUD gaps** (Tier 1) — `edit-weapon`, `edit-item`, `delete-mob`
3. **Core DSA resources** (Tier 2) — fate points, astral/karma points, conditions, rest/regen
4. **DM tools** (Tier 3) — loot tables, combat log command, maneuver library
5. **Canvas integration** — visual character cards, combat display, stat blocks
6. **Advanced features** (Tier 4) — spells, advantages/disadvantages, XP, encumbrance
