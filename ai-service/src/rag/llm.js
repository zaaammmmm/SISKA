const THINK_RE = /<think>[\s\S]*?<\/think>|^[\s\S]*?<\/think>/;
export function embedModel() {
    return process.env.OLLAMA_EMBED_MODEL || 'qwen3-embedding:0.6b';
}
export function chatModel() {
    return process.env.OLLAMA_CHAT_MODEL || 'qwen3:4b-instruct';
}
export function genOpts() {
    return {
        temperature: Number(process.env.LLM_TEMPERATURE ?? 0),
        seed: Number(process.env.LLM_SEED ?? 42),
        num_ctx: Number(process.env.LLM_NUM_CTX ?? 6144),
        num_predict: Number(process.env.LLM_MAX_NEW_TOKENS ?? 350),
    };
}
async function fetchJson(url, body, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        if (!r.ok)
            throw new Error(`Ollama HTTP ${r.status}: ${await r.text()}`);
        return await r.json();
    }
    finally {
        clearTimeout(t);
    }
}
/** Embed satu atau beberapa teks. Dipakai untuk query saja (indeks dokumen sudah diembed di notebook). */
export async function embed(baseUrl, texts) {
    const out = [];
    const bs = 16;
    for (let i = 0; i < texts.length; i += bs) {
        const batch = texts.slice(i, i + bs);
        const data = await fetchJson(`${baseUrl.replace(/\/$/, '')}/api/embed`, { model: embedModel(), input: batch }, 60_000);
        out.push(...data.embeddings);
    }
    // normalisasi L2, sama seperti embed() di notebook
    return out.map((v) => {
        const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1e-9;
        return v.map((x) => x / norm);
    });
}
export async function chat(baseUrl, system, user) {
    const opts = genOpts();
    const data = await fetchJson(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        model: chatModel(),
        stream: false,
        think: false,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        options: { temperature: opts.temperature, seed: opts.seed, num_ctx: opts.num_ctx, num_predict: opts.num_predict },
    }, 120_000);
    const text = data?.message?.content ?? '';
    return text.replace(THINK_RE, '').trim();
}
export async function pingOllama(baseUrl) {
    if (!baseUrl)
        return { up: false, error: 'URL kosong.' };
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
            signal: ctrl.signal,
            // beberapa quick-tunnel (cloudflared) menolak request tanpa User-Agent / Accept
            headers: { Accept: 'application/json', 'User-Agent': 'siska-rag-test-app' },
        });
        clearTimeout(t);
        if (!r.ok) {
            const body = await r.text().catch(() => '');
            return { up: false, error: `HTTP ${r.status} dari ${baseUrl}. ${body.slice(0, 200)}` };
        }
        const data = await r.json().catch(() => null);
        const models = Array.isArray(data?.models) ? data.models.map((m) => m.name) : [];
        return { up: true, models };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const hint = /abort/i.test(msg)
            ? 'Timeout -- tunnel/Ollama tidak merespons dalam 8 detik.'
            : /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)
                ? 'Tidak bisa resolve/konek ke URL ini -- cek URL tunnel masih aktif.'
                : msg;
        return { up: false, error: hint };
    }
}
