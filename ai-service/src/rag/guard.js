export function sanitize(s, limit) {
    let out = (s || '').normalize('NFKC');
    // hapus karakter kontrol + beberapa karakter arah/zero-width yang dipakai untuk injeksi
    out = out.replace(/[\x00-\x08\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e]/g, '');
    out = out.replace(/\s+/g, ' ').trim();
    out = out.replace(/(.)\1{9,}/g, '$1$1$1');
    return out.slice(0, limit);
}
function compileAll(patterns) {
    return patterns.map((p) => new RegExp(p, 'i'));
}
function hit(rxs, q) {
    return rxs.some((r) => r.test(q));
}
export function buildGuardRx(policy) {
    return {
        emergency: compileAll(policy.emergency),
        injection: compileAll(policy.injection),
        blocked: compileAll(policy.blocked),
        banned: compileAll(policy.banned),
        curhat: compileAll(policy.curhat || []),
        smalltalk: policy.smalltalk.map(([p, m]) => [new RegExp(p, 'i'), m]),
        contact: /(nomor|nomer|kontak|hotline|telepon|telp|hubungi|call center).{0,40}(darurat|bantuan|pengaduan|plt|ppks|polisi|sapa|satgas)|(darurat|hotline)/i,
    };
}
export function isCurhat(q, rx) {
    return hit(rx.curhat, q);
}
export function prefilter(q) {
    if (q.length < 2)
        return { route: 'rejected_input', msg: null };
    return { route: null, msg: null };
}
export function prefilterAbuse(q, rx, blockedMsg) {
    if (hit(rx.injection, q))
        return { route: 'injection', msg: blockedMsg };
    if (hit(rx.blocked, q))
        return { route: 'blocked_intent', msg: blockedMsg };
    for (const [r, m] of rx.smalltalk)
        if (r.test(q))
            return { route: 'smalltalk', msg: m };
    return { route: null, msg: null };
}
export function isEmergency(q, rx) {
    return hit(rx.emergency, q);
}
function numsFrom(t, parts = false) {
    const text = t.replace(/\[\d+\]/g, ' ');
    const out = new Set();
    const matches = text.match(/\d+(?:[.,-]\d+)*/g) || [];
    for (const x of matches) {
        out.add(x.replace(/\D/g, ''));
        if (parts)
            for (const p of x.match(/\d+/g) || [])
                out.add(p);
    }
    out.delete('');
    return out;
}
function urlsFrom(t) {
    return t.match(/https?:\/\/[^\s)\]>,]+|[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
}
export function unsupported(ans, ctx, allowDomains, q = '') {
    const src = ctx + ' ' + q;
    const srcNums = numsFrom(src, true);
    const ansNums = numsFrom(ans);
    const bad = [];
    for (const n of ansNums)
        if (!srcNums.has(n))
            bad.push(`angka:${n}`);
    for (const u of urlsFrom(ans)) {
        const clean = u.replace(/\.+$/, '');
        const inSrc = src.includes(clean);
        const inAllow = allowDomains.some((d) => new RegExp(d).test(u));
        if (!inSrc && !inAllow)
            bad.push(`tautan:${u}`);
    }
    return bad;
}
export function checkOutput(ans, ctx, rx, allowDomains, q = '') {
    const bad = unsupported(ans, ctx, allowDomains, q);
    for (const r of rx.banned)
        if (r.test(ans))
            bad.push(`klaim:${r.source}`);
    if (!/\[\d+\]/.test(ans))
        bad.push('tanpa_sitasi');
    return bad;
}
export function cleanHistory(h, turns, chars) {
    return h.slice(-turns * 2).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: sanitize(String(m.text || ''), chars),
    }));
}
export function renderHistory(h) {
    return h.map((m) => (m.role === 'user' ? 'Pengguna: ' : 'Asisten: ') + m.text).join('\n');
}
// --- Rate limiter sederhana, dalam memori proses (cukup untuk uji lokal) ---
export class Limiter {
    limits;
    clock;
    userHits = new Map();
    strikes = new Map();
    cooldown = new Map();
    globalDay = new Map();
    constructor(limits, clock = Date.now) {
        this.limits = limits;
        this.clock = clock;
    }
    check(user, backend) {
        const now = this.clock();
        const cool = this.cooldown.get(user) || 0;
        if (cool > now)
            return 'cooldown';
        const ts = (this.userHits.get(user) || []).filter((t) => now - t < 86_400_000);
        this.userHits.set(user, ts);
        const inHour = ts.filter((t) => now - t < 3_600_000).length;
        if (ts.length >= this.limits.user_day || inHour >= this.limits.user_hour)
            return 'rate';
        if (backend === 'colab') {
            const day = new Date(now).toISOString().slice(0, 10);
            if ((this.globalDay.get(day) || 0) >= this.limits.global_day_llm)
                return 'budget';
        }
        return null;
    }
    record(user, backend, llmCalled) {
        const now = this.clock();
        this.userHits.set(user, [...(this.userHits.get(user) || []), now]);
        if (llmCalled && backend === 'colab') {
            const day = new Date(now).toISOString().slice(0, 10);
            this.globalDay.set(day, (this.globalDay.get(day) || 0) + 1);
        }
    }
    strike(user) {
        const now = this.clock();
        const s = (this.strikes.get(user) || []).filter((t) => now - t < 3_600_000);
        s.push(now);
        if (s.length >= this.limits.strike_limit) {
            this.cooldown.set(user, now + this.limits.cooldown_s * 1000);
            this.strikes.set(user, []);
        }
        else {
            this.strikes.set(user, s);
        }
    }
}
