/**
 * In-process port of the equip-weapon Edge Function
 * (DSABackend/supabase/functions/equip-weapon). Slot-conflict logic is preserved
 * exactly (ADAPTIVE collision, two-slot economy, ADAPTIVE-shift-to-other-slot).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../index';
import { weapons } from '../schema';
import { httpError } from './errors';

const VALID_SLOTS = ['ADAPTIVE', 'OFFENSE', 'DEFENSE'] as const;
type EquippedSlot = (typeof VALID_SLOTS)[number];

export async function equipWeapon(input: {
    weaponId: number;
    equippedSlot: EquippedSlot | string;
}): Promise<{ message: string }> {
    const { weaponId, equippedSlot } = input;
    if (!weaponId || !equippedSlot) throw httpError(400, 'weaponId and equippedSlot are required');
    if (!VALID_SLOTS.includes(equippedSlot as EquippedSlot)) {
        throw httpError(400, 'equippedSlot must be ADAPTIVE, OFFENSE, or DEFENSE');
    }
    const slot = equippedSlot as EquippedSlot;

    const [weapon] = await db.select().from(weapons).where(eq(weapons.id, weaponId));
    if (!weapon) throw httpError(404, 'Weapon not found');

    await db.transaction(async (tx) => {
        const equippedWeapons = await tx
            .select()
            .from(weapons)
            .where(and(eq(weapons.player_id, weapon.player_id), eq(weapons.is_equipped, 'Y')));

        for (const equipped of equippedWeapons) {
            if (equipped.id === weaponId) continue;

            if (slot === 'ADAPTIVE' || equipped.equipped_slot === slot) {
                await tx
                    .update(weapons)
                    .set({ is_equipped: 'N', equipped_slot: null })
                    .where(eq(weapons.id, equipped.id));
            } else if (equipped.equipped_slot === 'ADAPTIVE') {
                const newSlot: EquippedSlot = slot === 'OFFENSE' ? 'DEFENSE' : 'OFFENSE';
                await tx.update(weapons).set({ equipped_slot: newSlot }).where(eq(weapons.id, equipped.id));
            }
        }

        await tx
            .update(weapons)
            .set({ is_equipped: 'Y', equipped_slot: slot })
            .where(eq(weapons.id, weaponId));
    });

    return { message: `${weapon.name} successfully equipped as ${slot} weapon` };
}
