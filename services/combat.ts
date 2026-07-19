/**
 * Combat services — transactional, sessionId-keyed combat resolution over the
 * `combat_sessions` / `combatants` tables. The DB is the source of truth (the
 * Discord bot keeps an in-memory mirror for fast display; these services don't
 * depend on it). Pure resolution math (resolveAttack/resolveDefense/applySoak/
 * parseAndRollDamage) is reused from utils/combatUtils.
 *
 * Authorization: begin/end/park/resume/cancel require ctx.discordId to be the
 * session DM. Attack resolution requires the attacker to hold the active turn.
 * Throws HttpError on business failures. No discord.js, no HTTP.
 *
 * NOTE (deferred): the live bot applies transient in-memory `effects` (e.g. a
 * parry-granted +PA) during attack resolution. Those have no persistence home
 * yet, so this service computes base AT/PA/RS/TP from stats/weapons/mob defs.
 * Giving effects a persisted home + wiring the Discord handlers to these
 * services is the remaining combat follow-up (needs server E2E).
 */
import { db } from '../db';
import { eq, and, inArray } from 'drizzle-orm';
import {
    combatSessions,
    combatants,
    combatantConditions,
    stats,
    weapons,
    mobs,
    actionModifications,
} from '../db/schema';
import { httpError } from '../db/operations/errors';
import { startCombat as startCombatOp, endCombat as endCombatOp, createCombatant as createCombatantOp } from '../db/operations';
import { resolveAttack, resolveDefense, applySoak, parseAndRollDamage, rollDice } from '../utils/combatUtils';
import type { Ctx } from './_ctx';

const MAX_LOG = 20;

type SessionRow = typeof combatSessions.$inferSelect;
type CombatantRow = typeof combatants.$inferSelect;

export interface CombatState {
    session: SessionRow;
    combatants: CombatantRow[];
}

async function loadSession(sessionId: string): Promise<CombatState> {
    const [session] = await db.select().from(combatSessions).where(eq(combatSessions.id, sessionId));
    if (!session) throw httpError(404, 'Combat session not found');
    const rows = await db.select().from(combatants).where(eq(combatants.session_id, sessionId));
    return { session, combatants: rows };
}

/** Public read accessor: full session + combatants. ctx-authority not enforced (read-only). */
export async function getCombatSession(_ctx: Ctx, sessionId: string): Promise<CombatState> {
    return loadSession(sessionId);
}

function assertDm(session: SessionRow, ctx: Ctx) {
    if (session.dm_user_id !== ctx.discordId) throw httpError(403, 'Only the DM can perform this action');
}

async function appendLog(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], sessionId: string, entry: string) {
    const [s] = await tx.select({ log: combatSessions.combat_log }).from(combatSessions).where(eq(combatSessions.id, sessionId));
    const next = [...(s?.log ?? []), entry].slice(-MAX_LOG);
    await tx.update(combatSessions).set({ combat_log: next }).where(eq(combatSessions.id, sessionId));
}

// ---------------------------------------------------------------------------
// Setup / lifecycle
// ---------------------------------------------------------------------------

export async function createCombatSession(ctx: Ctx, input: { channelId: string; dmUserId: string }) {
    if (!input.channelId || !input.dmUserId) throw httpError(400, 'channelId and dmUserId are required');

    const [existing] = await db
        .select({ id: combatSessions.id })
        .from(combatSessions)
        .where(
            and(
                eq(combatSessions.channel_id, input.channelId),
                inArray(combatSessions.state, ['SETUP', 'RUNNING', 'PAUSED'])
            )
        )
        .limit(1);
    if (existing) throw httpError(409, 'An active combat session already exists in this channel');

    const [session] = await db
        .insert(combatSessions)
        .values({ channel_id: input.channelId, dm_user_id: input.dmUserId, state: 'SETUP' })
        .returning();
    return session;
}

export async function setMessageId(ctx: Ctx, sessionId: string, messageId: string) {
    const { session } = await loadSession(sessionId);
    assertDm(session, ctx);
    const [updated] = await db
        .update(combatSessions)
        .set({ message_id: messageId })
        .where(eq(combatSessions.id, sessionId))
        .returning();
    return updated;
}

export async function addCombatant(
    ctx: Ctx,
    input: {
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
) {
    // createCombatant (db/operations) validates session + duplicate-discord-user.
    return createCombatantOp(input);
}

export async function removeCombatant(ctx: Ctx, input: { sessionId: string; combatantId: string }) {
    const [deleted] = await db
        .delete(combatants)
        .where(and(eq(combatants.id, input.combatantId), eq(combatants.session_id, input.sessionId)))
        .returning({ id: combatants.id });
    if (!deleted) throw httpError(404, 'Combatant not found');
    return { deleted: true };
}

/** Transition SETUP → RUNNING: roll initiative, sort, persist turn order + first active. */
export async function beginCombat(ctx: Ctx, sessionId: string) {
    const { session, combatants } = await loadSession(sessionId);
    assertDm(session, ctx);
    if (session.state !== 'SETUP') throw httpError(400, `Combat can only begin from SETUP (current: ${session.state})`);
    if (combatants.length < 2) throw httpError(400, 'Need at least two participants');

    const hasPlayers = combatants.some((c) => c.allegiance === 'PLAYER_SIDE');
    const hasHostiles = combatants.some((c) => c.allegiance === 'HOSTILE');
    if (!hasPlayers || !hasHostiles) throw httpError(400, 'Need participants from opposing sides');

    const rolled = combatants.map((c) => ({
        id: c.id,
        initiativeRoll: rollDice(6) + (c.initiative_base ?? 0),
        initiativeBase: c.initiative_base ?? 0,
    }));
    rolled.sort((a, b) => b.initiativeRoll - a.initiativeRoll || b.initiativeBase - a.initiativeBase);

    const started = await startCombatOp({
        sessionId,
        turnOrder: rolled.map((r) => r.id),
        combatantInitiatives: rolled.map((r) => ({ combatantId: r.id, initiativeRoll: r.initiativeRoll })),
    });

    // startCombat doesn't set current_round; initialize it.
    if (!started.current_round || started.current_round < 1) {
        const [s] = await db
            .update(combatSessions)
            .set({ current_round: 1 })
            .where(eq(combatSessions.id, sessionId))
            .returning();
        return { ...started, current_round: s?.current_round ?? 1 };
    }
    return started;
}

export async function advanceTurn(ctx: Ctx, sessionId: string): Promise<CombatState & { ended: boolean; reason?: string }> {
    const { session, combatants: combatantRows } = await loadSession(sessionId);
    assertDm(session, ctx);
    if (session.state !== 'RUNNING') throw httpError(400, 'Combat is not running');

    const turnOrder = session.turn_order ?? [];
    if (turnOrder.length === 0) throw httpError(400, 'No combatants in turn order');

    const conscious = combatantRows.filter((c) => c.current_hp > 0);
    const allegiances = new Set(conscious.map((c) => c.allegiance));

    // Victory / draw: end the combat.
    if (conscious.length === 0) {
        await endCombatOp({ sessionId, reason: 'No survivors!' });
        return { session: (await loadSession(sessionId)).session, combatants: (await loadSession(sessionId)).combatants, ended: true, reason: 'No survivors!' };
    }
    if (allegiances.size === 1) {
        const winner = allegiances.has('PLAYER_SIDE') ? 'The players' : 'The hostile forces';
        await endCombatOp({ sessionId, reason: `${winner} are victorious!` });
        const fresh = await loadSession(sessionId);
        return { ...fresh, ended: true, reason: `${winner} are victorious!` };
    }

    // Find next conscious combatant.
    const n = turnOrder.length;
    let nextIndex = session.current_turn_index ?? 0;
    let found: CombatantRow | null = null;
    for (let i = 0; i < n; i++) {
        nextIndex = (nextIndex + 1) % n;
        const c = combatantRows.find((x) => x.id === turnOrder[nextIndex]);
        if (c && c.current_hp > 0) {
            found = c;
            break;
        }
    }
    if (!found) {
        await endCombatOp({ sessionId, reason: 'No conscious combatant could take a turn' });
        const fresh = await loadSession(sessionId);
        return { ...fresh, ended: true, reason: 'No conscious combatant could take a turn' };
    }

    const previousIndex = session.current_turn_index ?? 0;
    const newRound = nextIndex <= previousIndex ? (session.current_round ?? 1) + 1 : session.current_round ?? 1;

    await db.transaction(async (tx) => {
        await tx.update(combatants).set({ is_active_turn: false }).where(eq(combatants.session_id, sessionId));
        await tx.update(combatants).set({ is_active_turn: true }).where(eq(combatants.id, found!.id));
        await tx
            .update(combatSessions)
            .set({ current_turn_index: nextIndex, current_round: newRound })
            .where(eq(combatSessions.id, sessionId));
        await appendLog(tx, sessionId, `--- ${found!.name}'s Turn ---`);
    });

    return { ...(await loadSession(sessionId)), ended: false };
}

export async function endCombatSession(ctx: Ctx, input: { sessionId: string; reason?: string }) {
    const { session } = await loadSession(input.sessionId);
    assertDm(session, ctx);
    return endCombatOp({ sessionId: input.sessionId, reason: input.reason });
}

export async function parkCombat(ctx: Ctx, sessionId: string) {
    const { session } = await loadSession(sessionId);
    assertDm(session, ctx);
    if (session.state !== 'RUNNING') throw httpError(400, `Combat is not running (current: ${session.state})`);
    const [updated] = await db
        .update(combatSessions)
        .set({ state: 'PAUSED' })
        .where(eq(combatSessions.id, sessionId))
        .returning();
    return updated;
}

export async function resumeCombat(ctx: Ctx, sessionId: string) {
    const { session } = await loadSession(sessionId);
    assertDm(session, ctx);
    if (session.state !== 'PAUSED') throw httpError(400, `Combat is not paused (current: ${session.state})`);
    const [updated] = await db
        .update(combatSessions)
        .set({ state: 'RUNNING' })
        .where(eq(combatSessions.id, sessionId))
        .returning();
    return updated;
}

export async function cancelCombat(ctx: Ctx, sessionId: string) {
    const { session } = await loadSession(sessionId);
    assertDm(session, ctx);
    if (session.state !== 'SETUP') throw httpError(400, `Can only cancel a SETUP session (current: ${session.state})`);
    await db.delete(combatSessions).where(eq(combatSessions.id, sessionId));
    return { deleted: true };
}

// ---------------------------------------------------------------------------
// Attack resolution (the centerpiece)
// ---------------------------------------------------------------------------

async function getEffectiveCombatStats(combatant: CombatantRow) {
    if (combatant.type === 'PLAYER') {
        if (!combatant.player_id) throw httpError(400, 'Player combatant has no player_id');
        const [statRow] = await db.select().from(stats).where(eq(stats.player_id, combatant.player_id)).limit(1);
        if (!statRow) throw httpError(400, 'Player has no stats');
        const weaponRows = await db.select().from(weapons).where(eq(weapons.player_id, combatant.player_id));
        const offensive = weaponRows.find(
            (w) => w.is_equipped === 'Y' && (w.equipped_slot === 'OFFENSE' || w.equipped_slot === 'ADAPTIVE')
        );
        const defensive = weaponRows.find(
            (w) => w.is_equipped === 'Y' && (w.equipped_slot === 'DEFENSE' || w.equipped_slot === 'ADAPTIVE')
        );
        return {
            at: offensive ? offensive.at : statRow.attacke_basis || 8,
            pa: defensive ? defensive.pa : statRow.parade_basis || 6,
            rs: statRow.ruestungsschutz || 0,
            tp: offensive ? offensive.tp ?? '1w6' : '1w6',
        };
    }
    // NPC
    if (!combatant.mob_definition_id) throw httpError(400, 'NPC combatant has no mob_definition_id');
    const [mob] = await db.select().from(mobs).where(eq(mobs.id, combatant.mob_definition_id)).limit(1);
    if (!mob) throw httpError(404, 'Mob definition not found');
    return {
        at: mob.base_attack_value,
        pa: mob.base_parry_value,
        rs: mob.base_armor_soak,
        tp: mob.base_damage_tp ?? '1w6',
    };
}

export interface AttackResultOut {
    sessionId: string;
    attacker: { id: string; name: string };
    target: { id: string; name: string };
    maneuverName: string | null;
    atValue: number;
    paValue: number;
    attack: { roll: number; confirmRoll: number | null; outcome: string };
    defense: { roll: number; success: boolean } | null;
    hitConnected: boolean;
    botchDamage: number;
    rolledDamage: number;
    damageBonus: number;
    totalDamage: number;
    finalDamage: number;
    attackerHpBefore: number;
    attackerHpAfter: number;
    targetHpBefore: number;
    targetHpAfter: number;
    logMessage: string;
}

export async function resolveAttackAction(
    ctx: Ctx,
    input: {
        sessionId: string;
        attackerId: string;
        targetId: string;
        maneuverId?: string | null;
        /**
         * Optional parry bonus to add to the target's base PA (e.g. an in-memory
         * `defend` effect the Discord handler tracks). Kept as an override so the
         * service stays DB-clean until effects have a persisted home.
         */
        targetPaBonus?: number;
    }
): Promise<AttackResultOut> {
    const { session, combatants: combatantRows } = await loadSession(input.sessionId);
    if (session.state !== 'RUNNING') throw httpError(400, 'Combat is not running');

    const attacker = combatantRows.find((c) => c.id === input.attackerId);
    const target = combatantRows.find((c) => c.id === input.targetId);
    if (!attacker) throw httpError(404, 'Attacker not found');
    if (!target) throw httpError(404, 'Target not found');
    if (target.current_hp <= 0) throw httpError(400, `${target.name} is already defeated`);

    const turnOrder = session.turn_order ?? [];
    const activeId = turnOrder[session.current_turn_index ?? -1];
    if (attacker.id !== activeId) throw httpError(400, "It's not the attacker's turn");

    let maneuver: typeof actionModifications.$inferSelect | null = null;
    if (input.maneuverId && input.maneuverId !== 'null') {
        const [m] = await db
            .select()
            .from(actionModifications)
            .where(eq(actionModifications.id, input.maneuverId))
            .limit(1);
        maneuver = m ?? null;
    }

    const [att, tar] = await Promise.all([getEffectiveCombatStats(attacker), getEffectiveCombatStats(target)]);
    let atValue = att.at;
    let paValue = tar.pa + (input.targetPaBonus ?? 0);
    let damageBonus = 0;
    if (maneuver?.rules && typeof maneuver.rules === 'object') {
        const r = maneuver.rules as { at_modifier?: number; opponent_pa_modifier?: number; damage_bonus?: number };
        if (r.at_modifier) atValue += r.at_modifier;
        if (r.opponent_pa_modifier) paValue += r.opponent_pa_modifier;
        if (r.damage_bonus) damageBonus += r.damage_bonus;
    }

    const attack = resolveAttack(atValue);
    let defense: { roll: number; success: boolean } | null = null;
    let hitConnected = false;
    let botchDamage = 0;

    if (attack.outcome === 'BOTCH') {
        botchDamage = Math.max(1, Math.floor(parseAndRollDamage(att.tp) / 2));
    } else if (attack.outcome === 'CRITICAL_SUCCESS') {
        hitConnected = true;
    } else if (attack.outcome === 'NORMAL_HIT') {
        defense = resolveDefense(paValue);
        hitConnected = !defense.success;
    }

    let rolledDamage = 0;
    let totalDamage = 0;
    let finalDamage = 0;
    if (hitConnected) {
        rolledDamage = parseAndRollDamage(att.tp);
        if (attack.outcome === 'CRITICAL_SUCCESS') rolledDamage *= 2;
        totalDamage = rolledDamage + damageBonus;
        finalDamage = applySoak(totalDamage, tar.rs);
    }

    const attackerHpBefore = attacker.current_hp;
    const targetHpBefore = target.current_hp;
    const attackerHpAfter = botchDamage > 0 ? Math.max(0, attacker.current_hp - botchDamage) : attacker.current_hp;
    const targetHpAfter = finalDamage > 0 ? Math.max(0, target.current_hp - finalDamage) : target.current_hp;

    const logMessage = buildAttackLog({
        attackerName: attacker.name,
        targetName: target.name,
        maneuverName: maneuver?.name ?? null,
        atValue,
        attack,
        defense,
        hitConnected,
        botchDamage,
        rolledDamage,
        damageBonus,
        totalDamage,
        rs: tar.rs,
        finalDamage,
        attackerHpAfter,
        attackerMaxHp: attacker.max_hp,
        targetHpAfter,
        targetMaxHp: target.max_hp,
    });

    await db.transaction(async (tx) => {
        if (botchDamage > 0) {
            await tx.update(combatants).set({ current_hp: attackerHpAfter }).where(eq(combatants.id, attacker.id));
        }
        if (finalDamage > 0) {
            await tx.update(combatants).set({ current_hp: targetHpAfter }).where(eq(combatants.id, target.id));
        }
        await appendLog(tx, input.sessionId, logMessage);
    });

    return {
        sessionId: input.sessionId,
        attacker: { id: attacker.id, name: attacker.name },
        target: { id: target.id, name: target.name },
        maneuverName: maneuver?.name ?? null,
        atValue,
        paValue,
        attack: { roll: attack.roll, confirmRoll: attack.confirmRoll, outcome: attack.outcome },
        defense,
        hitConnected,
        botchDamage,
        rolledDamage,
        damageBonus,
        totalDamage,
        finalDamage,
        attackerHpBefore,
        attackerHpAfter,
        targetHpBefore,
        targetHpAfter,
        logMessage,
    };
}

interface LogInput {
    attackerName: string;
    targetName: string;
    maneuverName: string | null;
    atValue: number;
    attack: { roll: number; confirmRoll: number | null; outcome: string };
    defense: { roll: number; success: boolean } | null;
    hitConnected: boolean;
    botchDamage: number;
    rolledDamage: number;
    damageBonus: number;
    totalDamage: number;
    rs: number;
    finalDamage: number;
    attackerHpAfter: number;
    attackerMaxHp: number;
    targetHpAfter: number;
    targetMaxHp: number;
}

function buildAttackLog(i: LogInput): string {
    let m = i.attackerName + (i.maneuverName ? ` uses **${i.maneuverName}**` : '') + ` attacks ${i.targetName}.`;
    m += ` (Roll: ${i.attack.roll}/${i.atValue})`;
    if (i.attack.confirmRoll !== null) m += ` (Confirm: ${i.attack.confirmRoll})`;

    if (i.attack.outcome === 'BOTCH') {
        m += ` -> **BOTCH!** ${i.attackerName} injures themselves for ${i.botchDamage} damage! | ${i.attackerName} HP: ${i.attackerHpAfter}/${i.attackerMaxHp}.`;
        if (i.attackerHpAfter <= 0) m += ` **Self-defeated!**`;
        return m;
    }
    if (i.attack.outcome === 'CRITICAL_SUCCESS') {
        m += ` -> **CRITICAL!** Cannot be parried!`;
    } else if (i.attack.outcome === 'NORMAL_HIT') {
        if (i.defense) {
            m += ` | ${i.targetName} Parry: ${i.defense.roll}.`;
            m += i.defense.success ? ` **Parried!**` : ` Parry Failed.`;
        }
    } else {
        m += ` -> **Miss!**`;
    }

    if (i.hitConnected) {
        const dmgLog = i.damageBonus > 0 ? ` | ${i.rolledDamage} + ${i.damageBonus} (Skill) = ${i.totalDamage} TP` : ` | ${i.totalDamage} TP`;
        m += `${dmgLog} - ${i.rs} RS = **${i.finalDamage} DMG!** | ${i.targetName} HP: ${i.targetHpAfter}/${i.targetMaxHp}.`;
        if (i.targetHpAfter <= 0) m += ` **Defeated!**`;
    }
    return m;
}

// ---------------------------------------------------------------------------
// Conditions (combatant-scoped — belongs with combat)
// ---------------------------------------------------------------------------

export async function listConditions(ctx: Ctx, combatantId: string) {
    return db
        .select({
            condition_type: combatantConditions.condition_type,
            level: combatantConditions.level,
            source: combatantConditions.source,
            duration_type: combatantConditions.duration_type,
            duration_remaining: combatantConditions.duration_remaining,
        })
        .from(combatantConditions)
        .where(eq(combatantConditions.combatant_id, combatantId))
        .orderBy(combatantConditions.condition_type);
}

export async function applyCondition(
    ctx: Ctx,
    input: {
        combatantId: string;
        conditionType: string;
        level: number;
        source?: string | null;
        durationType?: string | null;
        durationRemaining?: number | null;
    }
) {
    if (!Number.isInteger(input.level) || input.level < 1 || input.level > 4) {
        throw httpError(400, 'level must be an integer 1-4');
    }
    const [row] = await db
        .insert(combatantConditions)
        .values({
            combatant_id: input.combatantId,
            condition_type: input.conditionType,
            level: input.level,
            source: input.source ?? null,
            duration_type: input.durationType ?? null,
            duration_remaining: input.durationRemaining ?? null,
        })
        .onConflictDoUpdate({
            target: [combatantConditions.combatant_id, combatantConditions.condition_type],
            set: {
                level: input.level,
                source: input.source ?? null,
                duration_type: input.durationType ?? null,
                duration_remaining: input.durationRemaining ?? null,
                updated_at: new Date(),
            },
        })
        .returning();
    return row;
}

export async function removeCondition(ctx: Ctx, input: { combatantId: string; conditionType: string }) {
    const [deleted] = await db
        .delete(combatantConditions)
        .where(
            and(
                eq(combatantConditions.combatant_id, input.combatantId),
                eq(combatantConditions.condition_type, input.conditionType)
            )
        )
        .returning({ id: combatantConditions.id });
    if (!deleted) throw httpError(404, 'Condition not found on combatant');
    return { deleted: true };
}

export { loadSession };
