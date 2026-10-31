/**
 * Konfigurasi layanan SISKA AI (RAG).
 *
 * Nilai dibaca dari environment proses; bila ada berkas `.env` di folder ai-service,
 * isinya dimuat lebih dulu (tanpa menimpa variabel yang sudah diset di shell/hosting).
 * Parser `.env` ditulis sendiri supaya layanan ini tidak membutuhkan paket npm apa pun.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

/** Folder artefak hasil export notebook (chunks, embeddings, policy, router, dst.). */
export const EXPORT_DIR = process.env.RAG_EXPORT_DIR
  ? path.resolve(ROOT, process.env.RAG_EXPORT_DIR)
  : path.join(ROOT, 'data', 'export');

/** Pengaturan yang bisa diubah saat server berjalan (backend Ollama lokal/Colab). */
export const SETTINGS_FILE = path.join(ROOT, 'data', 'runtime-settings.json');

export const PORT = Number(process.env.PORT) || 8000;
export const HOST = process.env.HOST || '127.0.0.1';

/**
 * Secret server-to-server. Harus sama dengan AI_SERVICE_SHARED_SECRET di SISKA.
 * Bila kosong, layanan menolak SEMUA request /chat dan /admin (fail-closed),
 * kecuali ALLOW_NO_AUTH=true dipakai khusus untuk uji lokal.
 */
export const SHARED_SECRET = (process.env.AI_SERVICE_SHARED_SECRET || '').trim();
export const ALLOW_NO_AUTH = (process.env.ALLOW_NO_AUTH || '').toLowerCase() === 'true';

export const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES) || 2 * 1024 * 1024;

/** Riwayat percakapan di memori: jumlah sesi maksimum dan umur sesi. */
export const SESSION_MAX = Number(process.env.SESSION_MAX) || 500;
export const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_MIN) || 60) * 60_000;
