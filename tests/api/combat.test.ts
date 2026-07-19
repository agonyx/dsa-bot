import 'dotenv/config';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApiApp } from '../../api';
import { db, closeDb } from '../../db';
import { players, mobs, combatSessions } from '../../db/schema';
import { eq } from 'drizzle-orm';

const TEST_DISCORD_ID = `test-api-cbt-${Date.now()}`;
const MOB_NAME = `Test Combat Mob ${Date.now()}`;
const CHANNEL = `test-channel-${Date.now()}`;
const app = createApiApp({ resolveCtx: async () => ({ discordId: TEST_DISCORD_ID }) });

const json = (method: string, body?: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});
const setStat = (statKey: string, value: number) =>
    app.request('/characters/stats', json('PATCH', { statKey, value }));

const OUTCOMES = new Set(['CRITICAL_SUCCESS', 'NORMAL_HIT', 'NORMAL_MISS', 'BOTCH']);

describe('combat API (live DB)', () => {
    let sessionId: string;
    let playerId: number;
    let mobId: number;
    let playerCombatantId: string;
    let npcCombatantId: string;

    after(async () => {
        await db.delete(combatSessions).where(eq(combatSessions.dm_user_id, TEST_DISCORD_ID));
        await db.delete(mobs).where(eq(mobs.name, MOB_NAME));
        await db.delete(players).where(eq(players.discord_id, TEST_DISCORD_ID));
        await closeDb();
    });

    it('setup: player + mob + session + two combatants', async () => {
        // Player character with combat stats (no weapon → falls back to attacke_basis / parade_basis)
        const cr = await (await app.request('/characters', json('POST', { name: 'Combat Tester' }))).json();
        playerId = cr.player.id;
        await app.request(`/characters/${playerId}/select`, { method: 'POST' });
        for (const [k, v] of [
            ['le_max', 100], ['le_current', 100], ['initiative', 10],
            ['attacke_basis', 12], ['parade_basis', 8], ['ruestungsschutz', 2],
        ] as [string, number][]) {
            await setStat(k, v);
        }

        // Mob template
        const mob = await (
            await app.request('/mobs', json('POST', {
                name: MOB_NAME, base_max_hp: 100, base_initiative: 8, base_attack_value: 12,
                base_parry_value: 6, base_armor_soak: 1, base_damage_tp: '1w6+2',
            }))
        ).json();
        mobId = mob.id;

        // Session
        const sess = await (
            await app.request('/combat', json('POST', { channelId: CHANNEL, dmUserId: TEST_DISCORD_ID }))
        ).json();
        sessionId = sess.id;
        assert.equal(sess.state, 'SETUP');

        const pc = await (
            await app.request(`/combat/${sessionId}/combatants`, json('POST', {
                type: 'PLAYER', allegiance: 'PLAYER_SIDE', playerId, discordUserId: TEST_DISCORD_ID,
                name: 'Combat Tester', maxHp: 100, currentHp: 100, initiativeBase: 10,
            }))
        ).json();
        playerCombatantId = pc.id;

        const nc = await (
            await app.request(`/combat/${sessionId}/combatants`, json('POST', {
                type: 'NPC', allegiance: 'HOSTILE', mobDefinitionId: mobId, name: MOB_NAME,
                maxHp: 100, currentHp: 100, initiativeBase: 8,
            }))
        ).json();
        npcCombatantId = nc.id;
    });

    it('begin → RUNNING with a 2-entry turn order', async () => {
        const r = await (await app.request(`/combat/${sessionId}/begin`, { method: 'POST' })).json();
        assert.equal(r.state, 'RUNNING');
        assert.equal(r.turn_order.length, 2);
        assert.ok(r.current_round >= 1);
    });

    it('attack by the active combatant → well-formed result', async () => {
        const st = await (await app.request(`/combat/${sessionId}`)).json();
        const activeId = st.session.turn_order[st.session.current_turn_index];
        const target = st.combatants.find((c: { id: string }) => c.id !== activeId);

        const r = await (
            await app.request(`/combat/${sessionId}/attack`, json('POST', { attackerId: activeId, targetId: target.id }))
        ).json();
        assert.ok(OUTCOMES.has(r.attack.outcome));
        assert.ok(r.attackerHpAfter >= 0 && r.attackerHpAfter <= r.attackerHpBefore);
        assert.ok(r.targetHpAfter >= 0 && r.targetHpAfter <= r.targetHpBefore);
        if (r.hitConnected) {
            assert.ok(r.finalDamage >= 0);
            assert.ok(r.targetHpAfter < r.targetHpBefore || r.finalDamage === 0);
        }
        assert.ok(typeof r.logMessage === 'string' && r.logMessage.length > 0);
    });

    it('attack out of turn → 400', async () => {
        // The NPC is not the active combatant right after the player's turn advanced? Probe with the
        // non-active id; regardless of who is active, attacking the WRONG attacker id errors.
        const st = await (await app.request(`/combat/${sessionId}`)).json();
        const activeId = st.session.turn_order[st.session.current_turn_index];
        const other = st.combatants.find((c: { id: string }) => c.id !== activeId);
        const r = await app.request(`/combat/${sessionId}/attack`, json('POST', { attackerId: other.id, targetId: activeId }));
        assert.equal(r.status, 400);
    });

    it('advance → not ended (both sides still standing)', async () => {
        const r = await (await app.request(`/combat/${sessionId}/advance`, { method: 'POST' })).json();
        assert.equal(r.ended, false);
    });

    it('conditions: apply / list / remove on the NPC combatant', async () => {
        const apply = await (
            await app.request(`/combat/combatants/${npcCombatantId}/conditions`, json('POST', {
                conditionType: 'betaeubung', level: 2, source: 'test',
            }))
        ).json();
        assert.equal(apply.level, 2);

        const list = await (await app.request(`/combat/combatants/${npcCombatantId}/conditions`)).json();
        assert.ok(list.some((c: { condition_type: string }) => c.condition_type === 'betaeubung'));

        await app.request(`/combat/combatants/${npcCombatantId}/conditions/betaeubung`, { method: 'DELETE' });
        const after = await (await app.request(`/combat/combatants/${npcCombatantId}/conditions`)).json();
        assert.equal(after.filter((c: { condition_type: string }) => c.condition_type === 'betaeubung').length, 0);
    });

    it('condition level out of range → 400', async () => {
        const r = await app.request(
            `/combat/combatants/${npcCombatantId}/conditions`,
            json('POST', { conditionType: 'furcht', level: 9 })
        );
        assert.equal(r.status, 400);
    });

    it('end → ENDED', async () => {
        const r = await (await app.request(`/combat/${sessionId}/end`, json('POST', { reason: 'test done' }))).json();
        assert.equal(r.state, 'ENDED');
    });

    it('non-DM cannot begin a session → 403', async () => {
        const other = createApiApp({ resolveCtx: async () => ({ discordId: 'someone-else' }) });
        const sess = await (
            await app.request('/combat', json('POST', { channelId: `${CHANNEL}-dm`, dmUserId: TEST_DISCORD_ID }))
        ).json();
        const r = await other.request(`/combat/${sess.id}/begin`, { method: 'POST' });
        assert.equal(r.status, 403);
        await app.request(`/combat/${sess.id}`, { method: 'DELETE' }); // cleanup (SETUP cancel)
    });
});
