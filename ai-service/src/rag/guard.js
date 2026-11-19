export function sanitize(s, limit) {
    let out = (s || '').normalize('NFKC');
    // hapus karakter kontrol + beberapa karakter arah/zero-width yang dipaka
    out = out.replace(/[\x00-\x08\x0b-\x1f\x7f​-‏‪-‮⁦-⁩﻿]/g, '');
    out = out.replace(/\s+/g, ' ').trim();
    out = out.replace(/(.)\1{9,}/g, '$1$1$1');
    return out.slice(0, limit);
}
function compileAll(patterns) {
    return (patterns || []).map((p) => new RegExp(p, 'i'));
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
        curhat: compileAll(policy.curhat),
        privacy: compileAll(policy.privacy),
        ownReport: compileAll(policy.own_report),
        action: compileAll(policy.action),
        diagnosis: compileAll(policy.diagnosis),
        guarantee: compileAll(policy.guarantee),
        question: compileAll(policy.question),
        longQ: policy.long_q ? new RegExp(policy.long_q, 'i') : null,
        shortQ: policy.short_q ? new RegExp(policy.short_q, 'i') : null,
        smalltalk: (policy.smalltalk || []).map(([p, m]) => [new RegExp(p, 'i'), m]),
        contact: /(nomor|nomer|kontak|hotline|telepon|telp|hubungi|call center).{0,40}(darurat|bantuan|pengaduan|plt|ppks|polisi|sapa|satgas)|(darurat|hotline)/i,
    };
}
export function isCurhat(q, rx) {
    return hit(rx.curhat, q) && !hit(rx.question, q);
}
export function prefilter(q) {
    if (q.length < 2)
        return { route: 'rejected_input', msg: null };
    return { route: null, msg: null };
}
export function prefilterAbuse(q, rx, blockedMsg) {
    if (hit(rx.injection, q))
        return { route: 'injection', msg: blockedMsg };
    if (hit(rx.privacy, q))
        return { route: 'privacy', msg: null };
    if (hit(rx.blocked, q))
        return { route: 'blocked_intent', msg: blockedMsg };
    for (const [r, m] of rx.smalltalk)
        if (r.test(q))
            return { route: 'smalltalk', msg: m };
    return { route: null, msg: null };
}
// Permintaan yang SAH ditolak/dialihkan dengan pesan tetap
export function prefilterRefuse(q, rx) {
    if (hit(rx.ownReport, q))
        return 'own_report';
    if (hit(rx.action, q))
        return 'action';
    if (hit(rx.diagnosis, q))
        return 'diagnosis';
    if (hit(rx.guarantee, q))
        return 'guarantee';
    return null;
}
export function isEmergency(q, rx) {
    return hit(rx.emergency, q);
}
// Mode panjang jawaban
export function lengthMode(q, rx) {
    if (rx.shortQ && rx.shortQ.test(q))
        return 'short';
    return rx.longQ && rx.longQ.test(q) ? 'long' : 'short';
}
const DOC_NUM_CONTEXT = /(pasal|ayat|nomor|no\.?|huruf|angka|tahun|rp\.?)\s*\(?\s*$/i;
function numsFrom(t, parts = false) {
    const text = t.replace(/\[\d+\]/g, ' ');
    const out = new Set();
    const re = /\d+(?:[.,-]\d+)*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const x = m[0];
        out.add(x.replace(/\D/g, ''));
        if (parts)
            for (const p of x.match(/\d+/g) || [])
                out.add(p);
    }
    out.delete('');
    return out;
}
// Angka pada jawaban yang WAJIB ada di KONTEKS
function answerNumsToCheck(ans) {
    const text = ans.replace(/\[\d+\]/g, ' ').replace(/^\s*\d{1,2}[.)]\s+/gm, '');
    const out = new Set();
    const re = /\d+(?:[.,-]\d+)*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const digits = m[0].replace(/\D/g, '');
        if (!digits)
            continue;
        const before = text.slice(Math.max(0, m.index - 12), m.index);
        if (digits.length >= 2 || DOC_NUM_CONTEXT.test(before))
            out.add(digits);
    }
    return out;
}
function urlsFrom(t) {
    return t.match(/https?:\/\/[^\s)\]>,]+|[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
}
export function unsupported(ans, ctx, allowDomains, q = '') {
    const src = ctx + ' ' + q;
    const srcNums = numsFrom(src, true);
    const bad = [];
    for (const n of answerNumsToCheck(ans))
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
const STOP = new Set('yang dan di ke dari untuk dengan ini itu atau adalah apa pada dalam akan bisa saya aku kamu apakah ada oleh juga sebagai agar jika karena dapat para kepada serta nya lah kah pun sudah belum tidak hanya harus ya sih dong'.split(' '));
function contentTokens(s) {
    return (s.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !STOP.has(w));
}
// Proporsi kata isi jawaban yang juga muncul di KONTEKS (0-1)
export function overlapRatio(ans, ctx) {
    const stem = (w) => (w.length > 5 ? w.slice(0, 5) : w);
    const a = contentTokens(ans.replace(/\[\d+\]/g, ' '));
    if (!a.length)
        return 0;
    const c = new Set(contentTokens(ctx).map(stem));
    return a.filter((w) => c.has(stem(w))).length / a.length;
}
const LEAK_RX = [/\bKONTEKS\s*:/, /\bRIWAYAT\s*(\(data\))?\s*:/, /\bPERTANYAAN\s*(\(data\))?\s*:/, /ATURAN (ISI|BENTUK)/, /TARGET JAWABAN/, /\[\[TIDAK_TERSEDIA\]\]/, /Siska\.ai, asisten virtual platform SISKA/i];
export function checkOutput(ans, ctx, rx, allowDomains, q = '', opts = {}) {
    const bad = unsupported(ans, ctx, allowDomains, q);
    for (const r of rx.banned)
        if (r.test(ans))
            bad.push(`klaim:${r.source}`);
    for (const r of LEAK_RX)
        if (r.test(ans)) {
            bad.push('bocor_prompt');
            break;
        }
    if (!/\[\d+\]/.test(ans)) {
        const minOverlap = opts.minOverlap ?? 0.6;
        if (overlapRatio(ans, ctx) < minOverlap)
            bad.push('tanpa_sitasi');
        else if (opts.onUncited)
            opts.onUncited();
    }
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
// --- Rate limiter sederhana, dalam memori proses
export class Limiter {
    limits;
    clock;
    disabled;
    userHits = new Map();
    strikes = new Map();
    cooldown = new Map();
    globalDay = new Map();
    constructor(limits, clock = Date.now, disabled = false) {
        this.limits = limits;
        this.clock = clock;
        this.disabled = disabled;
    }
    check(user, backend) {
        if (this.disabled)
            return null;
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
        if (this.disabled)
            return;
        const now = this.clock();
        this.userHits.set(user, [...(this.userHits.get(user) || []), now]);
        if (llmCalled && backend === 'colab') {
            const day = new Date(now).toISOString().slice(0, 10);
            this.globalDay.set(day, (this.globalDay.get(day) || 0) + 1);
        }
    }
    strike(user) {
        if (this.disabled)
            return;
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
