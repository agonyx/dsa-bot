/**
 * In-process ports of the combat Edge Functions
 * (DSABackend/supabase/functions/start-combat, end-combat, update-combat-turn).
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../index';
import { combatSessions, combatants } from '../schema';
import { httpError } from './errors';

async function fetchSessionWithCombatants(sessionId: string) {
    const [session] = await db.select().from(combatSessions).where(eq(combatSessions.id, sessionId));
    const sessionCombatants = await db
        .select()
        .from(combatants)
        .where(eq(combatants.session_id, sessionId));
    return { ...session, combatants: sessionCombatants };
}

export interface StartCombatInput {
    sessionId: string;
    turnOrder: string[];
    combatantInitiatives: { combatantId: string; initiativeRoll: number }[];
}

/** Transition a SETUP session to RUNNING: persist turn order, write initiative rolls, mark first active. */
export async function startCombat(input: StartCombatInput) {
    const { sessionId, turnOrder, combatantInitiatives } = input;
    if (!sessionId || !Array.isArray(turnOrder) || !Array.isArray(combatantInitiatives)) {
        throw httpError(
            400,
            'sessionId, turnOrder array, and combatantInitiatives array are required'
        );
    }
    if (turnOrder.length < 2) {
        throw httpError(400, 'Cannot start combat with fewer than two participants');
    }

    const [session] = await db.select().from(combatSessions).where(eq(combatSessions.id, sessionId));
    if (!session) throw httpError(404, 'Combat session not found');
    if (session.state !== 'SETUP') throw httpError(400, 'Combat can only be started from SETUP state');

    await db.transaction(async (tx) => {
        const combatLog = [...(session.combat_log ?? []), '--- Combat Started! ---'];
        await tx
            .update(combatSessions)
            .set({ state: 'RUNNING', turn_order: turnOrder, current_turn_index: 0, combat_log: combatLog })
            .where(eq(combatSessions.id, sessionId));

        for (const init of combatantInitiatives) {
            if (init.combatantId && typeof init.initiativeRoll === 'number') {
                await tx
                    .update(combatants)
                    .set({ initiative_roll: init.initiativeRoll })
                    .where(
                        and(eq(combatants.id, init.combatantId), eq(combatants.session_id, sessionId))
                    );
            }
        }

        await tx
            .update(combatants)
            .set({ is_active_turn: true })
            .where(and(eq(combatants.id, turnOrder[0]), eq(combatants.session_id, sessionId)));
    });

    return fetchSessionWithCombatants(sessionId);
}

/** End a combat session: clear active-turn flags and transition to ENDED. */
export async function endCombat(input: { sessionId: string; reason?: string }) {
    const { sessionId, reason } = input;
    if (!sessionId) throw httpError(400, 'sessionId is required');

    const [session] = await db.select().from(combatSessions).where(eq(combatSessions.id, sessionId));
    if (!session) throw httpError(404, 'Combat session not found');
    if (session.state === 'ENDED') throw httpError(400, 'Combat session has already ended');

    const active = await db
        .select({ id: combatants.id })
        .from(combatants)
        .where(and(eq(combatants.session_id, sessionId), eq(combatants.is_active_turn, true)));

    await db.transaction(async (tx) => {
        if (active.length > 0) {
            await tx
                .update(combatants)
                .set({ is_active_turn: false })
                .where(inArray(combatants.id, active.map((a) => a.id)));
        }
        const combatLog = [
            ...(session.combat_log ?? []),
            reason ? `--- Combat Ended: ${reason} ---` : '--- Combat Ended ---',
        ];
        await tx
            .update(combatSessions)
            .set({ state: 'ENDED', combat_log: combatLog })
            .where(eq(combatSessions.id, sessionId));
    });

    return fetchSessionWithCombatants(sessionId);
}

/** Manage combat turn state: 'next' advances, 'start' begins, 'end' concludes. */
export async function updateCombatTurn(input: { sessionId: string; action: 'next' | 'start' | 'end' }) {
    const { sessionId, action } = input;
    if (!sessionId || !action) throw httpError(400, 'sessionId and action are required');

    const [session] = await db.select().from(combatSessions).where(eq(combatSessions.id, sessionId));
    if (!session) throw httpError(404, 'Combat session not found');

    const turnOrder = session.turn_order ?? [];
    let currentTurnIndex = session.current_turn_index ?? 0;

    switch (action) {
        case 'next': {
            if (turnOrder.length > 0) {
                await db
                    .update(combatants)
                    .set({ is_active_turn: false })
                    .where(eq(combatants.id, turnOrder[currentTurnIndex]));
                currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
                await db
                    .update(combatants)
                    .set({ is_active_turn: true })
                    .where(eq(combatants.id, turnOrder[currentTurnIndex]));
            }
            await db
                .update(combatSessions)
                .set({ current_turn_index: currentTurnIndex, updated_at: new Date() })
                .where(eq(combatSessions.id, sessionId));
            break;
        }
        case 'start': {
            if (session.state !== 'SETUP') throw httpError(400, 'Session must be in SETUP state to start');
            if (turnOrder.length === 0) throw httpError(400, 'No combatants in turn order');
            await db.update(combatants).set({ is_active_turn: true }).where(eq(combatants.id, turnOrder[0]));
            await db
                .update(combatSessions)
                .set({ state: 'RUNNING', current_turn_index: 0, updated_at: new Date() })
                .where(eq(combatSessions.id, sessionId));
            break;
        }
        case 'end': {
            await db
                .update(combatants)
                .set({ is_active_turn: false })
                .where(eq(combatants.session_id, sessionId));
            await db
                .update(combatSessions)
                .set({ state: 'ENDED', updated_at: new Date() })
                .where(eq(combatSessions.id, sessionId));
            break;
        }
        default:
            throw httpError(400, 'Invalid action. Use: next, start, or end');
    }

    return fetchSessionWithCombatants(sessionId);
}
