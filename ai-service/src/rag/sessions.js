/**
 * Riwayat percakapan di memori proses, per (userId, conversationId).
 *
 * Kontrak SISKA hanya mengirim `message` + `conversationId`, jadi riwayat untuk
 * pertanyaan lanjutan ("yang kedua?", "kalau itu?") disimpan di sisi layanan AI.
 * Dibatasi jumlah sesi dan umurnya agar memori tidak membengkak.
 * Untuk deployment multi-instance, ganti dengan Redis (antarmuka get/set tetap sama).
 */
export class SessionStore {
  constructor(max, ttlMs, clock = Date.now) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.map = new Map();
  }

  static key(userId, conversationId) {
    return `${userId}::${conversationId || 'default'}`;
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return [];
    if (this.clock() - e.at > this.ttlMs) {
      this.map.delete(key);
      return [];
    }
    return e.history;
  }

  set(key, history) {
    this.map.delete(key); // pindahkan ke posisi terbaru
    this.map.set(key, { history, at: this.clock() });
    while (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value);
    }
  }
}
