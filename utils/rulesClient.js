/**
 * Rule knowledge base utilities using Supabase pgvector + OpenAI embeddings.
 * Supports the future `rule_pages` + `rule_chunks` schema and the current
 * live fallback schema based on `rule_documents`.
 */

const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isMissingDbObject(error) {
    return error && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code);
}

function normalizeSearchResult(result) {
    const content = result.chunk_text || result.content || '';

    return {
        ...result,
        page_id: result.page_id || null,
        doc_id: result.doc_id || result.metadata?.doc_id || null,
        resolved_category: result.resolved_category || result.metadata?.resolved_category || result.category,
        content,
        chunk_text: content,
    };
}

function normalizePageResult(result) {
    if (!result) {
        return null;
    }

    if (Object.prototype.hasOwnProperty.call(result, 'content')) {
        return result;
    }

    return {
        ...result,
        content: result.normalized_content || '',
    };
}

async function createQueryEmbedding(query) {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: query.replace(/\n+/g, ' ').substring(0, 8000),
        dimensions: 1536,
    });

    return response.data[0].embedding;
}

/**
 * Search the rules knowledge base semantically.
 * @param {string} query - Natural language query
 * @param {Object} options - Search options
 * @param {string} [options.category] - Filter by category
 * @param {number} [options.threshold=0.7] - Minimum similarity threshold
 * @param {number} [options.limit=3] - Maximum results
 * @param {boolean} [options.includeUnresolved=false] - Include unresolved scraper docs
 * @returns {Promise<Array>} Matching rules with similarity scores
 */
async function searchRules(query, options = {}) {
    if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY not set, rules search unavailable');
        return [];
    }

    const { category = null, threshold = 0.5, limit = 3, includeUnresolved = false } = options;
    const expandedLimit = includeUnresolved ? limit : Math.max(limit * 3, limit + 5);

    try {
        const queryEmbedding = await createQueryEmbedding(query);

        const structuredSearch = await supabase.rpc('match_rule_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: expandedLimit,
            filter_category: category,
            include_unresolved: includeUnresolved,
        });

        if (!structuredSearch.error) {
            return (structuredSearch.data || []).map(normalizeSearchResult).slice(0, limit);
        }

        if (!isMissingDbObject(structuredSearch.error)) {
            throw structuredSearch.error;
        }

        const legacySearch = await supabase.rpc('search_rules', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: expandedLimit,
            filter_category: category,
        });

        if (legacySearch.error) {
            throw legacySearch.error;
        }

        const filtered = includeUnresolved
            ? legacySearch.data || []
            : (legacySearch.data || []).filter(result => !result.metadata?.is_unresolved);

        return filtered.map(normalizeSearchResult).slice(0, limit);
    } catch (error) {
        console.error('Error searching rules:', error.message);
        return [];
    }
}

/**
 * Get rules for a specific category.
 * Prefers the new page table and falls back to the legacy document table.
 * @param {string} category - Category to fetch
 * @param {number} [limit=10] - Maximum results
 * @returns {Promise<Array>} Rules in category
 */
async function getRulesByCategory(category, limit = 10) {
    let response = await supabase
        .from('rule_pages')
        .select('id, doc_id, title, normalized_content, source_url, metadata')
        .eq('category', category)
        .is('deleted_at', null)
        .order('title')
        .limit(limit);

    if (response.error && isMissingDbObject(response.error)) {
        response = await supabase
            .from('rule_documents')
            .select('id, title, content, source_url, metadata')
            .eq('category', category)
            .order('title')
            .limit(limit);
    }

    if (response.error) {
        console.error('Error fetching rules by category:', response.error.message);
        return [];
    }

    return (response.data || []).map(normalizePageResult);
}

/**
 * Quick lookup for a specific rule by title.
 * Prefers the new page table and falls back to the legacy document table.
 * @param {string} title - Rule title to find
 * @returns {Promise<Object|null>} Rule document or null
 */
async function getRuleByTitle(title) {
    let response = await supabase
        .from('rule_pages')
        .select('id, doc_id, title, normalized_content, category, resolved_category, source_url, metadata')
        .ilike('title', `%${title}%`)
        .is('deleted_at', null)
        .limit(1)
        .single();

    if (response.error && isMissingDbObject(response.error)) {
        response = await supabase
            .from('rule_documents')
            .select('id, title, content, category, source_url, metadata')
            .ilike('title', `%${title}%`)
            .limit(1)
            .single();
    }

    if (response.error) {
        if (response.error.code !== 'PGRST116') {
            console.error('Error fetching rule by title:', response.error.message);
        }
        return null;
    }

    return normalizePageResult(response.data);
}

/**
 * Get autocomplete-ready page title records from rule_pages.
 * Returns lightweight rows with normalized lowercase fields for fast filtering.
 * Falls back to legacy rule_documents table if rule_pages is unavailable.
 * @returns {Promise<Array<{doc_id: string, title: string, title_lower: string, category: string, resolved_category: string|null, source_url: string}>>}
 */
async function getRulePageTitles() {
    let response = await supabase
        .from('rule_pages')
        .select('doc_id, title, category, resolved_category, source_url')
        .is('deleted_at', null)
        .order('title');

    if (response.error && isMissingDbObject(response.error)) {
        response = await supabase
            .from('rule_documents')
            .select('id, title, category, source_url, metadata')
            .order('title');
    }

    if (response.error) {
        throw response.error;
    }

    // Normalize to consistent shape with lowercase fields for fast filtering
    return (response.data || []).map(row => ({
        doc_id: row.doc_id || row.id?.toString() || '',
        title: row.title || '',
        title_lower: (row.title || '').toLowerCase(),
        category: row.category || '',
        resolved_category: row.resolved_category || row.metadata?.resolved_category || null,
        source_url: row.source_url || '',
    }));
}

/**
 * Ranked page-title lookup for exact, prefix, and contains matches.
 * Uses in-memory cache for fast filtering without database queries.
 * @param {string} query - Title or partial title to search
 * @param {Array} cache - Array of page title records (from client.rulePageTitleCache)
 * @param {Object} options - Lookup options
 * @param {string} [options.category] - Filter by category
 * @param {number} [options.limit=3] - Maximum results to return (up to 25 for autocomplete)
 * @returns {Array<{doc_id: string, title: string, title_lower: string, category: string, resolved_category: string|null, source_url: string, match_type: 'exact'|'prefix'|'contains'}>}
 */
function getRankedTitleMatches(query, cache = [], options = {}) {
    if (!query || !cache.length) {
        return [];
    }

    const queryLower = query.toLowerCase();
    const { category, limit = 3 } = options;

    // Filter by category if provided
    const filteredCache = category ? cache.filter(page => page.category === category) : cache;

    const exactMatches = [];
    const prefixMatches = [];
    const containsMatches = [];
    const seenDocIds = new Set();

    for (const page of filteredCache) {
        // Skip duplicates
        if (seenDocIds.has(page.doc_id)) {
            continue;
        }

        const titleLower = page.title_lower;

        if (titleLower === queryLower) {
            exactMatches.push({ ...page, match_type: 'exact' });
            seenDocIds.add(page.doc_id);
        } else if (titleLower.startsWith(queryLower)) {
            prefixMatches.push({ ...page, match_type: 'prefix' });
            seenDocIds.add(page.doc_id);
        } else if (titleLower.includes(queryLower)) {
            containsMatches.push({ ...page, match_type: 'contains' });
            seenDocIds.add(page.doc_id);
        }
    }

    // Combine ranked results: exact first, then prefix, then contains
    const ranked = [...exactMatches, ...prefixMatches, ...containsMatches];
    return ranked.slice(0, limit);
}

/**
 * Deduplicate semantic chunk results by page identifier.
 * Keeps the first (highest similarity) chunk for each unique page.
 * @param {Array} semanticResults - Array of semantic search results
 * @param {number} limit - Maximum results to return after deduplication
 * @returns {Array} Deduplicated semantic results with match_type annotation
 */
function deduplicateSemanticResults(semanticResults, limit) {
    const seenPageIds = new Set();
    const seenDocIds = new Set();
    const deduped = [];

    for (const result of semanticResults) {
        const docKey = result.doc_id;

        // Skip if we've already seen this page
        if ((result.page_id && seenPageIds.has(result.page_id)) || seenDocIds.has(docKey)) {
            continue;
        }

        // Track this page
        if (result.page_id) {
            seenPageIds.add(result.page_id);
        }
        if (docKey) {
            seenDocIds.add(docKey);
        }

        // Add with match_type annotation
        deduped.push({
            ...result,
            match_type: 'semantic',
        });

        if (deduped.length >= limit) {
            break;
        }
    }

    return deduped;
}

/**
 * Fetch full page content for a doc_id from rule_pages.
 * Cache rows only have metadata, not content fields.
 * @param {string} docId - The doc_id to fetch
 * @returns {Promise<Object|null>} Page with content or null
 */
async function fetchPageContent(docId) {
    const response = await supabase
        .from('rule_pages')
        .select('doc_id, title, normalized_content, category, resolved_category, source_url, metadata')
        .eq('doc_id', docId)
        .single();

    if (response.error) {
        return null;
    }

    return normalizePageResult(response.data);
}

/**
 * Hybrid search orchestrator that runs exact title lookup and semantic search in parallel.
 * Exact matches are prioritized, semantic results are deduplicated by page.
 * @param {string} query - Search query (natural language or partial title)
 * @param {Array} cache - Array of page title records (from client.rulePageTitleCache)
 * @param {Object} options - Search options
 * @param {string} [options.category] - Filter by category
 * @param {number} [options.limit=3] - Maximum semantic results
 * @param {number} [options.threshold=0.5] - Semantic similarity threshold
 * @param {boolean} [options.includeUnresolved=false] - Include unresolved documents
 * @returns {Promise<{selectedPage: Object|null, exactMatches: Array, semanticMatches: Array}>}
 */
async function hybridSearch(query, cache = [], options = {}) {
    const { category = null, limit = 3, threshold = 0.5, includeUnresolved = false } = options;

    // Run exact title lookup and semantic search in parallel
    const [exactMatches, semanticResults] = await Promise.all([
        // Exact/prefix/contains title matches are synchronous
        Promise.resolve(getRankedTitleMatches(query, cache, { category })),
        // Semantic search is async
        searchRules(query, { category, threshold, limit: limit * 2, includeUnresolved }),
    ]);

    // Deduplicate semantic results by page
    const dedupedSemantic = deduplicateSemanticResults(semanticResults, limit);

    // Filter semantic matches to exclude pages already in exact matches
    const exactDocIds = new Set(exactMatches.map(m => m.doc_id));
    const filteredSemantic = dedupedSemantic.filter(m => !exactDocIds.has(m.doc_id));

    // Determine the selected page
    // Priority: first exact match > first semantic match > null
    let selectedPage = null;

    if (exactMatches.length > 0) {
        // Fetch full content for exact match (cache rows lack content fields)
        const fullPage = await fetchPageContent(exactMatches[0].doc_id);
        // Preserve match_type from the exact match
        selectedPage = fullPage ? { ...fullPage, match_type: 'exact' } : { ...exactMatches[0] };
    } else if (filteredSemantic.length > 0) {
        // Fall back to the first semantic match
        selectedPage = { ...filteredSemantic[0] };
    }

    return {
        selectedPage,
        exactMatches: exactMatches.slice(0, 3),
        semanticMatches: filteredSemantic,
    };
}

module.exports = {
    searchRules,
    getRulesByCategory,
    getRuleByTitle,
    getRulePageTitles,
    getRankedTitleMatches,
    hybridSearch,
    fetchPageContent,
};
