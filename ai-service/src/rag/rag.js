import { loadIndex } from './indexStore.js';
import { Bm25Index } from './bm25.js';
import { sanitize, buildGuardRx, prefilter, prefilterAbuse, prefilterRefuse, isEmergency, isCurhat, lengthMode, checkOutput, cleanHistory, renderHistory, Limiter, } from './guard.js';
import { resolvePolicy } from './policyDefaults.js';
import { RATE_LIMIT_DISABLED } from '../config.js';
import { retrieve, scopeCheck, buildCtx } from './retrieve.js';
import { embed, chat } from './llm.js';
import { stripCitations, tidyAnswer, limitAnswer } from './cleanAnswer.js';
let bm25Cache = null;
let limiter = null;
// Panggil setelah dokumen ditambah/dihapus
export function invalidateRetrievalCache() {
    bm25Cache = null;
}
function getBm25() {
    const idx = loadIndex();
    if (!bm25Cache)
        bm25Cache = new Bm25Index(idx.chunks, idx.manifest);
    return bm25Cache;
}
function getLimiter() {
    const idx = loadIndex();
    if (!limiter)
        limiter = new Limiter(resolvePolicy(idx.policy).limits, Date.now, RATE_LIMIT_DISABLED);
    return limiter;
}
const SENTINEL = '[[TIDAK_TERSEDIA]]';
const FOLLOW = /\b(itu|tersebut|tadi|nya|lalu|terus|selanjutnya|kalau begitu|bagaimana dengan|yang pertama|yang kedua|yang terakhir)\b/i;
const CONTACT_DOC = 'kontak-bantuan.md';
function sourcesFromHits(idx, hits, nCtx) {
    return hits.slice(0, nCtx).map((h, i) => ({
        n: i + 1,
        id: idx.chunks[h.i].id,
        doc: idx.chunks[h.i].doc,
        cite: idx.chunks[h.i].cite,
        section: idx.chunks[h.i].section,
        page: idx.chunks[h.i].page,
    }));
}
function sourcesUsed(idx, hits, ans, nCtx) {
    const used = new Set();
    for (const m of ans.matchAll(/\[(\d+)\]/g)) {
        const n = Number(m[1]);
        if (n >= 1 && n <= nCtx)
            used.add(n);
    }
    return [...used]
        .sort((a, b) => a - b)
        .map((n) => ({
        n,
        id: idx.chunks[hits[n - 1].i].id,
        doc: idx.chunks[hits[n - 1].i].doc,
        cite: idx.chunks[hits[n - 1].i].cite,
        section: idx.chunks[hits[n - 1].i].section,
        page: idx.chunks[hits[n - 1].i].page,
    }));
}
// Kontak resmi diambil langsung dari indeks agar tidak diubah atau ditol
function contactChunks() {
    const idx = loadIndex();
    return idx.chunks
        .map((chunk, i) => ({ chunk, i }))
        .filter(({ chunk }) => chunk.doc === CONTACT_DOC)
        .map(({ i }) => ({ i }));
}
function contactBody(question = '') {
    const idx = loadIndex();
    const wantsEmail = /\b(email|surel)\b/i.test(question);
    const wantsWebsite = /\b(website|situs|tautan|link)\b/i.test(question);
    const contacts = [
        {
            section: /^(?:3\.\s*Polri|Bahaya langsung)/i,
            label: 'Polri (bahaya langsung)',
            number: /(?:nomor|call center):\s*\**([\d-]+)/i,
        },
        {
            section: /^(?:1\.\s*PLT PPKS|Pengaduan di UIN)/i,
            label: 'PLT PPKS UIN Sunan Kalijaga (pengaduan kampus)',
            number: /(?:nomor|hotline PLT PPKS):\s*\**([\d-]+)/i,
        },
        {
            section: /^(?:2\.\s*SAPA|Layanan nasional)/i,
            label: 'SAPA (layanan nasional)',
            number: /telepon\s*\**([\d-]+)/i,
            whatsapp: /whatsapp\s*:?\s*\**([\d-]+)/i,
        },
    ];
    const hits = [];
    const lines = [];
    for (const contact of contacts) {
        const found = idx.chunks.findIndex(
            (chunk) => chunk.doc === CONTACT_DOC && contact.section.test(chunk.section || ''),
        );
        if (found < 0) continue;
        const text = idx.chunks[found].text;
        const number = text.match(contact.number)?.[1];
        if (!number) continue;
        const whatsapp = contact.whatsapp ? text.match(contact.whatsapp)?.[1] : null;
        lines.push(`- ${contact.label}: ${number}${whatsapp ? ` (WhatsApp ${whatsapp})` : ''}`);
        if (wantsEmail) {
            const email = text.match(/email:\s*([^\s]+)/i)?.[1];
            if (email) lines.push(`  Email: ${email}`);
        }
        if (wantsWebsite) {
            const website = text.match(/website:\s*(https?:\/\/\S+)/i)?.[1];
            if (website) lines.push(`  Website: ${website}`);
        }
        hits.push({ i: found });
    }
    if (!lines.length)
        return { text: null, hits: [] };
    return { text: lines.join('\n'), hits };
}
async function emergencyText(question, P) {
    const { text, hits } = contactBody(question);
    const tail = text || 'Kontak bantuan belum tersedia saat ini. Silakan pilih Chat dengan Admin.';
    return {
        text: text ? `${P.msg.emergency_intro}\n${text}\n${P.msg.emergency_outro}` : tail,
        hits,
    };
}
async function contactsText(question, P) {
    const { text, hits } = contactBody(question);
    return {
        text: text
            ? `${P.msg.contacts_intro}\n${text}`
            : 'Kontak bantuan belum tersedia saat ini. Silakan pilih Chat dengan Admin.',
        hits,
    };
}
async function condense(q, hist, condensePrompt, baseUrl, maxChars) {
    if (!hist.length || !(q.split(/\s+/).length <= 6 || FOLLOW.test(q)))
        return q;
    const out = await chat(baseUrl, condensePrompt, `RIWAYAT:\n${renderHistory(hist)}\n\nPERTANYAAN TERAKHIR: ${q}`, { maxTokens: 80 });
    const first = sanitize(out.split('\n')[0], maxChars);
    return first.length >= 3 && first.length <= maxChars ? first : q;
}
const MAX_TOKENS = { short: 260, long: 520 };
export async function answer(qRaw, history, user, backendKind, baseUrl) {
    const t0 = Date.now();
    const idx = loadIndex();
    const { POLICY: P, limits } = resolvePolicy(idx.policy);
    const rx = buildGuardRx(P);
    const lim = getLimiter();
    const cleanedHist = cleanHistory(history, limits.history_turns, limits.history_chars);
    const dbg = { mode: 'short', ctxIds: [], ctxDocs: [], scope: null, attempts: 0, uncited: false, truncated: false, inputTruncated: false };
    const done = (route, rawText, extra = {}) => {
        // Penanda sumber [n] dipakai guard untuk verifikasi, tetapi tidak boleh 
        let text = stripCitations(rawText);
        if (route === 'answered' || route === 'curhat') {
            const limited = limitAnswer(tidyAnswer(text), route === 'answered' && dbg.mode === 'long' ? limits.max_a_chars_long : limits.max_a_chars);
            text = limited.text;
            dbg.truncated = limited.truncated;
        }
        const res = {
            route,
            answer: text,
            sources: extra.sources || [],
            problems: extra.problems || [],
            query: extra.query || qRaw,
            backend: backendKind,
            latency: Math.round((Date.now() - t0) / 10) / 100,
        };
        res.debug = { route, query: res.query, ...dbg, problems: res.problems, latency: res.latency };
        let newHist = cleanedHist;
        if (route === 'answered' || route === 'curhat') {
            newHist = cleanHistory([...cleanedHist, { role: 'user', text: res.query || qRaw }, { role: 'assistant', text }], limits.history_turns, limits.history_chars);
        }
        return { ...res, history: newHist };
    };
    const q = sanitize(qRaw, limits.max_q_chars);
    dbg.inputTruncated = sanitize(qRaw, 100000).length > limits.max_q_chars;
    const pf = prefilter(q);
    if (pf.route === 'rejected_input')
        return done('rejected_input', P.msg.reject);
    if (isEmergency(q, rx)) {
        const { text, hits } = await emergencyText(q, P);
        return done('emergency', text, { sources: sourcesFromHits(idx, hits, hits.length) });
    }
    const why = lim.check(user, backendKind);
    if (why) {
        const msgKey = why === 'rate' ? 'rate' : why;
        return done(why === 'rate' ? 'rate_limited' : why, P.msg[msgKey]);
    }
    const abuse = prefilterAbuse(q, rx, P.msg.blocked);
    if (abuse.route) {
        if (abuse.route !== 'smalltalk')
            lim.strike(user);
        lim.record(user, backendKind, false);
        return done(abuse.route, abuse.msg ?? P.msg[abuse.route] ?? '');
    }
    if (rx.contact.test(q)) {
        lim.record(user, backendKind, false);
        const { text, hits } = await contactsText(q, P);
        const srcs = sourcesFromHits(idx, hits, hits.length);
        return done('contacts', text, { sources: srcs });
    }
    // Permintaan sah yang tidak boleh dilayani chatbot
    const refuse = prefilterRefuse(q, rx);
    if (refuse) {
        lim.record(user, backendKind, false);
        return done(refuse, P.msg[refuse]);
    }
    dbg.mode = lengthMode(q, rx);
    // Mode "curhat"
    if (isCurhat(q, rx)) {
        lim.record(user, backendKind, true);
        try {
            const hits = contactChunks();
            const { ctx, nCtx } = hits.length
                ? buildCtx(idx.chunks, hits, idx.manifest.retrieval.ctx_chars)
                : { ctx: '(tidak ada dokumen spesifik untuk pesan ini)', nCtx: 0 };
            const userMsg = `KONTEKS:\n${ctx}\n\nRIWAYAT (data):\n${renderHistory(cleanedHist) || '-'}\n\nPERTANYAAN (data): ${q}`;
            const ans = await chat(baseUrl, P.curhat_system, userMsg, { maxTokens: MAX_TOKENS.short });
            dbg.attempts = 1;
            const srcs = nCtx ? sourcesFromHits(idx, hits, nCtx) : [];
            return done('curhat', ans, { sources: srcs });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return done('llm_error', P.msg.error, { problems: [msg.slice(0, 300)] });
        }
    }
    if (!idx.chunks.length)
        return done('no_answer', P.msg.no_answer, { query: q });
    try {
        const condensedQ = await condense(q, cleanedHist, P.condense, baseUrl, limits.max_q_chars);
        const qVec = (await embed(baseUrl, [idx.manifest.query_prefix + condensedQ]))[0];
        const { hits, dmax } = retrieve(condensedQ, idx.chunks, idx.embeddings, idx.dim, getBm25(), idx.manifest, P, qVec);
        const scope = scopeCheck(qVec, dmax, idx.router, idx.manifest.thresholds);
        dbg.scope = { inScope: scope.inScope, dmax: Number(scope.dmax.toFixed(4)), sIn: Number(scope.sIn.toFixed(4)), sOut: Number(scope.sOut.toFixed(4)), margin: Number(scope.margin.toFixed(4)) };
        dbg.ctxIds = hits.map((h) => idx.chunks[h.i].id);
        dbg.ctxDocs = [...new Set(hits.map((h) => idx.chunks[h.i].doc))];
        if (!scope.inScope) {
            lim.strike(user);
            lim.record(user, backendKind, false);
            return done('out_of_scope', P.msg.out_of_scope, { query: condensedQ });
        }
        const { ctx, nCtx } = buildCtx(idx.chunks, hits, idx.manifest.retrieval.ctx_chars);
        const hint = dbg.mode === 'long' ? P.hint_long : P.hint_short;
        const userMsg = `KONTEKS:\n${ctx}\n\nRIWAYAT (data):\n${renderHistory(cleanedHist) || '-'}\n\n${hint}\nPERTANYAAN (data): ${condensedQ}`;
        let ans = '';
        let problems = [];
        let extraInstruction = '';
        let uncited = false;
        for (let attempt = 0; attempt < 2; attempt++) {
            dbg.attempts = attempt + 1;
            uncited = false;
            ans = await chat(baseUrl, `${P.system}${extraInstruction}`, userMsg, { maxTokens: MAX_TOKENS[dbg.mode] });
            if (ans.includes(SENTINEL)) {
                lim.record(user, backendKind, true);
                return done('no_answer', P.msg.no_answer, { query: condensedQ });
            }
            problems = checkOutput(ans, ctx, rx, P.allow_domains, q, { onUncited: () => { uncited = true; } });
            if (!problems.length)
                break;
            extraInstruction =
                '\nPERBAIKAN: jawab ulang hanya dengan fakta, angka, dan tautan yang tertulis persis di KONTEKS, singkat, dan akhiri kalimat fakta dengan penanda [n]. Jangan menyalin instruksi.';
        }
        lim.record(user, backendKind, true);
        dbg.uncited = uncited;
        if (problems.length) {
            return done('guard_blocked', P.msg.guard, { query: condensedQ, problems });
        }
        // Bila model lupa menulis [n] tetapi isinya jelas berasal dari KONTEKS, 
        const srcs = /\[\d+\]/.test(ans) ? sourcesUsed(idx, hits, ans, nCtx) : sourcesFromHits(idx, hits, Math.min(2, nCtx));
        return done('answered', ans, { query: condensedQ, sources: srcs });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return done('llm_error', P.msg.error, { problems: [msg.slice(0, 300)] });
    }
}
