require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY // Use service key for writes
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DOCS_DIR = path.join(__dirname, '../docs');

// Categories based on filename patterns
const CATEGORY_MAP = {
    conditions: 'condition',
    status: 'status',
    wound: 'combat',
    maneuver: 'maneuver',
    spell: 'spell',
    talent: 'talent',
    combat: 'combat',
};

function detectCategory(filename) {
    const name = filename.toLowerCase();
    for (const [key, category] of Object.entries(CATEGORY_MAP)) {
        if (name.includes(key)) return category;
    }
    return 'general';
}

function extractSourceUrl(content) {
    const match = content.match(/\*Source: (https?:\/\/[^\s]+)/);
    return match ? match[1] : null;
}

function chunkContent(content, maxTokens = 1500) {
    // Split by sections (## headings)
    const sections = content.split(/\n## /);
    const chunks = [];

    let currentChunk = '';
    let currentTokens = 0;

    for (const section of sections) {
        const sectionText = section.startsWith('#') ? section : '## ' + section;
        const sectionTokens = sectionText.split(/\s+/).length * 1.3; // Rough estimate

        if (currentTokens + sectionTokens > maxTokens && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = sectionText;
            currentTokens = sectionTokens;
        } else {
            currentChunk += '\n' + sectionText;
            currentTokens += sectionTokens;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 100); // Skip tiny chunks
}

function extractTitle(chunk, filename) {
    // Try to get first heading
    const headingMatch = chunk.match(/^#+ (.+)/m);
    if (headingMatch) return headingMatch[1];
    return path.basename(filename, '.md');
}

async function generateEmbedding(text) {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        dimensions: 1536,
        input: text.replace(/\n+/g, ' ').substring(0, 8000), // Token limit
    });
    return response.data[0].embedding;
}

async function upsertRule(title, content, embedding, category, sourceUrl, metadata) {
    const { data, error } = await supabase.rpc('upsert_rule', {
        p_title: title,
        p_content: content,
        p_embedding: embedding,
        p_category: category,
        p_source_url: sourceUrl,
        p_metadata: metadata,
    });

    if (error) throw error;
    return data;
}

async function processFile(filepath) {
    const filename = path.basename(filepath);
    console.log(`Processing: ${filename}`);

    const content = await fs.readFile(filepath, 'utf-8');
    const category = detectCategory(filename);
    const sourceUrl = extractSourceUrl(content);
    const chunks = chunkContent(content);

    console.log(`  Found ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const title = extractTitle(chunk, filename) + (chunks.length > 1 ? ` (part ${i + 1})` : '');

        console.log(`  Embedding chunk ${i + 1}/${chunks.length}...`);
        const embedding = await generateEmbedding(chunk);

        await upsertRule(title, chunk, embedding, category, sourceUrl, {
            source_file: filename,
            chunk_index: i,
            total_chunks: chunks.length,
        });

        // Rate limit
        await new Promise(r => setTimeout(r, 100));
    }
}

async function main() {
    if (!process.env.OPENAI_API_KEY) {
        console.error('ERROR: OPENAI_API_KEY not set in .env');
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
        console.error('ERROR: SUPABASE_SERVICE_KEY not set in .env (need service role for writes)');
        process.exit(1);
    }

    const files = await fs.readdir(DOCS_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    console.log(`Found ${mdFiles.length} markdown files to process\n`);

    for (const file of mdFiles) {
        await processFile(path.join(DOCS_DIR, file));
    }

    console.log('\nDone!');
}

main().catch(console.error);
