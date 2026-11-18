// Entry Point AI Service
import { PORT, HOST, SHARED_SECRET, ALLOW_NO_AUTH } from './config.js';
import { createServer } from './server.js';
import { loadIndex } from './rag/indexStore.js';

const server = createServer();
// Batas Waktu Request
server.requestTimeout = 180_000;

server.listen(PORT, HOST, () => {
  const auth = SHARED_SECRET ? 'aktif' : ALLOW_NO_AUTH ? 'DIMATIKAN (ALLOW_NO_AUTH)' : 'BELUM DISET -> request ditolak';
  console.log(`SISKA AI service di http://${HOST}:${PORT}  (auth: ${auth})`);
  try {
    console.log(`Indeks dimuat: ${loadIndex().chunks.length} chunk`);
  } catch (e) {
    console.error(`PERINGATAN: ${e.message}`);
  }
});
