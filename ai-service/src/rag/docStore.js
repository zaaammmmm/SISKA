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
// Daftar Dokumen Indeks
export function listDocs() {
    const idx = loadIndex();
    const byDoc = new Map();
    for (const c of idx.chunks) {
        const cur = byDoc.get(c.doc) || { cite: c.cite, count: 0 };
        cur.count += 1;
        byDoc.set(c.doc, cur);
    }
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
    writeAtomic(chunksPath(), JSON.stringify(chunks));
    writeAtomic(embPath(), Buffer.from(embFlat.buffer, embFlat.byteOffset, embFlat.byteLength));
    const newManifest = { ...manifest, n: chunks.length, ids: chunks.map((c) => c.id) };
    writeAtomic(manifestPath(), JSON.stringify(newManifest, null, 2));
}
// Tambah Dokumen Baru
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
    loadIndex(true);
    return { addedChunks: newChunks.length };
}
// Hapus Dokumen Indeks
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
