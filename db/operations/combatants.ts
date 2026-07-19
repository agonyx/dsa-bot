/**
 * In-process port of the create-combatant Edge Function
 * (DSABackend/supabase/functions/create-combatant).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../index';
import { combatSessions, combatants } from '../schema';
import { httpError } from './errors';

export interface CreateCombatantInput {
    sessionId: string;
    type: 'PLAYER' | 'NPC';
    allegiance: 'PLAYER_SIDE' | 'HOSTILE';
    playerId?: number | null;
    mobDefinitionId?: number | null;
    discordUserId?: string | null;
    name: string;
    maxHp: number;
    currentHp: number;
    initiativeBase?: number;
}

/** Add a combatant to a session (validates state + prevents duplicate Discord users). */
export async function createCombatant(input: CreateCombatantInput) {
    const {
        sessionId,
        type,
        allegiance,
        playerId,
        mobDefinitionId,
        discordUserId,
        name,
        maxHp,
        currentHp,
        initiativeBase,
    } = input;

    if (!sessionId || !type || !allegiance || !name || maxHp === undefined || currentHp === undefined) {
        throw httpError(400, 'Missing required fields: sessionId, type, allegiance, name, maxHp, currentHp');
    }

    const [session] = await db
        .select({ id: combatSessions.id, state: combatSessions.state })
        .from(combatSessions)
        .where(eq(combatSessions.id, sessionId));
    if (!session) throw httpError(404, 'Combat session not found');
    if (session.state === 'ENDED') throw httpError(400, 'Cannot add combatant to ended session');

    if (discordUserId) {
        const [existing] = await db
            .select({ id: combatants.id })
            .from(combatants)
            .where(
                and(eq(combatants.session_id, sessionId), eq(combatants.discord_user_id, discordUserId))
            );
        if (existing) throw httpError(409, 'Discord user already has a combatant in this session');
    }

    const [combatant] = await db
        .insert(combatants)
        .values({
            session_id: sessionId,
            type,
            allegiance,
            player_id: playerId ?? null,
            mob_definition_id: mobDefinitionId ?? null,
            discord_user_id: discordUserId ?? null,
            name,
            max_hp: maxHp,
            current_hp: currentHp,
            initiative_base: initiativeBase ?? 0,
        })
        .returning();

    return combatant;
}
