import fs from 'fs';
import path from 'path';
import { EXPORT_DIR } from '../config.js';
let cached = null;
let cachedAt = 0;
function readJson(file) {
    const p = path.join(EXPORT_DIR, file);
    if (!fs.existsSync(p)) {
        throw new Error(`Artefak "${file}" tidak ditemukan di ${EXPORT_DIR}. ` +
            `Jalankan notebook RAG_v3.ipynb sampai sel export_all(idx), lalu salin ` +
            `isi folder MyDrive/capstone/export/ ke ai-service/data/export/.`);
    }
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
export function loadIndex(forceReload = false) {
    if (cached && !forceReload)
        return cached;
    const chunks = readJson('chunks.json');
    const manifest = readJson('manifest.json');
    const policy = readJson('policy.json');
    const prompts = readJson('prompts.json');
    const router = readJson('router.json');
    const embPath = path.join(EXPORT_DIR, 'embeddings.f32');
    if (!fs.existsSync(embPath)) {
        throw new Error(`Artefak "embeddings.f32" tidak ditemukan di ${EXPORT_DIR}.`);
    }
    const buf = fs.readFileSync(embPath);
    // salin ke ArrayBuffer baru agar byteOffset dijamin kelipatan 4 (syarat Float32Array)
    const embeddings = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    if (embeddings.length !== manifest.n * manifest.dim) {
        throw new Error(`embeddings.f32 tidak cocok dengan manifest.json (punya ${embeddings.length} float, ` +
            `diharapkan ${manifest.n * manifest.dim}). Re-export dari notebook.`);
    }
    cached = { chunks, embeddings, dim: manifest.dim, manifest, policy, prompts, router };
    cachedAt = Date.now();
    return cached;
}
export function indexLoadedAt() {
    return cachedAt;
}
