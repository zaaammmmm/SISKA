import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EXPORT_DIR } from '../config.js';
import { readState, readAdded } from './runtimeStore.js';
let cached = null;
let cachedAt = 0;
function readJson(file) {
    const p = path.join(EXPORT_DIR, file);
    if (!fs.existsSync(p)) {
        throw new Error(`Artefak "${file}" tidak ditemukan di ${EXPORT_DIR}. ` +
            `Jalankan notebook RAG_v4.ipynb sampai Langkah 6, lalu salin ` +
            `isi folder hasil_terbaik/export/ ke ai-service/data/export/.`);
    }
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
// Muat Export Dasar
export function loadBase() {
    const chunks = readJson('chunks.json');
    const manifest = readJson('manifest.json');
    const embPath = path.join(EXPORT_DIR, 'embeddings.f32');
    if (!fs.existsSync(embPath)) {
        throw new Error(`Artefak "embeddings.f32" tidak ditemukan di ${EXPORT_DIR}.`);
    }
    const buf = fs.readFileSync(embPath);
    const embeddings = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    if (embeddings.length !== manifest.n * manifest.dim) {
        throw new Error(`embeddings.f32 tidak cocok dengan manifest.json (punya ${embeddings.length} float, ` +
            `diharapkan ${manifest.n * manifest.dim}). Re-export dari notebook.`);
    }
    return { chunks, embeddings, manifest };
}
// Pemuatan Indeks RAG
export function loadIndex(forceReload = false) {
    if (cached && !forceReload)
        return cached;
    const base = loadBase();
    const policy = readJson('policy.json');
    const prompts = readJson('prompts.json');
    const router = readJson('router.json');
    const dim = base.manifest.dim;
    const state = readState();
    const removed = new Set(state.removed);
    const keep = [];
    base.chunks.forEach((c, i) => {
        if (!removed.has(c.doc))
            keep.push(i);
    });
    const added = readAdded(dim);
    let embeddings = base.embeddings;
    let chunks = base.chunks;
    if (keep.length !== base.chunks.length) {
        chunks = keep.map((i) => base.chunks[i]);
        embeddings = new Float32Array(keep.length * dim);
        keep.forEach((src, dst) => embeddings.set(base.embeddings.subarray(src * dim, src * dim + dim), dst * dim));
    }
    if (added.chunks.length) {
        const merged = new Float32Array(embeddings.length + added.vectors.length);
        merged.set(embeddings, 0);
        merged.set(added.vectors, embeddings.length);
        embeddings = merged;
        chunks = [...chunks, ...added.chunks];
    }
    if (added.corrupt)
        console.error('PERINGATAN: dokumen tambahan admin tidak cocok dengan export saat ini (dimensi embedding berbeda) dan diabaikan. Gunakan "Kembalikan ke bawaan".');
    const manifest = { ...base.manifest, n: chunks.length, ids: chunks.map((c) => c.id) };
    cached = {
        chunks, embeddings, dim, manifest, policy, prompts, router,
        baseManifest: base.manifest, baseChunkCount: keep.length, state,
    };
    cachedAt = Date.now();
    return cached;
}
export function indexLoadedAt() {
    return cachedAt;
}
// Identitas Indeks (untuk /health)
export function indexInfo() {
    const idx = loadIndex();
    const exportId = crypto.createHash('sha256').update(idx.baseManifest.ids.join('|')).digest('hex').slice(0, 12);
    return {
        policyVersion: idx.policy?.POLICY?.version ?? 'lama',
        exportId,
        embedModel: idx.baseManifest.model,
        exportChunks: idx.baseManifest.n,
        activeChunks: idx.chunks.length,
        removedBaseDocs: idx.state.removed,
        addedDocs: idx.state.added.map((d) => d.file),
    };
}
