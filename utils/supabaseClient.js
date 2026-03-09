const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("FATAL: SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

async function callEdgeFunction(functionName, payload, method = 'POST') {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${functionName}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.error || `Edge function ${functionName} failed`);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return { data, status: response.status };
}

module.exports = {
    supabase,
    callEdgeFunction,
    SUPABASE_URL,
    SUPABASE_FUNCTIONS_URL
};
