/**
 * Seed the talent and action_modification catalogs (idempotent).
 *   tsx scripts/seed.ts     (or: npm run db:seed)
 */

import 'dotenv/config';
import { seedDatabase } from '../db/operations';
import { closeDb } from '../db';

(async () => {
    try {
        const result = await seedDatabase();
        console.log('seed result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('seed failed:', err instanceof Error ? err.message : err);
        process.exitCode = 1;
    } finally {
        await closeDb();
    }
})();
