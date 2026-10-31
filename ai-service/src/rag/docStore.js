import fs from 'fs';
import path from 'path';
import { chunkMarkdown } from './chunking.js';
import { embed } from './llm.js';
import { loadIndex } from './indexStore.js';
import { EXPORT_DIR } from '../config.js';
function writeAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
}
function chunksPath() {
    return path.join(EXPORT_DIR, 'chunks.json');
}
function embPath() {
    return path.join(EXPORT_DIR, 'embeddings.f32');
}
function manifestPath() {
    return path.join(EXPORT_DIR, 'manifest.json');
}
/**
 * NOTE desain: fungsi-fungsi di file ini (listDocs/addDocument/deleteDocument) adalah
 * satu-satunya tempat yang tahu bahwa penyimpanan saat ini berupa file JSON + .f32 di
 * disk. Saat pindah ke database sungguhan (mis. Postgres+pgvector/Supabase), cukup
 * tulis ulang isi 3 fungsi ini dengan query DB -- lib/retrieve.ts, lib/rag.ts, dan
 * seluruh UI TIDAK perlu diubah selama bentuk Chunk[] & Float32Array yang dikembalikan
 * loadIndex() tetap sama.
 */
export function listDocs() {
    const idx = loadIndex();
    const byDoc = new Map();
    for (const c of idx.chunks) {
        const cur = byDoc.get(c.doc) || { cite: c.cite, count: 0 };
        cur.count += 1;
        byDoc.set(c.doc, cur);
    }
    // dokumen yang diingest lewat notebook ada di manifest asli; dokumen yang
    // ditambahkan lewat web ditandai lewat file data/export/web-docs.json
    const webDocs = new Set(readWebDocRegistry().map((d) => d.file));
    return [...byDoc.entries()].map(([file, v]) => ({
        file,
        cite: v.cite,
        chunkCount: v.count,
        source: webDocs.has(file) ? 'web' : 'notebook',
    }));
}
function webDocRegistryPath() {
    return path.join(EXPORT_DIR, 'web-docs.json');
}
export function readWebDocRegistry() {
    try {
        return JSON.parse(fs.readFileSync(webDocRegistryPath(), 'utf-8'));
    }
    catch {
        return [];
    }
}
function writeWebDocRegistry(list) {
    fs.writeFileSync(webDocRegistryPath(), JSON.stringify(list, null, 2), 'utf-8');
}
function readAll() {
    const idx = loadIndex(true);
    return { chunks: idx.chunks, embFlat: idx.embeddings, manifest: idx.manifest };
}
function writeAll(chunks, embFlat, manifest) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    // tulis ke berkas sementara lalu rename, agar indeks tidak rusak bila proses mati di tengah penulisan
    writeAtomic(chunksPath(), JSON.stringify(chunks));
    writeAtomic(embPath(), Buffer.from(embFlat.buffer, embFlat.byteOffset, embFlat.byteLength));
    const newManifest = { ...manifest, n: chunks.length, ids: chunks.map((c) => c.id) };
    writeAtomic(manifestPath(), JSON.stringify(newManifest, null, 2));
}
/**
 * Tambah dokumen baru (markdown/teks) dari upload admin: chunk -> embed (pakai backend
 * aktif saat ini) -> append ke chunks.json & embeddings.f32 -> catat di registry.
 * Melempar error jika dokumen dengan nama file yang sama sudah ada (pakai deleteDocument dulu).
 */
export async function addDocument(file, cite, content, embedBaseUrl) {
    const { chunks, embFlat, manifest } = readAll();
    if (chunks.some((c) => c.doc === file)) {
        throw new Error(`Dokumen "${file}" sudah ada di index. Hapus dulu sebelum mengunggah ulang.`);
    }
    const newChunks = chunkMarkdown(content, { file, cite });
    if (!newChunks.length)
        throw new Error('Dokumen kosong setelah diproses -- tidak ada yang ditambahkan.');
    const vectors = await embed(embedBaseUrl, newChunks.map((c) => c.ctext));
    if (vectors.length !== newChunks.length) {
        throw new Error('Jumlah hasil embedding tidak sesuai jumlah chunk.');
    }
    const dim = manifest.dim || vectors[0].length;
    if (vectors[0].length !== dim) {
        throw new Error(`Dimensi embedding (${vectors[0].length}) tidak cocok dengan index saat ini (${dim}). ` +
            `Pastikan model embed sama dengan "${manifest.model}".`);
    }
    const merged = new Float32Array(embFlat.length + newChunks.length * dim);
    merged.set(embFlat, 0);
    vectors.forEach((v, i) => merged.set(v, embFlat.length + i * dim));
    const mergedChunks = [...chunks, ...newChunks];
    writeAll(mergedChunks, merged, manifest);
    const registry = readWebDocRegistry().filter((d) => d.file !== file);
    registry.push({ file, cite, addedAt: new Date().toISOString() });
    writeWebDocRegistry(registry);
    loadIndex(true); // invalidate cache so the next request sees the update
    return { addedChunks: newChunks.length };
}
export async function deleteDocument(file) {
    const { chunks, embFlat, manifest } = readAll();
    const dim = manifest.dim;
    const keepIdx = [];
    chunks.forEach((c, i) => {
        if (c.doc !== file)
            keepIdx.push(i);
    });
    const removed = chunks.length - keepIdx.length;
    if (removed === 0)
        throw new Error(`Tidak ada chunk untuk dokumen "${file}".`);
    const keptChunks = keepIdx.map((i) => chunks[i]);
    const keptEmb = new Float32Array(keepIdx.length * dim);
    keepIdx.forEach((srcI, dstI) => {
        keptEmb.set(embFlat.subarray(srcI * dim, srcI * dim + dim), dstI * dim);
    });
    writeAll(keptChunks, keptEmb, manifest);
    writeWebDocRegistry(readWebDocRegistry().filter((d) => d.file !== file));
    loadIndex(true);
    return { removedChunks: removed };
}
