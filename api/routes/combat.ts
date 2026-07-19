import { Hono } from 'hono';
import type { Ctx } from '../../services/_ctx';
import * as combat from '../../services/combat';

type AppEnv = { Variables: { ctx: Ctx } };

/**
 * /api/combat — transactional, sessionId-keyed combat lifecycle + resolution.
 * The website drives combat through these; the Discord handlers call the same
 * services in-process. All ctx-authenticated (DM-only actions enforce it).
 */
export const combatRoutes = new Hono<AppEnv>();

combatRoutes.post('/', async (c) => {
    const { channelId, dmUserId } = await c.req.json<{ channelId: string; dmUserId: string }>();
    return c.json(await combat.createCombatSession(c.get('ctx'), { channelId, dmUserId }), 201);
});

combatRoutes.get('/:sessionId', async (c) =>
    c.json(await combat.getCombatSession(c.get('ctx'), c.req.param('sessionId')))
);

combatRoutes.post('/:sessionId/combatants', async (c) => {
    const body = await c.req.json();
    return c.json(await combat.addCombatant(c.get('ctx'), { ...body, sessionId: c.req.param('sessionId') }), 201);
});

combatRoutes.delete('/:sessionId/combatants/:combatantId', async (c) => {
    return c.json(
        await combat.removeCombatant(c.get('ctx'), {
            sessionId: c.req.param('sessionId'),
            combatantId: c.req.param('combatantId'),
        })
    );
});

combatRoutes.post('/:sessionId/begin', async (c) => c.json(await combat.beginCombat(c.get('ctx'), c.req.param('sessionId'))));

combatRoutes.post('/:sessionId/attack', async (c) => {
    const { attackerId, targetId, maneuverId } = await c.req.json<{
        attackerId: string;
        targetId: string;
        maneuverId?: string | null;
    }>();
    return c.json(
        await combat.resolveAttackAction(c.get('ctx'), {
            sessionId: c.req.param('sessionId'),
            attackerId,
            targetId,
            maneuverId,
        })
    );
});

combatRoutes.post('/:sessionId/advance', async (c) => c.json(await combat.advanceTurn(c.get('ctx'), c.req.param('sessionId'))));

combatRoutes.post('/:sessionId/end', async (c) => {
    const { reason } = await c.req.json<{ reason?: string }>();
    return c.json(await combat.endCombatSession(c.get('ctx'), { sessionId: c.req.param('sessionId'), reason }));
});

combatRoutes.post('/:sessionId/park', async (c) => c.json(await combat.parkCombat(c.get('ctx'), c.req.param('sessionId'))));

combatRoutes.post('/:sessionId/resume', async (c) => c.json(await combat.resumeCombat(c.get('ctx'), c.req.param('sessionId'))));

combatRoutes.delete('/:sessionId', async (c) => c.json(await combat.cancelCombat(c.get('ctx'), c.req.param('sessionId'))));

// --- Combatant conditions (combatant-scoped) ---
combatRoutes.post('/combatants/:combatantId/conditions', async (c) => {
    const body = await c.req.json();
    return c.json(await combat.applyCondition(c.get('ctx'), { ...body, combatantId: c.req.param('combatantId') }), 201);
});

combatRoutes.get('/combatants/:combatantId/conditions', async (c) =>
    c.json(await combat.listConditions(c.get('ctx'), c.req.param('combatantId')))
);

combatRoutes.delete('/combatants/:combatantId/conditions/:type', async (c) =>
    c.json(
        await combat.removeCondition(c.get('ctx'), {
            combatantId: c.req.param('combatantId'),
            conditionType: c.req.param('type'),
        })
    )
);
