// Port 1:1 dari sel 11 notebook (STOP, tok, class Index.bm25).
export function makeTokenizer(stopWords) {
    const STOP = new Set(stopWords);
    return function tok(s) {
        const out = [];
        const words = (s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []);
        for (let w of words) {
            if (STOP.has(w))
                continue;
            for (const suf of ['nya', 'lah', 'kah']) {
                if (w.length > 5 && w.endsWith(suf)) {
                    w = w.slice(0, -suf.length);
                    break;
                }
            }
            out.push(w);
        }
        return out;
    };
}
export class Bm25Index {
    chunks;
    k1;
    b;
    tf;
    dl;
    avg;
    idf;
    tok;
    constructor(chunks, manifest) {
        this.chunks = chunks;
        this.k1 = manifest.bm25.k1;
        this.b = manifest.bm25.b;
        this.tok = makeTokenizer(manifest.bm25.stop);
        this.tf = chunks.map((c) => {
            const m = new Map();
            for (const w of this.tok(c.ctext))
                m.set(w, (m.get(w) || 0) + 1);
            return m;
        });
        this.dl = new Float64Array(this.tf.map((t) => [...t.values()].reduce((a, b) => a + b, 0)));
        this.avg = this.dl.reduce((a, b) => a + b, 0) / Math.max(this.dl.length, 1);
        const df = new Map();
        for (const t of this.tf)
            for (const w of t.keys())
                df.set(w, (df.get(w) || 0) + 1);
        const n = chunks.length;
        this.idf = new Map();
        for (const [w, d] of df)
            this.idf.set(w, Math.log(1 + (n - d + 0.5) / (d + 0.5)));
    }
    score(q) {
        const s = new Float64Array(this.chunks.length);
        const qWords = new Set(this.tok(q));
        for (const w of qWords) {
            const idf = this.idf.get(w);
            if (idf === undefined)
                continue;
            for (let i = 0; i < this.tf.length; i++) {
                const f = this.tf[i].get(w);
                if (!f)
                    continue;
                s[i] += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.dl[i]) / this.avg));
            }
        }
        return s;
    }
}
