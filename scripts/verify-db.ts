/**
 * DB verification tool — confirms the self-hosted Postgres came up correctly with
 * the pgvector extension, all 15 tables, and the match_rule_chunks() function.
 *
 *   tsx scripts/verify-db.ts
 *
 * Reads DATABASE_URL from .env. Safe to run any time (read-only queries).
 */

import 'dotenv/config';
import { pool, closeDb } from '../db';

(async () => {
    const lines: string[] = [];
    try {
        const versionRows = (await pool`select version() as v`) as { v: string }[];
        lines.push(`✓ connected: ${versionRows[0].v.split('(')[0].trim()}`);

        const ext = (await pool`select extversion from pg_extension where extname = 'vector'`) as {
            extversion: string;
        }[];
        lines.push(ext.length ? `✓ pgvector ${ext[0].extversion}` : `✗ pgvector extension MISSING`);

        const tables = (await pool`
            select table_name from information_schema.tables
            where table_schema = 'public' and table_type = 'BASE TABLE'
            order by table_name
        `) as { table_name: string }[];
        lines.push(`tables (${tables.length}): ${tables.map((t) => t.table_name).join(', ')}`);

        const expected = [
            'players', 'stats', 'weapons', 'items', 'mobs', 'talents', 'player_talents',
            'action_modifications', 'player_action_modifications', 'combat_sessions',
            'combatants', 'combatant_conditions', 'combatant_statuses', 'rule_pages', 'rule_chunks',
        ];
        const present = new Set(tables.map((t) => t.table_name));
        const missing = expected.filter((t) => !present.has(t));
        lines.push(missing.length ? `✗ missing tables: ${missing.join(', ')}` : `✓ all 15 expected tables present`);

        const fn = (await pool`
            select p.proname from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'match_rule_chunks'
        `) as { proname: string }[];
        lines.push(fn.length ? '✓ match_rule_chunks() present' : '✗ match_rule_chunks() MISSING');

        const counts = (await pool`
            select
              (select count(*) from talents) as talents,
              (select count(*) from action_modifications) as action_modifications,
              (select count(*) from rule_pages) as rule_pages,
              (select count(*) from rule_chunks) as rule_chunks,
              (select count(*) from players) as players
        `) as Record<string, string>[];
        lines.push(`row counts: ${JSON.stringify(counts[0])}`);
    } catch (err) {
        console.error('verify failed:', err instanceof Error ? err.message : err);
        process.exitCode = 1;
    } finally {
        await closeDb();
    }
    console.log(lines.join('\n'));
})();
