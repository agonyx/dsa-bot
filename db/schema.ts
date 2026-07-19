/**
 * Drizzle schema for DSANewBot — single source of truth for the data model.
 *
 * Mirrors the live Supabase/Postgres schema. Property names are kept in
 * snake_case on purpose so they match the column names and the existing bot
 * code (which reads rows by snake_case key, e.g. `stats.le_max`,
 * `resourceType.currentCol === 'asp_current'`). This keeps the Phase 3 call-site
 * rewrite a near 1:1 swap and lets `utils/transforms.js` keep working unchanged.
 *
 * Source references:
 *  - Enums + CASCADE rules: DSABackend/AGENTS.md (lines ~132-154)
 *  - rules tables DDL:      DSANewBot/RULES_VECTOR_DB.md (lines ~88-294)
 *  - Column inference:      commands/*, handlers/*, utils/* (see migration plan)
 *
 * NOTE: This is the reconstructed schema (fallback branch). If a `pg_dump
 * --schema-only` from the live Supabase project becomes available, diff this
 * file against it before applying.
 */

import { sql } from 'drizzle-orm';
import {
    boolean,
    customType,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums (verbatim from DSABackend/AGENTS.md)
// ---------------------------------------------------------------------------

export const selectedEnum = pgEnum('selected_enum', ['NO', 'YES']);
export const combatStateEnum = pgEnum('combat_state', ['SETUP', 'RUNNING', 'PAUSED', 'ENDED']);
export const combatantTypeEnum = pgEnum('combatant_type', ['PLAYER', 'NPC']);
export const combatantAllegianceEnum = pgEnum('combatant_allegiance', ['PLAYER_SIDE', 'HOSTILE']);
export const weaponTypeEnum = pgEnum('weapon_type', ['MELEE', 'RANGED']);
export const equippedStatusEnum = pgEnum('equipped_status', ['Y', 'N']);
export const equippedSlotEnum = pgEnum('equipped_slot', ['ADAPTIVE', 'OFFENSE', 'DEFENSE']);
export const actionTypeEnum = pgEnum('action_type', ['MELEE', 'RANGED', 'MAGIC']);

// Item type is referenced in code as a free-form string enum (POTION/FOOD/...).
// Kept as text rather than a DB enum so the catalog stays open-ended.
// Weapon/item/category fields below follow the same convention.

// ---------------------------------------------------------------------------
// pgvector custom type — vector(N). Requires `CREATE EXTENSION vector`.
// ---------------------------------------------------------------------------

export const vector = customType<{ data: string; driverData: string; config: { length: number } }>({
    dataType(config) {
        return `vector(${config?.length ?? 1536})`;
    },
});

// ---------------------------------------------------------------------------
// Core character tables
// ---------------------------------------------------------------------------

export const players = pgTable('players', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    discord_id: text().notNull(),
    selected: selectedEnum().default('NO').notNull(),
    avatar: text(),
});

export const stats = pgTable('stats', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    player_id: integer()
        .notNull()
        .references(() => players.id, { onDelete: 'cascade' }),
    // 8 DSA attributes. `in` is a SQL keyword; Drizzle quotes it as "in".
    mu: integer().default(0).notNull(),
    kl: integer().default(0).notNull(),
    in: integer().default(0).notNull(),
    ch: integer().default(0).notNull(),
    ff: integer().default(0).notNull(),
    ge: integer().default(0).notNull(),
    ko: integer().default(0).notNull(),
    kk: integer().default(0).notNull(),
    le_max: integer().default(0).notNull(),
    le_current: integer().default(0).notNull(),
    asp_max: integer().default(0).notNull(),
    asp_current: integer().default(0).notNull(),
    kap_max: integer().default(0).notNull(),
    kap_current: integer().default(0).notNull(),
    schicksalspunkte_max: integer().default(0).notNull(),
    schicksalspunkte_current: integer().default(0).notNull(),
    initiative: integer().default(0).notNull(),
    ruestungsschutz: integer().default(0).notNull(),
    ausweichen: integer().default(0).notNull(),
    attacke_basis: integer().default(0).notNull(),
    parade_basis: integer().default(0).notNull(),
});

export const talents = pgTable('talents', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(),
    stat1: text().notNull(),
    stat2: text().notNull(),
    stat3: text().notNull(),
});

export const playerTalents = pgTable('player_talents', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    player_id: integer()
        .notNull()
        .references(() => players.id, { onDelete: 'cascade' }),
    talent_id: integer()
        .notNull()
        .references(() => talents.id, { onDelete: 'cascade' }),
    ftw: integer().default(0).notNull(),
});

export const actionModifications = pgTable('action_modifications', {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(),
    description: text(),
    action_type: actionTypeEnum(),
    prerequisites: jsonb(),
    rules: jsonb(),
});

export const playerActionModifications = pgTable('player_action_modifications', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    player_id: integer()
        .notNull()
        .references(() => players.id, { onDelete: 'cascade' }),
    action_modification_id: uuid()
        .notNull()
        .references(() => actionModifications.id, { onDelete: 'cascade' }),
    ftw: integer().default(0).notNull(),
});

export const weapons = pgTable('weapons', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    player_id: integer()
        .notNull()
        .references(() => players.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    type: weaponTypeEnum(),
    tp: text(),
    at: integer().default(0).notNull(),
    pa: integer().default(0).notNull(),
    is_equipped: equippedStatusEnum().default('N').notNull(),
    equipped_slot: equippedSlotEnum(),
});

export const items = pgTable('items', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    player_id: integer()
        .notNull()
        .references(() => players.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    type: text().notNull(),
    effect: text(),
    description: text(),
    quantity: integer().default(1).notNull(),
});

export const mobs = pgTable('mobs', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull().unique(),
    description: text(),
    base_max_hp: integer().notNull(),
    base_initiative: integer().notNull(),
    base_attack_value: integer().notNull(),
    base_parry_value: integer().notNull(),
    base_armor_soak: integer().notNull(),
    base_damage_tp: text(),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Combat tables
// ---------------------------------------------------------------------------

export const combatSessions = pgTable('combat_sessions', {
    id: uuid().primaryKey().defaultRandom(),
    channel_id: text().notNull(),
    dm_user_id: text().notNull(),
    message_id: text(),
    state: combatStateEnum().default('SETUP').notNull(),
    turn_order: text().array().default(sql`'{}'::text[]`).notNull(),
    current_turn_index: integer().default(0).notNull(),
    current_round: integer().default(0).notNull(),
    combat_log: text().array().default(sql`'{}'::text[]`).notNull(),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const combatants = pgTable('combatants', {
    id: uuid().primaryKey().defaultRandom(),
    session_id: uuid()
        .notNull()
        .references(() => combatSessions.id, { onDelete: 'cascade' }),
    type: combatantTypeEnum().notNull(),
    allegiance: combatantAllegianceEnum().notNull(),
    player_id: integer().references(() => players.id, { onDelete: 'set null' }),
    discord_user_id: text(),
    mob_definition_id: integer().references(() => mobs.id, { onDelete: 'set null' }),
    name: text().notNull(),
    max_hp: integer().notNull(),
    current_hp: integer().notNull(),
    initiative_base: integer().default(0).notNull(),
    initiative_roll: integer(),
    is_active_turn: boolean().default(false).notNull(),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

// Leveled Zustände (Stufe I-IV)
export const combatantConditions = pgTable(
    'combatant_conditions',
    {
        id: uuid().primaryKey().defaultRandom(),
        combatant_id: uuid()
            .notNull()
            .references(() => combatants.id, { onDelete: 'cascade' }),
        condition_type: text().notNull(),
        level: integer().notNull(),
        source: text(),
        duration_type: text(), // rounds | minutes | hours | rest | permanent
        duration_remaining: integer(),
        created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
        updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
        unique('combatant_conditions_combatant_id_condition_type_key').on(
            t.combatant_id,
            t.condition_type
        ),
    ]
);

// Binary on/off status effects
export const combatantStatuses = pgTable(
    'combatant_statuses',
    {
        id: uuid().primaryKey().defaultRandom(),
        combatant_id: uuid()
            .notNull()
            .references(() => combatants.id, { onDelete: 'cascade' }),
        status_type: text().notNull(),
        source: text(),
        duration_rounds: integer(), // null = permanent
        created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
        updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
        unique('combatant_statuses_combatant_id_status_type_key').on(t.combatant_id, t.status_type),
    ]
);

// ---------------------------------------------------------------------------
// Rules knowledge base (pgvector). DDL cross-checked against RULES_VECTOR_DB.md.
// ---------------------------------------------------------------------------

export const rulePages = pgTable('rule_pages', {
    id: uuid().primaryKey().defaultRandom(),
    doc_id: text().notNull().unique(),
    source_item_id: text(),
    source_url: text().notNull().unique(),
    url_hash: text().notNull(),
    canonical_slug: text().notNull().unique(),
    title: text().notNull(),
    category: text().notNull(),
    resolved_category: text(),
    subcategory: text(),
    page_state: text(),
    is_unresolved: boolean().default(false).notNull(),
    resolution_confidence: text(),
    normalized_content: text().notNull(),
    content_hash: text().notNull(),
    parser_version: text().notNull(),
    scraper_version: text().notNull(),
    source_snapshot_at: timestamp({ withTimezone: true }),
    version: integer().default(1).notNull(),
    metadata: jsonb().default(sql`'{}'::jsonb`).notNull(),
    last_seen_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const ruleChunks = pgTable(
    'rule_chunks',
    {
        id: uuid().primaryKey().defaultRandom(),
        chunk_id: text().notNull().unique(),
        page_id: uuid()
            .notNull()
            .references(() => rulePages.id, { onDelete: 'cascade' }),
        version: integer().notNull(),
        chunk_index: integer().notNull(),
        title: text(),
        category: text().notNull(),
        resolved_category: text(),
        heading: text(),
        chunk_text: text().notNull(),
        char_start: integer(),
        char_end: integer(),
        embedding: vector({ length: 1536 }),
        embedding_model: text(),
        embedded_at: timestamp({ withTimezone: true }),
        is_unresolved: boolean().default(false).notNull(),
        metadata: jsonb().default(sql`'{}'::jsonb`).notNull(),
        created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
        updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
        is_active: boolean().default(true).notNull(),
    },
    (t) => [
        unique('rule_chunks_page_id_version_chunk_index_key').on(
            t.page_id,
            t.version,
            t.chunk_index
        ),
    ]
);

// Note: the HNSW index on rule_chunks.embedding and the match_rule_chunks()
// function are created via a raw SQL migration (db/sql/rules_vector.sql) —
// Drizzle cannot express either. See RULES_VECTOR_DB.md for the canonical DDL.
