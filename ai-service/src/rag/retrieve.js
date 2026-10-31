export function expandQuery(q, aliases) {
    const ql = q.toLowerCase();
    const extra = [];
    for (const [pat, add] of aliases) {
        if (new RegExp(pat, 'i').test(ql))
            extra.push(add);
    }
    return (q + ' ' + extra.join(' ')).trim();
}
export function isWide(q, widePattern) {
    return new RegExp(widePattern, 'i').test(q.toLowerCase());
}
function denseScores(embeddings, dim, n, qv) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        const base = i * dim;
        for (let d = 0; d < dim; d++)
            s += embeddings[base + d] * qv[d];
        out[i] = s;
    }
    return out;
}
export function retrieve(qRaw, chunks, embeddings, dim, bm25, manifest, policy, queryVec, mode = 'hybrid', kOverride) {
    const ex = expandQuery(qRaw, policy.aliases);
    const n = chunks.length;
    const r = manifest.retrieval;
    const k = kOverride ?? (isWide(qRaw, policy.wide) ? r.k_ctx_wide : r.k_ctx);
    const dense = denseScores(embeddings, dim, n, queryVec);
    const sc = new Map();
    if (mode === 'hybrid' || mode === 'dense') {
        const order = [...dense.keys()].sort((a, b) => dense[b] - dense[a]).slice(0, r.k_dense);
        order.forEach((i, rank) => sc.set(i, (sc.get(i) || 0) + 1 / (r.rrf_k + rank)));
    }
    if (mode === 'hybrid' || mode === 'bm25') {
        const b = bm25.score(ex);
        const order = [...b.keys()].filter((i) => b[i] > 0).sort((a, c) => b[c] - b[a]).slice(0, r.k_bm25);
        order.forEach((i, rank) => sc.set(i, (sc.get(i) || 0) + 1 / (r.rrf_k + rank)));
    }
    const hintDocs = new Set();
    for (const [pat, files] of policy.doc_hints) {
        if (new RegExp(pat, 'i').test(qRaw.toLowerCase()))
            for (const f of files)
                hintDocs.add(f);
    }
    for (const i of sc.keys()) {
        if (hintDocs.has(chunks[i].doc))
            sc.set(i, (sc.get(i) || 0) + r.doc_boost);
    }
    const sorted = [...sc.entries()].sort((a, b) => b[1] - a[1]);
    const out = [];
    const perDoc = new Map();
    for (const [i, s] of sorted) {
        const d = chunks[i].doc;
        const cnt = perDoc.get(d) || 0;
        if (cnt >= r.per_doc_cap)
            continue;
        perDoc.set(d, cnt + 1);
        out.push({ i, id: chunks[i].id, score: s, dense: dense[i] });
        if (out.length >= k)
            break;
    }
    let dmax = -Infinity;
    for (let i = 0; i < n; i++)
        if (dense[i] > dmax)
            dmax = dense[i];
    return { hits: out, dmax };
}
export function routerScores(queryVec, router) {
    const top2mean = (vecs) => {
        const dots = vecs.map((v) => v.reduce((a, x, idx) => a + x * queryVec[idx], 0));
        dots.sort((a, b) => a - b);
        const top = dots.slice(-2);
        return top.reduce((a, b) => a + b, 0) / top.length;
    };
    return { sIn: top2mean(router.inn.vec), sOut: top2mean(router.out.vec) };
}
export function scopeCheck(queryVec, dmax, router, thresholds) {
    const { sIn, sOut } = routerScores(queryVec, router);
    const margin = sIn - sOut;
    const ok = dmax >= thresholds.t_strong || (dmax >= thresholds.t_floor && margin >= thresholds.router_margin);
    return { inScope: ok, sIn, sOut, margin, dmax };
}
export function buildCtx(chunks, hits, ctxChars) {
    const parts = [];
    let used = 0;
    let n = 0;
    for (const h of hits) {
        n += 1;
        const t = `[${n}] ${chunks[h.i].ctext}`;
        if (used + t.length > ctxChars && parts.length)
            break;
        parts.push(t);
        used += t.length;
    }
    return { ctx: parts.join('\n\n'), nCtx: parts.length };
}
