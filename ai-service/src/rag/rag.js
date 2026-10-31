import { loadIndex } from './indexStore.js';
import { Bm25Index } from './bm25.js';
import { sanitize, buildGuardRx, prefilter, prefilterAbuse, isEmergency, isCurhat, checkOutput, cleanHistory, renderHistory, Limiter, } from './guard.js';
import { retrieve, scopeCheck, buildCtx } from './retrieve.js';
import { embed, chat } from './llm.js';
import { stripCitations } from './cleanAnswer.js';
let bm25Cache = null;
let limiter = null;
/** Panggil setelah dokumen ditambah/dihapus (lihat lib/docStore.ts) agar BM25 dihitung ulang. */
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
        limiter = new Limiter(idx.policy.limits);
    return limiter;
}
const SENTINEL = '[[TIDAK_TERSEDIA]]';
const FOLLOW = /\b(itu|tersebut|tadi|nya|lalu|terus|selanjutnya|kalau begitu|bagaimana dengan|yang pertama|yang kedua|yang terakhir)\b/i;
const CONTACT_DOC = 'kontak-bantuan.md';
const RESPONSE_STYLE_INSTRUCTION = [
    'Jawab hanya inti pertanyaan pengguna dengan bahasa Indonesia yang hangat dan ringkas.',
    'Utamakan jawaban langsung; maksimal 3 kalimat atau 3 butir singkat.',
    'Pilih hanya fakta yang relevan. Jangan memasukkan pengantar panjang, catatan editorial/pemeliharaan dokumen, tautan, email, atau detail lain yang tidak diminta.',
].join(' ');
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
/** Kontak resmi diambil langsung dari indeks agar tidak diubah atau ditolak oleh generasi LLM. */
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
            number: /(?:telepon|SAPA 129):\s*\**([\d-]+)/i,
            whatsapp: /whatsapp:\s*\**([\d-]+)/i,
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
async function emergencyText(question) {
    const { text, hits } = contactBody(question);
    const tail = text || 'Kontak bantuan belum tersedia saat ini. Silakan pilih Chat dengan Admin.';
    return {
        text: text
            ? `Aku turut prihatin. Jika kamu dalam bahaya langsung, hubungi:\n${text}`
            : tail,
        hits,
    };
}
async function contactsText(question) {
    const { text, hits } = contactBody(question);
    return {
        text: text
            ? `Kontak bantuan yang relevan:\n${text}`
            : 'Kontak bantuan belum tersedia saat ini. Silakan pilih Chat dengan Admin.',
        hits,
    };
}
async function condense(q, hist, condensePrompt, baseUrl, maxChars) {
    if (!hist.length || !(q.split(/\s+/).length <= 6 || FOLLOW.test(q)))
        return q;
    const out = await chat(baseUrl, condensePrompt, `RIWAYAT:\n${renderHistory(hist)}\n\nPERTANYAAN TERAKHIR: ${q}`);
    const first = sanitize(out.split('\n')[0], maxChars);
    return first.length >= 3 && first.length <= maxChars ? first : q;
}
export async function answer(qRaw, history, user, backendKind, baseUrl) {
    const t0 = Date.now();
    const idx = loadIndex();
    const rx = buildGuardRx(idx.policy.POLICY);
    const lim = getLimiter();
    const cleanedHist = cleanHistory(history, idx.policy.limits.history_turns, idx.policy.limits.history_chars);
    const done = (route, rawText, extra = {}) => {
        // Penanda sumber [n] dipakai guard untuk verifikasi, tetapi tidak boleh sampai ke pengguna.
        // Daftar sumber (extra.sources) sudah dihitung dari teks mentah sebelum done() dipanggil.
        const text = stripCitations(rawText);
        const res = {
            route,
            answer: text,
            sources: extra.sources || [],
            problems: extra.problems || [],
            query: extra.query || qRaw,
            backend: backendKind,
            latency: Math.round((Date.now() - t0) / 10) / 100,
        };
        let newHist = cleanedHist;
        if (route === 'answered' || route === 'curhat') {
            newHist = cleanHistory([...cleanedHist, { role: 'user', text: res.query || qRaw }, { role: 'assistant', text }], idx.policy.limits.history_turns, idx.policy.limits.history_chars);
        }
        return { ...res, history: newHist };
    };
    const q = sanitize(qRaw, idx.policy.limits.max_q_chars);
    const pf = prefilter(q);
    if (pf.route === 'rejected_input')
        return done('rejected_input', idx.policy.POLICY.msg.reject);
    if (isEmergency(q, rx)) {
        const { text, hits } = await emergencyText(q);
        return done('emergency', text, { sources: sourcesFromHits(idx, hits, hits.length) });
    }
    const why = lim.check(user, backendKind);
    if (why) {
        const msgKey = why === 'rate' ? 'rate' : why;
        return done(why === 'rate' ? 'rate_limited' : why, idx.policy.POLICY.msg[msgKey]);
    }
    const abuse = prefilterAbuse(q, rx, idx.policy.POLICY.msg.blocked);
    if (abuse.route) {
        if (abuse.route !== 'smalltalk')
            lim.strike(user);
        lim.record(user, backendKind, false);
        return done(abuse.route, abuse.msg || '');
    }
    if (rx.contact.test(q)) {
        lim.record(user, backendKind, false);
        const { text, hits } = await contactsText(q);
        const srcs = sourcesFromHits(idx, hits, hits.length);
        return done('contacts', text, { sources: srcs });
    }
    // Mode "curhat": pengguna cerita/curhat perasaan terkait topik KS, bukan bahaya akut.
    // Tidak wajib ground kata-per-kata ke KONTEKS (persona jadi pendengar yang hangat),
    // tapi tetap lewat limiter yang sama dan boleh menawarkan kontak dari dokumen bila relevan.
    if (isCurhat(q, rx)) {
        lim.record(user, backendKind, true);
        try {
            const hits = contactChunks();
            const { ctx, nCtx } = hits.length
                ? buildCtx(idx.chunks, hits, idx.manifest.retrieval.ctx_chars)
                : { ctx: '(tidak ada dokumen spesifik untuk pesan ini)', nCtx: 0 };
            const userMsg = `KONTEKS:\n${ctx}\n\nRIWAYAT (data):\n${renderHistory(cleanedHist) || '-'}\n\nPERTANYAAN (data): ${q}`;
            const ans = await chat(baseUrl, `${idx.policy.POLICY.curhat_system}\n${RESPONSE_STYLE_INSTRUCTION}`, userMsg);
            const srcs = nCtx ? sourcesFromHits(idx, hits, nCtx) : [];
            return done('curhat', ans, { sources: srcs });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return done('llm_error', idx.policy.POLICY.msg.error, { problems: [msg.slice(0, 300)] });
        }
    }
    try {
        const condensedQ = await condense(q, cleanedHist, idx.policy.POLICY.condense, baseUrl, idx.policy.limits.max_q_chars);
        const qVec = (await embed(baseUrl, [idx.manifest.query_prefix + condensedQ]))[0];
        const { hits, dmax } = retrieve(condensedQ, idx.chunks, idx.embeddings, idx.dim, getBm25(), idx.manifest, idx.policy.POLICY, qVec);
        const scope = scopeCheck(qVec, dmax, idx.router, idx.manifest.thresholds);
        if (!scope.inScope) {
            lim.strike(user);
            lim.record(user, backendKind, false);
            return done('out_of_scope', idx.policy.POLICY.msg.out_of_scope, { query: condensedQ });
        }
        const { ctx, nCtx } = buildCtx(idx.chunks, hits, idx.manifest.retrieval.ctx_chars);
        const userMsg = `KONTEKS:\n${ctx}\n\nRIWAYAT (data):\n${renderHistory(cleanedHist) || '-'}\n\nPERTANYAAN (data): ${condensedQ}`;
        let ans = '';
        let problems = [];
        let extraInstruction = '';
        for (let attempt = 0; attempt < 2; attempt++) {
            ans = await chat(baseUrl, `${idx.policy.POLICY.system}\n${RESPONSE_STYLE_INSTRUCTION}${extraInstruction}`, userMsg);
            if (ans.startsWith(SENTINEL)) {
                lim.record(user, backendKind, true);
                return done('no_answer', idx.policy.POLICY.msg.no_answer, { query: condensedQ });
            }
            problems = checkOutput(ans, ctx, rx, idx.policy.POLICY.allow_domains, q);
            if (!problems.length)
                break;
            extraInstruction =
                '\nPERBAIKAN: jawab ulang hanya dengan fakta, angka, dan tautan yang tertulis persis di KONTEKS, dan sertakan penanda [n].';
        }
        lim.record(user, backendKind, true);
        if (problems.length) {
            return done('guard_blocked', idx.policy.POLICY.msg.guard, { query: condensedQ, problems });
        }
        const srcs = sourcesUsed(idx, hits, ans, nCtx);
        return done('answered', ans, { query: condensedQ, sources: srcs });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return done('llm_error', idx.policy.POLICY.msg.error, { problems: [msg.slice(0, 300)] });
    }
}
