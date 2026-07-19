/**
 * Barrel for in-process operations (ports of the Supabase Edge Functions).
 * Import from here: `import { createPlayer, startCombat } from './db/operations';`
 */

export { HttpError, httpError } from './errors';
export { createPlayer, deletePlayer, setSelectedPlayer } from './players';
export type { CreatedPlayer } from './players';
export { createCombatant } from './combatants';
export type { CreateCombatantInput } from './combatants';
export { startCombat, endCombat, updateCombatTurn } from './combat';
export type { StartCombatInput } from './combat';
export { equipWeapon } from './weapons';
export { seedDatabase } from './seed';
export type { SeedResult } from './seed';
