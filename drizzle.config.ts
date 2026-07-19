import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Drizzle Kit config. Schema is authored in db/schema.ts; migrations are emitted to ./drizzle.
// Apply with `npm run db:push` (dev) or `npm run db:generate` + `npm run db:migrate` (versioned).
export default defineConfig({
    schema: './db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
