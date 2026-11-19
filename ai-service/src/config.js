// Konfigurasi AI Service
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Pembacaan File Env
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

// Direktori Export & Pengaturan
export const EXPORT_DIR = process.env.RAG_EXPORT_DIR
  ? path.resolve(ROOT, process.env.RAG_EXPORT_DIR)
  : path.join(ROOT, 'data', 'export');

export const SETTINGS_FILE = path.join(ROOT, 'data', 'runtime-settings.json');

export const PORT = Number(process.env.PORT) || 8000;
export const HOST = process.env.HOST || '127.0.0.1';

// Konfigurasi Keamanan & Sesi
export const SHARED_SECRET = (process.env.AI_SERVICE_SHARED_SECRET || '').trim();
export const ALLOW_NO_AUTH = (process.env.ALLOW_NO_AUTH || '').toLowerCase() === 'true';

export const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES) || 2 * 1024 * 1024;

export const SESSION_MAX = Number(process.env.SESSION_MAX) || 500;
export const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_MIN) || 60) * 60_000;

// Mode Pengujian
const IS_PROD = (process.env.NODE_ENV || '').toLowerCase() === 'production';
export const RATE_LIMIT_DISABLED = !IS_PROD && (process.env.SISKA_DISABLE_RATE_LIMIT || '').toLowerCase() === 'true';
export const DEBUG_ENABLED = !IS_PROD && (process.env.SISKA_DEBUG || '').toLowerCase() === 'true';

// Folder Perubahan Admin (dokumen tambahan & dokumen dasar yang dihapus), terpisah dari export notebook
export const RUNTIME_DIR = process.env.RAG_RUNTIME_DIR
  ? path.resolve(ROOT, process.env.RAG_RUNTIME_DIR)
  : path.join(ROOT, 'data', 'runtime');
