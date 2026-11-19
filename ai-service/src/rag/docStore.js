import { chunkDocument } from './chunking.js';
import { embed } from './llm.js';
import { loadIndex, loadBase } from './indexStore.js';
import { readState, readAdded, writeRuntime, clearRuntime } from './runtimeStore.js';

// Daftar Dokumen Indeks
export function listDocs() {
    const idx = loadIndex();
    const byDoc = new Map();
    idx.chunks.forEach((c, i) => {
        const cur = byDoc.get(c.doc) || { cite: c.cite, count: 0, web: i >= idx.baseChunkCount };
        cur.count += 1;
        byDoc.set(c.doc, cur);
    });
    return [...byDoc.entries()].map(([file, v]) => ({ file, cite: v.cite, chunkCount: v.count, source: v.web ? 'web' : 'notebook' }));
}

// Tambah Dokumen Baru (disimpan di folder runtime
export async function addDocument(file, cite, content, embedBaseUrl) {
    const idx = loadIndex();
    if (idx.chunks.some((c) => c.doc === file)) {
        throw new Error(`Dokumen "${file}" sudah ada di indeks. Hapus dulu sebelum mengunggah ulang.`);
    }
    const size = idx.baseManifest.chunking;
    const newChunks = chunkDocument(content, { file, cite }, { chunkChars: size?.chunk_chars, chunkMin: size?.chunk_min });
    if (!newChunks.length)
        throw new Error('Dokumen kosong setelah diproses -- tidak ada yang ditambahkan.');
    const vectors = await embed(embedBaseUrl, newChunks.map((c) => c.ctext));
    if (vectors.length !== newChunks.length)
        throw new Error('Jumlah hasil embedding tidak sesuai jumlah chunk.');
    const dim = idx.dim;
    if (vectors[0].length !== dim) {
        throw new Error(`Dimensi embedding (${vectors[0].length}) tidak cocok dengan indeks saat ini (${dim}). ` +
            `Pastikan model embed sama dengan "${idx.baseManifest.model}".`);
    }
    const cur = readAdded(dim);
    const merged = new Float32Array(cur.vectors.length + newChunks.length * dim);
    merged.set(cur.vectors, 0);
    vectors.forEach((v, i) => merged.set(v, cur.vectors.length + i * dim));
    const state = readState();
    state.added = state.added.filter((d) => d.file !== file);
    state.added.push({ file, cite, chunkCount: newChunks.length, addedAt: new Date().toISOString() });
    writeRuntime(state, [...cur.chunks, ...newChunks], merged);
    loadIndex(true);
    return { addedChunks: newChunks.length };
}

// Hapus Dokumen
export async function deleteDocument(file) {
    const idx = loadIndex();
    const state = readState();
    if (state.added.some((d) => d.file === file)) {
        const dim = idx.dim;
        const cur = readAdded(dim);
        const keepIdx = [];
        cur.chunks.forEach((c, i) => {
            if (c.doc !== file)
                keepIdx.push(i);
        });
        const removed = cur.chunks.length - keepIdx.length;
        const vec = new Float32Array(keepIdx.length * dim);
        keepIdx.forEach((src, dst) => vec.set(cur.vectors.subarray(src * dim, src * dim + dim), dst * dim));
        state.added = state.added.filter((d) => d.file !== file);
        writeRuntime(state, keepIdx.map((i) => cur.chunks[i]), vec);
        loadIndex(true);
        return { removedChunks: removed };
    }
    const base = loadBase();
    const count = base.chunks.filter((c) => c.doc === file).length;
    if (!count || state.removed.includes(file))
        throw new Error(`Tidak ada dokumen "${file}" di indeks.`);
    state.removed.push(file);
    const cur = readAdded(idx.dim);
    writeRuntime(state, cur.chunks, cur.vectors);
    loadIndex(true);
    return { removedChunks: count };
}

// Kembalikan ke Bawaan
export async function resetRuntime() {
    const before = readState();
    clearRuntime();
    loadIndex(true);
    return { restoredBaseDocs: before.removed.length, removedAddedDocs: before.added.length };
}
