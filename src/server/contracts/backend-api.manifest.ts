/**
 * SISKA — Backend API Endpoint Manifest & Architecture Contract
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml (OpenAPI 3.1.0 `/api/v1`)
 * - docs/05-BACKEND-ARCHITECTURE.md §4 (7-Step Request Flow) & §8 (Error Contract)
 * - docs/08-AUTHORIZATION-MATRIX.md (RBAC & Ownership Matrix)
 *
 * File ini menyediakan peta lengkap seluruh endpoint backend `/api/v1/*`
 * agar Tim Frontend dan Tim AI dapat melihat status, metode, otorisasi,
 * dan rate limit setiap endpoint secara langsung dari satu file TypeScript.
 */

import type { UserRole } from '@/types/domain';

export interface BackendEndpointDescriptor {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  allowedRoles: readonly UserRole[] | 'public_readiness';
  ownershipRule: string;
  rateLimitPolicy: string | null;
  description: string;
}

/**
 * Daftar lengkap seluruh endpoint `/api/v1/*` yang aktif di Backend SISKA.
 */
export const BACKEND_API_MANIFEST: readonly BackendEndpointDescriptor[] = [
  // 1. Health & Readiness
  {
    id: 'health.readiness',
    method: 'GET',
    path: '/api/v1/health',
    allowedRoles: 'public_readiness',
    ownershipRule: 'Readiness check tanpa mengekspos secret atau environment variable',
    rateLimitPolicy: null,
    description: 'Memeriksa kesiapan server backend dan status mode integrasi AI RAG.',
  },

  // 2. Profile & Initial Provisioning
  {
    id: 'profile.get',
    method: 'GET',
    path: '/api/v1/profile',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Self only (`uid` dari Firebase ID Token)',
    rateLimitPolicy: null,
    description: 'Mengambil profil pengguna yang sedang login (alias `/api/v1/users/me`).',
  },
  {
    id: 'profile.provision',
    method: 'POST',
    path: '/api/v1/profile',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Self only (`uid` dari Firebase ID Token baru)',
    rateLimitPolicy: 'PROFILE_UPDATE',
    description: 'Membuat dokumen awal `users/{uid}` dengan role `reporter` saat registrasi.',
  },
  {
    id: 'profile.update',
    method: 'PATCH',
    path: '/api/v1/profile',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Self only; field `role`, `uid`, `email` ditolak keras (AUTH-03)',
    rateLimitPolicy: 'PROFILE_UPDATE',
    description: 'Memperbarui subset profil yang diizinkan (`displayName`, `phone`).',
  },

  // 3. Reports & Case Status
  {
    id: 'reports.list',
    method: 'GET',
    path: '/api/v1/reports',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Reporter hanya melihat laporan miliknya; Admin melihat seluruh laporan',
    rateLimitPolicy: null,
    description: 'Daftar laporan berpaginasi dengan filter status opsional.',
  },
  {
    id: 'reports.create',
    method: 'POST',
    path: '/api/v1/reports',
    allowedRoles: ['reporter'],
    ownershipRule: '`reporterId` diturunkan dari token server; status awal `submitted`',
    rateLimitPolicy: 'CREATE_REPORT',
    description: 'Membuat laporan pengaduan baru beserta entri awal `statusHistory` & `auditLogs`.',
  },
  {
    id: 'reports.summary',
    method: 'GET',
    path: '/api/v1/reports/summary',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Reporter menghitung laporannya sendiri; Admin menghitung seluruh laporan',
    rateLimitPolicy: null,
    description: 'Ringkasan jumlah laporan per status (`submitted`, `in_review`, dst.) untuk kartu dashboard.',
  },
  {
    id: 'reports.detail',
    method: 'GET',
    path: '/api/v1/reports/{id}',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Owner reporter atau Admin; mengembalikan 403 seragam jika bukan pemilik / tidak ditemukan (REP-03)',
    rateLimitPolicy: null,
    description: 'Detail laporan lengkap beserta `statusHistory` dan daftar metadata `evidence`.',
  },
  {
    id: 'reports.updateStatus',
    method: 'PATCH',
    path: '/api/v1/reports/{id}/status',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only; divalidasi terhadap ALLOWED_STATUS_TRANSITIONS & wajib note bila relevan',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Memperbarui status laporan, menambah `statusHistory`, dan mencatat `auditLogs` dalam 1 transaksi atomik.',
  },

  // 4. Private Evidence Upload & Signed URL Download
  {
    id: 'evidence.upload',
    method: 'POST',
    path: '/api/v1/reports/{id}/evidence',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Owner reporter (saat laporan belum closed/rejected) atau Admin',
    rateLimitPolicy: 'UPLOAD_EVIDENCE',
    description: 'Unggah bukti privat (multipart binary atau 2-phase JSON) dengan validasi MIME, <= 5 MiB, Magic Bytes, dan compensating cleanup.',
  },
  {
    id: 'evidence.download',
    method: 'GET',
    path: '/api/v1/reports/{id}/evidence/{evidenceId}/download',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Owner reporter atau Admin; mencatat audit log `evidence.download_url_issued`',
    rateLimitPolicy: null,
    description: 'Menerbitkan Signed URL jangka pendek (TTL <= 300 detik) untuk bukti privat.',
  },

  // 5. Conversations & Messages (Confidential Human Chat)
  {
    id: 'conversations.list',
    method: 'GET',
    path: '/api/v1/conversations',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Reporter hanya melihat percakapannya; Admin melihat daftar percakapan kasus',
    rateLimitPolicy: null,
    description: 'Mengambil daftar ruang percakapan.',
  },
  {
    id: 'conversations.createOrOpen',
    method: 'POST',
    path: '/api/v1/conversations',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Transaksi idempoten (`conv_{uid}_{reportId}`) anti-race condition',
    rateLimitPolicy: 'SEND_MESSAGE',
    description: 'Membuka atau membuat ruang percakapan dengan petugas.',
  },
  {
    id: 'conversations.detail',
    method: 'GET',
    path: '/api/v1/conversations/{id}',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Owner reporter atau Admin',
    rateLimitPolicy: null,
    description: 'Mengambil metadata ruang percakapan berdasarkan ID.',
  },
  {
    id: 'conversations.updateAdmin',
    method: 'PATCH',
    path: '/api/v1/conversations/{id}',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only (`status`: open/closed atau `assignedAdminId`)',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Menugaskan admin atau menutup/membuka kembali percakapan beserta audit log.',
  },
  {
    id: 'messages.list',
    method: 'GET',
    path: '/api/v1/conversations/{id}/messages',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Owner reporter atau Admin (CHAT-02)',
    rateLimitPolicy: null,
    description: 'Mengambil daftar pesan secara kronologis di dalam ruang percakapan.',
  },
  {
    id: 'messages.send',
    method: 'POST',
    path: '/api/v1/conversations/{id}/messages',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: '`senderUid` & `senderRole` diambil dari token server (CHAT-01)',
    rateLimitPolicy: 'SEND_MESSAGE',
    description: 'Mengirim pesan baru pada percakapan yang masih berstatus `open`.',
  },

  // 6. SISKA AI General Assistant
  {
    id: 'ai.chat',
    method: 'POST',
    path: '/api/v1/ai/chat',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Hanya mengakses `knowledgeDocuments` (`indexed`) & `knowledgeChunks`; dilarang menyentuh `reports`',
    rateLimitPolicy: 'AI_CHAT',
    description: 'Tanya jawab informasi umum dengan Safety Gate, Prompt Injection Filter, Relevance Gate, dan sitasi dokumen.',
  },

  // 7. Admin Knowledge Base & Audit Logs
  {
    id: 'admin.kb.list',
    method: 'GET',
    path: '/api/v1/admin/knowledge-documents',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only',
    rateLimitPolicy: null,
    description: 'Daftar dokumen PDF Knowledge Base beserta status indexing (`processing`, `indexed`, `failed`).',
  },
  {
    id: 'admin.kb.upload',
    method: 'POST',
    path: '/api/v1/admin/knowledge-documents',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only; validasi PDF signature `%PDF-`, SHA-256, ekstraksi teks, dan chunking otomatis',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Mengunggah dan mengindeks dokumen PDF Knowledge Base baru.',
  },
  {
    id: 'admin.kb.delete',
    method: 'DELETE',
    path: '/api/v1/admin/knowledge-documents/{documentId}',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only; menghapus objek Storage, dokumen, dan seluruh `knowledgeChunks` terkait (KB-03)',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Menghapus dokumen Knowledge Base beserta seluruh potongan teksnya secara menyeluruh.',
  },
  {
    id: 'admin.kb.reindex',
    method: 'POST',
    path: '/api/v1/admin/knowledge-documents/reindex',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only; operasi idempoten dengan audit log',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Memicu pengindeksan ulang dokumen Knowledge Base dari berkas PDF di Cloud Storage.',
  },
  {
    id: 'admin.audit.list',
    method: 'GET',
    path: '/api/v1/admin/audit-events',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only (alias `/api/v1/admin/audit`); append-only log tanpa PII mentah',
    rateLimitPolicy: null,
    description: 'Mengambil daftar riwayat audit keamanan sistem.',
  },

  // 7. Public Education Materials & Admin Content Management
  {
    id: 'education.list',
    method: 'GET',
    path: '/api/v1/education',
    allowedRoles: 'public_readiness',
    ownershipRule: 'Publik; pengunjung/pelapor melihat artikel isPublished=true, admin melihat seluruhnya',
    rateLimitPolicy: null,
    description: 'Daftar materi edukasi kekerasan seksual dengan filter kategori, tag, dan pencarian.',
  },
  {
    id: 'education.detail',
    method: 'GET',
    path: '/api/v1/education/{id}',
    allowedRoles: 'public_readiness',
    ownershipRule: 'Publik; detail artikel edukasi berdasarkan ID atau slug',
    rateLimitPolicy: null,
    description: 'Mengambil detail konten artikel edukasi lengkap.',
  },
  {
    id: 'admin.education.create',
    method: 'POST',
    path: '/api/v1/admin/education',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only; mencatat jejak audit `education.created`',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Membuat materi edukasi baru.',
  },
  {
    id: 'admin.education.update',
    method: 'PATCH',
    path: '/api/v1/admin/education/{id}',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only; mencatat jejak audit `education.updated`',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Memperbarui konten atau metadata materi edukasi.',
  },
  {
    id: 'admin.education.delete',
    method: 'DELETE',
    path: '/api/v1/admin/education/{id}',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only; mencatat jejak audit `education.deleted`',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Menghapus materi edukasi dari sistem.',
  },

  // 8. In-App Notifications & Admin Broadcast
  {
    id: 'notifications.list',
    method: 'GET',
    path: '/api/v1/notifications',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Self only (`uid` dari token; subkoleksi `users/{uid}/notifications`)',
    rateLimitPolicy: null,
    description: 'Mengambil daftar notifikasi in-app milik pengguna yang sedang login.',
  },
  {
    id: 'notifications.unreadCount',
    method: 'GET',
    path: '/api/v1/notifications/unread-count',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Self only (`uid` dari token)',
    rateLimitPolicy: null,
    description: 'Menghitung jumlah notifikasi belum dibaca untuk badge lonceng topbar.',
  },
  {
    id: 'notifications.markRead',
    method: 'PATCH',
    path: '/api/v1/notifications/{id}/read',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Self only; mengembalikan 404 seragam bila ID bukan milik pemanggil (Anti-IDOR)',
    rateLimitPolicy: null,
    description: 'Menandai satu notifikasi tertentu sebagai telah dibaca.',
  },
  {
    id: 'notifications.markAllRead',
    method: 'PATCH',
    path: '/api/v1/notifications/read-all',
    allowedRoles: ['reporter', 'admin'],
    ownershipRule: 'Self only (`uid` dari token)',
    rateLimitPolicy: null,
    description: 'Menandai seluruh notifikasi milik pemanggil sebagai telah dibaca dalam satu batch.',
  },
  {
    id: 'admin.notifications.broadcast',
    method: 'POST',
    path: '/api/v1/admin/notifications/broadcast',
    allowedRoles: ['admin'],
    ownershipRule: 'Admin only; mengirimkan notifikasi serentak ke seluruh pelapor/pengguna',
    rateLimitPolicy: 'ADMIN_MUTATION',
    description: 'Mengirimkan notifikasi serentak (broadcast) ke seluruh pelapor atau seluruh pengguna.',
  },
] as const;

