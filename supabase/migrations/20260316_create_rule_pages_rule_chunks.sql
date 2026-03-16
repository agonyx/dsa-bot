create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rule_pages (
    id uuid primary key default gen_random_uuid(),
    doc_id text not null unique,
    source_item_id text,
    source_url text not null unique,
    url_hash text not null,
    canonical_slug text not null unique,
    title text not null,
    category text not null,
    resolved_category text,
    subcategory text,
    page_state text,
    is_unresolved boolean not null default false,
    resolution_confidence text,
    normalized_content text not null,
    content_hash text not null,
    parser_version text not null,
    scraper_version text not null,
    source_snapshot_at timestamptz,
    version integer not null default 1,
    metadata jsonb not null default '{}'::jsonb,
    last_seen_at timestamptz not null default now(),
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.rule_chunks (
    id uuid primary key default gen_random_uuid(),
    chunk_id text not null unique,
    page_id uuid not null references public.rule_pages(id) on delete cascade,
    version integer not null,
    chunk_index integer not null,
    title text,
    category text not null,
    resolved_category text,
    heading text,
    chunk_text text not null,
    char_start integer,
    char_end integer,
    embedding extensions.vector(1536),
    embedding_model text,
    embedded_at timestamptz,
    is_unresolved boolean not null default false,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    is_active boolean not null default true,
    unique (page_id, version, chunk_index)
);

create index if not exists rule_chunks_page_id_idx on public.rule_chunks (page_id);
create index if not exists rule_chunks_active_idx on public.rule_chunks (is_active);
create index if not exists rule_chunks_embedding_idx
    on public.rule_chunks
    using hnsw (embedding vector_cosine_ops)
    where embedding is not null;

create or replace function public.match_rule_chunks (
    query_embedding extensions.vector(1536),
    match_threshold float,
    match_count int,
    filter_category text default null,
    include_unresolved boolean default false
)
returns table (
    chunk_id text,
    page_id uuid,
    doc_id text,
    title text,
    category text,
    resolved_category text,
    source_url text,
    chunk_text text,
    metadata jsonb,
    similarity float
)
language sql
security invoker
set search_path = ''
as $$
    select
        rc.chunk_id,
        rp.id as page_id,
        rp.doc_id,
        rp.title,
        rp.category,
        rp.resolved_category,
        rp.source_url,
        rc.chunk_text,
        rc.metadata,
        1 - (rc.embedding <=> query_embedding) as similarity
    from public.rule_chunks rc
    join public.rule_pages rp on rp.id = rc.page_id
    where rc.is_active = true
      and rp.deleted_at is null
      and rc.embedding is not null
      and (filter_category is null or rp.category = filter_category)
      and (include_unresolved = true or rp.is_unresolved = false)
      and 1 - (rc.embedding <=> query_embedding) >= match_threshold
    order by rc.embedding <=> query_embedding
    limit match_count;
$$;

grant select on public.rule_pages to anon, authenticated;
grant select on public.rule_chunks to anon, authenticated;
grant execute on function public.match_rule_chunks(extensions.vector, float, int, text, boolean) to anon, authenticated;
