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

module.exports = {
    searchRules,
    getRulesByCategory,
    getRuleByTitle,
};
