// Penyimpanan Perubahan Admin (di luar export notebook)
import fs from 'fs';
import path from 'path';
import { RUNTIME_DIR } from '../config.js';

const STATE = 'state.json';
const CHUNKS = 'added-chunks.json';
const VECTORS = 'added-embeddings.f32';

function writeAtomic(file, data) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const target = path.join(RUNTIME_DIR, file);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
}
function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, file), 'utf-8'));
    }
    catch {
        return fallback;
    }
}

// Status
export function readState() {
    const s = readJson(STATE, {});
    return { removed: Array.isArray(s.removed) ? s.removed : [], added: Array.isArray(s.added) ? s.added : [] };
}
export function readAdded(dim) {
    const chunks = readJson(CHUNKS, []);
    let vectors = new Float32Array(0);
    try {
        const buf = fs.readFileSync(path.join(RUNTIME_DIR, VECTORS));
        vectors = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }
    catch {
        vectors = new Float32Array(0);
    }
    if (dim && vectors.length !== chunks.length * dim)
        return { chunks: [], vectors: new Float32Array(0), corrupt: chunks.length > 0 };
    return { chunks, vectors, corrupt: false };
}
export function writeRuntime(state, chunks, vectors) {
    writeAtomic(CHUNKS, JSON.stringify(chunks));
    writeAtomic(VECTORS, Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
    writeAtomic(STATE, JSON.stringify(state, null, 2));
}
export function clearRuntime() {
    for (const f of [STATE, CHUNKS, VECTORS])
        fs.rmSync(path.join(RUNTIME_DIR, f), { force: true });
}
