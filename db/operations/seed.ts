/**
 * In-process port of the seed-database Edge Function
 * (DSABackend/supabase/functions/seed-database). Idempotent — safe to re-run.
 * Canonical DSA 5e talent list (60) + combat maneuvers (2) copied verbatim.
 */

import { db } from '../index';
import { talents, actionModifications } from '../schema';

const TALENTS: { name: string; stat1: string; stat2: string; stat3: string }[] = [
    { name: 'Alchemie', stat1: 'MU', stat2: 'KL', stat3: 'FF' },
    { name: 'Bekehren & Überzeugen', stat1: 'MU', stat2: 'KL', stat3: 'CH' },
    { name: 'Betören', stat1: 'MU', stat2: 'CH', stat3: 'CH' },
    { name: 'Boote & Schiffe', stat1: 'FF', stat2: 'GE', stat3: 'KK' },
    { name: 'Brett & Glücksspiel', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Einschüchtern', stat1: 'MU', stat2: 'IN', stat3: 'CH' },
    { name: 'Etikette', stat1: 'MU', stat2: 'IN', stat3: 'CH' },
    { name: 'Fährtensuchen', stat1: 'MU', stat2: 'IN', stat3: 'CH' },
    { name: 'Fahrzeuge', stat1: 'CH', stat2: 'FF', stat3: 'KO' },
    { name: 'Fesseln', stat1: 'KL', stat2: 'FF', stat3: 'KK' },
    { name: 'Fischen & Angeln', stat1: 'FF', stat2: 'GE', stat3: 'KO' },
    { name: 'Fliegen', stat1: 'MU', stat2: 'IN', stat3: 'GE' },
    { name: 'Gassenwissen', stat1: 'KL', stat2: 'IN', stat3: 'CH' },
    { name: 'Gaukeleien', stat1: 'MU', stat2: 'CH', stat3: 'FF' },
    { name: 'Geographie', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Geschichtswissen', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Götter & Kulte', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Handel', stat1: 'KL', stat2: 'IN', stat3: 'CH' },
    { name: 'Heilkunde: Gift', stat1: 'MU', stat2: 'KL', stat3: 'IN' },
    { name: 'Heilkunde: Krankheiten', stat1: 'MU', stat2: 'IN', stat3: 'KO' },
    { name: 'Heilkunde: Wunden', stat1: 'KL', stat2: 'FF', stat3: 'FF' },
    { name: 'Heilkunde: Seele', stat1: 'IN', stat2: 'CH', stat3: 'KO' },
    { name: 'Holzbearbeitung', stat1: 'FF', stat2: 'GE', stat3: 'KK' },
    { name: 'Klettern', stat1: 'MU', stat2: 'GE', stat3: 'KK' },
    { name: 'Körperbeherrschung', stat1: 'GE', stat2: 'GE', stat3: 'KO' },
    { name: 'Kraftakt', stat1: 'KO', stat2: 'KK', stat3: 'KK' },
    { name: 'Kriegskunst', stat1: 'MU', stat2: 'KL', stat3: 'IN' },
    { name: 'Lebensmittelbearbeitung', stat1: 'IN', stat2: 'FF', stat3: 'FF' },
    { name: 'Lederbearbeitung', stat1: 'FF', stat2: 'GE', stat3: 'KO' },
    { name: 'Magiekunde', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Malen & Zeichnen', stat1: 'IN', stat2: 'FF', stat3: 'FF' },
    { name: 'Mechanik', stat1: 'KL', stat2: 'KL', stat3: 'FF' },
    { name: 'Menschenkenntnis', stat1: 'KL', stat2: 'IN', stat3: 'CH' },
    { name: 'Metallbearbeitung', stat1: 'FF', stat2: 'KO', stat3: 'KK' },
    { name: 'Musizieren', stat1: 'CH', stat2: 'FF', stat3: 'KO' },
    { name: 'Orientierung', stat1: 'KL', stat2: 'IN', stat3: 'IN' },
    { name: 'Pflanzenkunde', stat1: 'KL', stat2: 'FF', stat3: 'KO' },
    { name: 'Rechnen', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Rechtskunde', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Reiten', stat1: 'CH', stat2: 'GE', stat3: 'KK' },
    { name: 'Sagen & Legenden', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Schlösserknacken', stat1: 'IN', stat2: 'FF', stat3: 'FF' },
    { name: 'Schwimmen', stat1: 'GE', stat2: 'KO', stat3: 'KK' },
    { name: 'Selbstbeherrschung', stat1: 'MU', stat2: 'MU', stat3: 'KO' },
    { name: 'Singen', stat1: 'KL', stat2: 'CH', stat3: 'KO' },
    { name: 'Sinnesschärfe', stat1: 'KL', stat2: 'IN', stat3: 'IN' },
    { name: 'Spährenkunde', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Steinbearbeitung', stat1: 'FF', stat2: 'FF', stat3: 'KK' },
    { name: 'Sternkunde', stat1: 'KL', stat2: 'KL', stat3: 'IN' },
    { name: 'Stoffbearbeitung', stat1: 'KL', stat2: 'FF', stat3: 'FF' },
    { name: 'Tanzen', stat1: 'KL', stat2: 'CH', stat3: 'GE' },
    { name: 'Taschendiebstahl', stat1: 'MU', stat2: 'FF', stat3: 'GE' },
    { name: 'Tierkunde', stat1: 'MU', stat2: 'MU', stat3: 'CH' },
    { name: 'Überreden', stat1: 'MU', stat2: 'IN', stat3: 'CH' },
    { name: 'Verbergen', stat1: 'MU', stat2: 'IN', stat3: 'GE' },
    { name: 'Verkleiden', stat1: 'IN', stat2: 'CH', stat3: 'GE' },
    { name: 'Wildnisleben', stat1: 'MU', stat2: 'GE', stat3: 'KO' },
    { name: 'Willenskraft', stat1: 'MU', stat2: 'IN', stat3: 'CH' },
    { name: 'Zechen', stat1: 'KL', stat2: 'KO', stat3: 'KK' },
];

const ACTION_MODIFICATIONS = [
    {
        name: 'Wuchtschlag',
        description: 'Erschwert die AT, um den Schaden zu erhöhen.',
        action_type: 'MELEE' as const,
        prerequisites: { technique: 'Hiebwaffen', value: 10 },
        rules: { type: 'power_attack', at_modifier: -2, damage_bonus: 2 },
    },
    {
        name: 'Finte',
        description: 'Erschwert die AT, um die PA des Gegners zu erschweren.',
        action_type: 'MELEE' as const,
        prerequisites: { technique: 'Hiebwaffen', value: 12 },
        rules: { type: 'feint', at_modifier: -2, opponent_pa_modifier: -2 },
    },
];

export interface SeedResult {
    success: true;
    results: {
        talents: { inserted: number; skipped: number };
        action_modifications: { inserted: number; skipped: number };
    };
}

/** Seed the talent and action_modification catalogs. Idempotent via unique name constraints. */
export async function seedDatabase(): Promise<SeedResult> {
    const insertedTalents = await db
        .insert(talents)
        .values(TALENTS)
        .onConflictDoNothing({ target: talents.name })
        .returning({ id: talents.id });

    const insertedMods = await db
        .insert(actionModifications)
        .values(ACTION_MODIFICATIONS)
        .onConflictDoNothing({ target: actionModifications.name })
        .returning({ id: actionModifications.id });

    return {
        success: true,
        results: {
            talents: {
                inserted: insertedTalents.length,
                skipped: TALENTS.length - insertedTalents.length,
            },
            action_modifications: {
                inserted: insertedMods.length,
                skipped: ACTION_MODIFICATIONS.length - insertedMods.length,
            },
        },
    };
}
