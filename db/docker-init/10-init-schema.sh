#!/bin/bash
# Postgres first-boot init script (auto-run by the official postgres image when the
# data directory is empty). Mount this file into /docker-entrypoint-initdb.d.
#
# Creates a fully-schemed database in dependency order:
#   1. pgvector extension (must precede any `vector` columns)
#   2. Drizzle-generated tables + enums (from ./drizzle/*.sql, mounted at /schema)
#   3. rules vector function + HNSW index (from db/sql/rules_vector.sql, at /rules-sql)
#
# This runs ONLY on first boot. Later schema changes go through the app
# (`npm run db:push`), which is the normal Drizzle workflow.

set -e

echo "[dsa-init] Initializing DSA database schema..."

# 1. pgvector extension — required before the rule_chunks.embedding vector column.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
    CREATE EXTENSION IF NOT EXISTS vector;
EOSQL
echo "[dsa-init] pgvector extension ready."

# 2. Drizzle-generated schema (tables + enums), if migration files are mounted.
if ls /schema/*.sql 1> /dev/null 2>&1; then
    # Concatenate all migration files in lexical order; the `--> statement-breakpoint`
    # markers are harmless SQL line-comments.
    cat /schema/*.sql | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"
    echo "[dsa-init] Applied Drizzle schema ($(ls /schema/*.sql | wc -l) migration file(s))."
else
    echo "[dsa-init] WARNING: no Drizzle migration files found at /schema — tables not created."
    echo "[dsa-init]          Run 'npm run db:push' from the app to create them."
fi

# 3. Rules semantic-search function + indexes (depends on rule_pages/rule_chunks).
if [ -f /rules-sql/rules_vector.sql ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /rules-sql/rules_vector.sql
    echo "[dsa-init] Applied rules vector function + indexes."
else
    echo "[dsa-init] WARNING: rules_vector.sql not found at /rules-sql — rules search function not created."
fi

echo "[dsa-init] DSA database schema initialized successfully."
