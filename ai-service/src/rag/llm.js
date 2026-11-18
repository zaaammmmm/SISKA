const THINK_RE = /<think>[\s\S]*?<\/think>|^[\s\S]*?<\/think>/;
export function embedModel() {
    return process.env.OLLAMA_EMBED_MODEL || 'qwen3-embedding:0.6b';
}
export function chatModel() {
    return process.env.OLLAMA_CHAT_MODEL || 'qwen25c3b-8k:latest';
}
/**
 * Bandingkan nama model dengan daftar dari /api/tags. Ollama menambahkan tag `:latest`
 * bila tag tidak ditulis, jadi `foo` dan `foo:latest` dianggap sama.
 */
export function hasModel(models, wanted) {
    const norm = (n) => String(n || '').trim().toLowerCase().replace(/:latest$/, '');
    const target = norm(wanted);
    return Array.isArray(models) && models.some((m) => norm(m) === target);
}
/**
 * Parameter `think` hanya dikirim bila OLLAMA_THINK diisi (true/false). Model non-thinking
 * seperti Qwen2.5 tidak mendukung fitur ini, dan versi Ollama tertentu menolak request
 * yang memuat `think` untuk model tersebut (HTTP 400).
 */
function thinkOption() {
    const v = (process.env.OLLAMA_THINK || '').trim().toLowerCase();
    if (v === 'true' || v === '1')
        return { think: true };
    if (v === 'false' || v === '0')
        return { think: false };
    return {};
}
export function genOpts() {
    return {
        temperature: Number(process.env.LLM_TEMPERATURE ?? 0),
        seed: Number(process.env.LLM_SEED ?? 42),
        num_ctx: Number(process.env.LLM_NUM_CTX ?? 8192),
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
// Pembuatan Embedding Teks
export async function embed(baseUrl, texts) {
    const out = [];
    const bs = 16;
    for (let i = 0; i < texts.length; i += bs) {
        const batch = texts.slice(i, i + bs);
        const data = await fetchJson(`${baseUrl.replace(/\/$/, '')}/api/embed`, { model: embedModel(), input: batch }, 60_000);
        out.push(...data.embeddings);
    }
    return out.map((v) => {
        const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1e-9;
        return v.map((x) => x / norm);
    });
}
// Panggilan Chat LLM
export async function chat(baseUrl, system, user) {
    const opts = genOpts();
    const data = await fetchJson(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        model: chatModel(),
        stream: false,
        ...thinkOption(),
        // Tahan model di memori agar chat berikutnya tidak menunggu model dimuat ulang.
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || '30m',
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        options: { temperature: opts.temperature, seed: opts.seed, num_ctx: opts.num_ctx, num_predict: opts.num_predict },
    }, 120_000);
    const text = data?.message?.content ?? '';
    return text.replace(THINK_RE, '').trim();
}
// Cek Koneksi Ollama
export async function pingOllama(baseUrl) {
    if (!baseUrl)
        return { up: false, error: 'URL kosong.' };
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
            signal: ctrl.signal,
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
