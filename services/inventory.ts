/**
 * Inventory services — weapons + items for the caller's selected character.
 * ctx-authenticated; throw HttpError on business failures.
 */
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { weapons, items } from '../db/schema';
import { equipWeapon as equipWeaponOp } from '../db/operations';
import { httpError } from '../db/operations/errors';
import { getSelectedPlayer } from './characters';
import type { Ctx } from './_ctx';

const TP_RE = /^\d+[wW]\d+(\s*[+-]\s*\d+)?$/;
const WEAPON_TYPES = new Set(['MELEE', 'RANGED']);

export interface AddWeaponInput {
    name: string;
    type: string;
    tp: string;
    at: number;
    pa: number;
    is_equipped?: 'Y' | 'N';
    equipped_slot?: 'ADAPTIVE' | 'OFFENSE' | 'DEFENSE' | null;
}

export async function addWeapon(ctx: Ctx, input: AddWeaponInput) {
    const player = await getSelectedPlayer(ctx);
    if (!WEAPON_TYPES.has(input.type)) throw httpError(400, 'Invalid weapon type');
    if (!TP_RE.test(input.tp)) throw httpError(400, 'Invalid TP format (e.g. 1w6+3)');
    const is_equipped = input.is_equipped ?? 'N';
    const equipped_slot = input.equipped_slot ?? null;
    if (is_equipped === 'Y' && !equipped_slot) {
        throw httpError(400, 'A slot is required when equipping a weapon');
    }
    const [weapon] = await db
        .insert(weapons)
        .values({
            name: input.name,
            type: input.type as 'MELEE' | 'RANGED',
            tp: input.tp,
            at: input.at,
            pa: input.pa,
            is_equipped,
            equipped_slot,
            player_id: player.id,
        })
        .returning();
    return weapon;
}

export async function listWeapons(ctx: Ctx) {
    const player = await getSelectedPlayer(ctx);
    return db.select().from(weapons).where(eq(weapons.player_id, player.id));
}

export async function deleteWeapon(ctx: Ctx, weaponId: number) {
    const player = await getSelectedPlayer(ctx);
    const [deleted] = await db
        .delete(weapons)
        .where(and(eq(weapons.id, weaponId), eq(weapons.player_id, player.id)))
        .returning({ id: weapons.id });
    if (!deleted) throw httpError(404, 'Weapon not found');
    return { deleted: true };
}

export async function equipWeapon(
    ctx: Ctx,
    input: { weaponId: number; equippedSlot: 'ADAPTIVE' | 'OFFENSE' | 'DEFENSE' }
) {
    const player = await getSelectedPlayer(ctx);
    const [weapon] = await db
        .select({ id: weapons.id, player_id: weapons.player_id })
        .from(weapons)
        .where(eq(weapons.id, input.weaponId))
        .limit(1);
    if (!weapon) throw httpError(404, 'Weapon not found');
    if (weapon.player_id !== player.id) throw httpError(403, 'Not your weapon');
    return equipWeaponOp(input);
}

export interface AddItemInput {
    name: string;
    type?: string;
    effect?: string | null;
    description?: string | null;
    quantity?: number;
}

export async function addItem(ctx: Ctx, input: AddItemInput) {
    const player = await getSelectedPlayer(ctx);
    const type = input.type || 'MISC';
    const quantity = input.quantity ?? 1;

    // Stack onto an existing same-name+type item.
    const [existing] = await db
        .select()
        .from(items)
        .where(and(eq(items.player_id, player.id), eq(items.name, input.name), eq(items.type, type)))
        .limit(1);
    if (existing) {
        const newQuantity = (existing.quantity || 1) + quantity;
        const [updated] = await db
            .update(items)
            .set({ quantity: newQuantity })
            .where(eq(items.id, existing.id))
            .returning();
        return updated;
    }

    const [item] = await db
        .insert(items)
        .values({
            name: input.name,
            type,
            effect: input.effect ?? null,
            description: input.description ?? null,
            quantity,
            player_id: player.id,
        })
        .returning();
    return item;
}

export async function listItems(ctx: Ctx) {
    const player = await getSelectedPlayer(ctx);
    return db.select().from(items).where(eq(items.player_id, player.id));
}

export async function removeItem(ctx: Ctx, itemId: number) {
    const player = await getSelectedPlayer(ctx);
    const [deleted] = await db
        .delete(items)
        .where(and(eq(items.id, itemId), eq(items.player_id, player.id)))
        .returning({ id: items.id });
    if (!deleted) throw httpError(404, 'Item not found');
    return { deleted: true };
}
