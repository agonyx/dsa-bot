require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { buildChunkRow, buildLegacyRuleRow, buildPageRow } = require('../utils/ruleImportTransforms');

const DATA_DIR = path.join(__dirname, '../DSA5WikiScraper/dsa_scraper_v3/data');
const DOCS_FILE = path.join(DATA_DIR, 'embeddings/canonical_documents.jsonl');
const CHUNKS_FILE = path.join(DATA_DIR, 'embeddings/chunks.jsonl');
const EXPORT_SUMMARY_FILE = path.join(DATA_DIR, 'embeddings/export_summary.json');
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseArgs(argv) {
    const args = {
        dryRun: false,
        includeUnresolved: false,
        legacyOnly: false,
        batchSize: 100,
        embeddingBatchSize: 50,
        docsFile: DOCS_FILE,
        chunksFile: CHUNKS_FILE,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg === '--include-unresolved') {
            args.includeUnresolved = true;
        } else if (arg === '--legacy-only') {
            args.legacyOnly = true;
        } else if (arg === '--batch-size' && argv[index + 1]) {
            args.batchSize = Number.parseInt(argv[index + 1], 10);
            index += 1;
        } else if (arg === '--embedding-batch-size' && argv[index + 1]) {
            args.embeddingBatchSize = Number.parseInt(argv[index + 1], 10);
            index += 1;
        } else if (arg === '--docs-file' && argv[index + 1]) {
            args.docsFile = path.resolve(argv[index + 1]);
            index += 1;
        } else if (arg === '--chunks-file' && argv[index + 1]) {
            args.chunksFile = path.resolve(argv[index + 1]);
            index += 1;
        }
    }

    return args;
}

async function readJsonl(filePath) {
    const rows = [];
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) {
            continue;
        }

        rows.push(JSON.parse(line));
    }

    return rows;
}

function readExportSummary() {
    return JSON.parse(fs.readFileSync(EXPORT_SUMMARY_FILE, 'utf8'));
}

async function tableExists(tableName) {
    const { error } = await supabase.from(tableName).select('*').limit(1);

    return !error || error.code !== 'PGRST205';
}

async function generateEmbeddings(texts, model = DEFAULT_EMBEDDING_MODEL) {
    const cleaned = texts.map(text =>
        String(text || '')
            .replace(/\n+/g, ' ')
            .trim()
            .substring(0, 8000)
    );
    const response = await openai.embeddings.create({
        model,
        input: cleaned,
        dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    });

    return response.data.map(item => item.embedding);
}

async function upsertBatch(tableName, rows, onConflict) {
    if (!rows.length) {
        return;
    }

    const { error } = await supabase.from(tableName).upsert(rows, {
        onConflict,
        ignoreDuplicates: false,
    });

    if (error) {
        throw error;
    }
}

function buildChunkCounts(chunks) {
    const counts = new Map();

    for (const chunk of chunks) {
        counts.set(chunk.doc_id, (counts.get(chunk.doc_id) || 0) + 1);
    }

    return counts;
}

function buildTitleCounts(docs) {
    const counts = new Map();

    for (const doc of docs) {
        const title = String(doc.title || doc.doc_id || 'Untitled Rule').trim();
        counts.set(title, (counts.get(title) || 0) + 1);
    }

    return counts;
}

function chunkArray(items, size) {
    const chunks = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

async function importStructured(docs, chunks, options, sourceSnapshotAt) {
    const pageRows = docs.map(doc => buildPageRow(doc, { sourceSnapshotAt }));

    if (options.dryRun) {
        return {
            mode: 'structured',
            pageCount: pageRows.length,
            chunkCount: chunks.length,
        };
    }

    for (const batch of chunkArray(pageRows, options.batchSize)) {
        await upsertBatch('rule_pages', batch, 'doc_id');
    }

    const docIds = pageRows.map(row => row.doc_id);
    const pageIdMap = new Map();

    for (const batch of chunkArray(docIds, options.batchSize)) {
        const { data, error } = await supabase.from('rule_pages').select('id, doc_id, version').in('doc_id', batch);

        if (error) {
            throw error;
        }

        for (const row of data || []) {
            pageIdMap.set(row.doc_id, { id: row.id, version: row.version || 1 });
        }
    }

    for (const batch of chunkArray(chunks, options.embeddingBatchSize)) {
        const embeddings = await generateEmbeddings(batch.map(row => row.chunk_text));
        const chunkRows = batch.map((chunk, index) => {
            const page = pageIdMap.get(chunk.doc_id);

            if (!page) {
                throw new Error(`Missing page row for doc_id ${chunk.doc_id}`);
            }

            return {
                ...buildChunkRow(chunk, page.id, { version: page.version || 1 }),
                embedding: embeddings[index],
                embedding_model: DEFAULT_EMBEDDING_MODEL,
                embedded_at: new Date().toISOString(),
            };
        });

        await upsertBatch('rule_chunks', chunkRows, 'chunk_id');
    }

    return {
        mode: 'structured',
        pageCount: pageRows.length,
        chunkCount: chunks.length,
    };
}

async function importLegacy(docs, chunks, options, sourceSnapshotAt) {
    const docById = new Map(docs.map(doc => [doc.doc_id, doc]));
    const chunkCounts = buildChunkCounts(chunks);
    const titleCounts = buildTitleCounts(docs);

    if (options.dryRun) {
        return {
            mode: 'legacy',
            pageCount: docs.length,
            chunkCount: chunks.length,
        };
    }

    for (const batch of chunkArray(chunks, options.embeddingBatchSize)) {
        const embeddings = await generateEmbeddings(batch.map(row => row.chunk_text));

        for (let index = 0; index < batch.length; index += 1) {
            const chunk = batch[index];
            const doc = docById.get(chunk.doc_id);

            if (!doc) {
                throw new Error(`Missing canonical document for chunk ${chunk.chunk_id}`);
            }

            const row = buildLegacyRuleRow(doc, chunk, {
                totalChunks: chunkCounts.get(chunk.doc_id) || 1,
                duplicateTitleCount: titleCounts.get(String(doc.title || doc.doc_id || 'Untitled Rule').trim()) || 1,
                sourceSnapshotAt,
            });

            const { error } = await supabase.rpc('upsert_rule', {
                p_title: row.title,
                p_content: row.content,
                p_embedding: embeddings[index],
                p_category: row.category,
                p_source_url: row.sourceUrl,
                p_metadata: row.metadata,
            });

            if (error) {
                throw error;
            }
        }
    }

    return {
        mode: 'legacy',
        pageCount: docs.length,
        chunkCount: chunks.length,
    };
}

async function main() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }

    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY must be set');
    }

    const options = parseArgs(process.argv.slice(2));
    const exportSummary = readExportSummary();
    const sourceSnapshotAt = exportSummary.generated_at || new Date().toISOString();

    const [allDocs, allChunks] = await Promise.all([readJsonl(options.docsFile), readJsonl(options.chunksFile)]);

    const docs = options.includeUnresolved ? allDocs : allDocs.filter(doc => !doc.is_unresolved);
    const allowedDocIds = new Set(docs.map(doc => doc.doc_id));
    const chunks = options.includeUnresolved
        ? allChunks
        : allChunks.filter(chunk => allowedDocIds.has(chunk.doc_id) && !chunk.is_unresolved);

    const hasRulePages = await tableExists('rule_pages');
    const hasRuleChunks = await tableExists('rule_chunks');
    const mode = !options.legacyOnly && hasRulePages && hasRuleChunks ? 'structured' : 'legacy';

    const result =
        mode === 'structured'
            ? await importStructured(docs, chunks, options, sourceSnapshotAt)
            : await importLegacy(docs, chunks, options, sourceSnapshotAt);

    console.log(
        JSON.stringify(
            {
                ...result,
                dryRun: options.dryRun,
                includeUnresolved: options.includeUnresolved,
                expectedDocCount: exportSummary.doc_count,
                expectedChunkCount: exportSummary.chunk_count,
                expectedUnresolvedDocCount: exportSummary.unresolved_doc_count,
            },
            null,
            2
        )
    );
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
