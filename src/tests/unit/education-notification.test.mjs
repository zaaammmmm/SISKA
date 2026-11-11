/**
 * SISKA — Automated Verification Suite for Education & Notification APIs
 * Sumber otoritas:
 * - docs/01-SRS.md FR-001 (Public Education Materials)
 * - docs/05-BACKEND-ARCHITECTURE.md §2, §4, §8 (Clean Layered Architecture, Error & Envelope)
 * - docs/07-FRONTEND-ARCHITECTURE.md §6 ("Mask sensitive content in notifications")
 * - docs/08-AUTHORIZATION-MATRIX.md (Public Read, Admin Write, Self-Only Notifications)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resetMockFirebaseAdmin,
  seedMockDocs,
  getMockDoc,
  listMockCollectionDocs,
} from '../firebase-admin-mock.mjs';

import { ApiError } from '@/server/errors/api-error';
import {
  listEducationMaterials,
  getEducationDetail,
  createEducationMaterial,
  updateEducationMaterial,
  deleteEducationMaterial,
} from '@/server/services/education.service';
import {
  createNotification,
  listUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  broadcastNotificationByAdmin,
} from '@/server/services/notification.service';
import { updateReportStatus } from '@/server/services/report.service';

// Set env emulator default untuk pengujian
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIREBASE_PROJECT_ID = 'demo-siska';

// Mock caller identities
const CALLER_ADMIN = {
  uid: 'admin_test_1',
  email: 'admin@siska.test',
  role: 'admin',
  claimVerified: true,
};

const CALLER_REPORTER_1 = {
  uid: 'reporter_test_1',
  email: 'reporter1@siska.test',
  role: 'reporter',
  claimVerified: true,
};

const CALLER_REPORTER_2 = {
  uid: 'reporter_test_2',
  email: 'reporter2@siska.test',
  role: 'reporter',
  claimVerified: true,
};

const CALLER_OUTSIDER = {
  uid: 'outsider_test',
  email: 'outsider@siska.test',
  role: null,
  claimVerified: false,
};

test.beforeEach(() => {
  resetMockFirebaseAdmin();
});

// ── 1. Suite Pengujian API Edukasi (/education) ─────────────────────────────

test('EDU-01 & EDU-02: Akses publik ke daftar materi edukasi hanya mengembalikan materi yang dipublikasikan (isPublished = true)', async () => {
  seedMockDocs([
    {
      path: 'education/edu_pub_1',
      data: {
        title: 'Memahami Persetujuan',
        slug: 'memahami-persetujuan',
        tag: 'Persetujuan',
        category: 'general',
        icon: 'heart',
        excerpt: 'Persetujuan harus bebas dan jelas.',
        content: 'Konten lengkap mengenai persetujuan sadar...',
        readingTimeMinutes: 4,
        isPublished: true,
        sortOrder: 1,
        createdBy: 'admin_test_1',
        createdAt: new Date('2026-10-01'),
        updatedAt: new Date('2026-10-01'),
      },
    },
    {
      path: 'education/edu_draft_1',
      data: {
        title: 'Draf Panduan Internal',
        slug: 'draf-panduan-internal',
        tag: 'Dukungan',
        category: 'guide',
        icon: 'shield',
        excerpt: 'Materi masih dalam penyusunan.',
        content: 'Konten draf yang belum boleh tayang ke publik...',
        readingTimeMinutes: 5,
        isPublished: false,
        sortOrder: 2,
        createdBy: 'admin_test_1',
        createdAt: new Date('2026-10-02'),
        updatedAt: new Date('2026-10-02'),
      },
    },
  ]);

  // Panggilan publik (tanpa token / caller = null)
  const publicResult = await listEducationMaterials({ limit: 10 });
  assert.equal(publicResult.items.length, 1);
  assert.equal(publicResult.items[0].id, 'edu_pub_1');
  assert.equal(publicResult.items[0].slug, 'memahami-persetujuan');

  // Panggilan reporter biasa juga tidak bisa melihat draf
  const reporterResult = await listEducationMaterials(
    { limit: 10, includeDrafts: true },
    CALLER_REPORTER_1,
  );
  assert.equal(reporterResult.items.length, 1);
  assert.equal(reporterResult.items[0].id, 'edu_pub_1');
});

test('EDU-03: Admin dapat melihat seluruh materi termasuk draf bila includeDrafts = true', async () => {
  seedMockDocs([
    {
      path: 'education/edu_1',
      data: {
        title: 'Artikel Published',
        isPublished: true,
        sortOrder: 1,
      },
    },
    {
      path: 'education/edu_2',
      data: {
        title: 'Artikel Draf',
        isPublished: false,
        sortOrder: 2,
      },
    },
  ]);

  const adminResult = await listEducationMaterials(
    { limit: 10, includeDrafts: true },
    CALLER_ADMIN,
  );
  assert.equal(adminResult.items.length, 2);
});

test('EDU-04 & EDU-05: Detail materi dapat diakses via ID atau Slug; draf mengembalikan 404 bagi non-admin', async () => {
  seedMockDocs([
    {
      path: 'education/edu_doc_10',
      data: {
        title: 'Mengenali Batasan Diri',
        slug: 'mengenali-batasan-diri',
        tag: 'Diri',
        category: 'general',
        icon: 'alert',
        excerpt: 'Ringkasan batasan diri.',
        content: 'Isi lengkap batasan diri.',
        isPublished: true,
      },
    },
    {
      path: 'education/edu_draft_20',
      data: {
        title: 'Materi Rahasia',
        slug: 'materi-rahasia',
        isPublished: false,
      },
    },
  ]);

  // Cari via Slug
  const bySlug = await getEducationDetail('mengenali-batasan-diri');
  assert.equal(bySlug.id, 'edu_doc_10');
  assert.equal(bySlug.title, 'Mengenali Batasan Diri');

  // Cari via Document ID
  const byId = await getEducationDetail('edu_doc_10');
  assert.equal(byId.slug, 'mengenali-batasan-diri');

  // Akses draf oleh publik -> harus 404 Not Found (Anti-Leak)
  await assert.rejects(
    async () => await getEducationDetail('materi-rahasia', null),
    (err) => err instanceof ApiError && err.status === 404,
  );

  // Akses draf oleh Admin -> Berhasil
  const adminDetail = await getEducationDetail('materi-rahasia', CALLER_ADMIN);
  assert.equal(adminDetail.id, 'edu_draft_20');
});

test('EDU-06: Admin dapat membuat materi edukasi baru dengan auto-slug dan pencatatan audit log', async () => {
  const created = await createEducationMaterial(
    CALLER_ADMIN,
    {
      title: 'Pilihan Layanan Pendampingan',
      tag: 'Dukungan',
      category: 'guide',
      icon: 'users',
      excerpt: 'Materi pendampingan psikologis dan hukum.',
      content: 'Panduan lengkap mengenai unit layanan...',
      readingTimeMinutes: 5,
      isPublished: true,
      sortOrder: 1,
    },
    'req_edu_create_01',
  );

  assert.ok(created.id);
  assert.equal(created.slug, 'pilihan-layanan-pendampingan');
  assert.equal(created.title, 'Pilihan Layanan Pendampingan');

  // Verifikasi tersimpan di database
  const docInDb = getMockDoc(`education/${created.id}`);
  assert.ok(docInDb);
  assert.equal(docInDb.slug, 'pilihan-layanan-pendampingan');

  // Verifikasi audit event tercatat
  const auditEvents = listMockCollectionDocs('auditEvents');
  const matchingAudit = auditEvents.find(
    (e) => e.data.action === 'education.created' && e.data.targetId === created.id,
  );
  assert.ok(matchingAudit, 'Audit event education.created wajib tercatat');
});

test('EDU-07: Non-admin ditolak saat mencoba membuat atau memodifikasi materi edukasi (403 Forbidden)', async () => {
  await assert.rejects(
    async () =>
      await createEducationMaterial(
        CALLER_REPORTER_1,
        {
          title: 'Ilegal Post',
          tag: 'Test',
          category: 'general',
          icon: 'heart',
          excerpt: 'Test',
          content: 'Test content',
        },
        'req_bad_01',
      ),
    (err) => err instanceof ApiError && err.status === 403,
  );
});

test('EDU-08 & EDU-09: Admin dapat memperbarui dan menghapus materi edukasi beserta audit log', async () => {
  seedMockDocs([
    {
      path: 'education/edu_mod_1',
      data: {
        title: 'Judul Asli',
        slug: 'judul-asli',
        tag: 'Tag Lama',
        category: 'general',
        icon: 'heart',
        excerpt: 'Ringkasan lama',
        content: 'Isi lama',
        isPublished: true,
      },
    },
  ]);

  // Update
  const updated = await updateEducationMaterial(
    CALLER_ADMIN,
    'edu_mod_1',
    {
      title: 'Judul Diperbarui',
      excerpt: 'Ringkasan baru',
    },
    'req_edu_update_01',
  );

  assert.equal(updated.title, 'Judul Diperbarui');
  assert.equal(updated.excerpt, 'Ringkasan baru');

  // Delete
  const deleted = await deleteEducationMaterial(
    CALLER_ADMIN,
    'edu_mod_1',
    'req_edu_delete_01',
  );
  assert.equal(deleted.deleted, true);

  const docAfterDelete = getMockDoc('education/edu_mod_1');
  assert.equal(docAfterDelete, null);
});

// ── 2. Suite Pengujian API Notifikasi (/notifications) ───────────────────────

test('NOTIF-01 & NOTIF-02: Notifikasi terisolasi per akun pengguna (Anti-IDOR)', async () => {
  seedMockDocs([
    {
      path: `users/${CALLER_REPORTER_1.uid}/notifications/notif_rep1_a`,
      data: {
        recipientUid: CALLER_REPORTER_1.uid,
        type: 'report_status_changed',
        title: 'Status Laporan',
        body: 'Status laporan diperbarui.',
        isRead: false,
        createdAt: new Date('2026-10-10T10:00:00Z'),
      },
    },
    {
      path: `users/${CALLER_REPORTER_2.uid}/notifications/notif_rep2_a`,
      data: {
        recipientUid: CALLER_REPORTER_2.uid,
        type: 'new_chat_message',
        title: 'Pesan Baru',
        body: 'Pesan dari admin.',
        isRead: false,
        createdAt: new Date('2026-10-10T11:00:00Z'),
      },
    },
  ]);

  // Reporter 1 hanya melihat notifikasinya sendiri
  const list1 = await listUserNotifications(CALLER_REPORTER_1, { limit: 10 });
  assert.equal(list1.items.length, 1);
  assert.equal(list1.items[0].id, 'notif_rep1_a');

  // Reporter 2 hanya melihat notifikasinya sendiri
  const list2 = await listUserNotifications(CALLER_REPORTER_2, { limit: 10 });
  assert.equal(list2.items.length, 1);
  assert.equal(list2.items[0].id, 'notif_rep2_a');
});

test('NOTIF-03: Counter notifikasi belum dibaca (unreadCount) akurat', async () => {
  seedMockDocs([
    {
      path: `users/${CALLER_REPORTER_1.uid}/notifications/notif_1`,
      data: { isRead: false, targetType: 'report' },
    },
    {
      path: `users/${CALLER_REPORTER_1.uid}/notifications/notif_2`,
      data: { isRead: false, targetType: 'conversation' },
    },
    {
      path: `users/${CALLER_REPORTER_1.uid}/notifications/notif_3`,
      data: { isRead: true },
    },
  ]);

  const countResult = await getUnreadNotificationCount(CALLER_REPORTER_1);
  assert.equal(countResult.unreadCount, 2);
  assert.equal(countResult.unreadReportCount, 1);
  assert.equal(countResult.unreadConversationCount, 1);
});

test('NOTIF-04 & NOTIF-05: Menandai notifikasi sebagai terbaca & proteksi Anti-IDOR (404)', async () => {
  seedMockDocs([
    {
      path: `users/${CALLER_REPORTER_1.uid}/notifications/notif_target`,
      data: {
        recipientUid: CALLER_REPORTER_1.uid,
        isRead: false,
        readAt: null,
      },
    },
  ]);

  // Reporter 1 menandai notifikasinya sendiri -> Berhasil
  const updated = await markNotificationAsRead(CALLER_REPORTER_1, 'notif_target');
  assert.equal(updated.isRead, true);
  assert.ok(updated.readAt);

  // Reporter 2 mencoba menandai notifikasi Reporter 1 -> Ditolak 404 Not Found
  await assert.rejects(
    async () => await markNotificationAsRead(CALLER_REPORTER_2, 'notif_target'),
    (err) => err instanceof ApiError && err.status === 404,
  );
});

test('NOTIF-06: Menandai seluruh notifikasi sebagai terbaca (markAllNotificationsAsRead)', async () => {
  seedMockDocs([
    {
      path: `users/${CALLER_REPORTER_1.uid}/notifications/n1`,
      data: { isRead: false },
    },
    {
      path: `users/${CALLER_REPORTER_1.uid}/notifications/n2`,
      data: { isRead: false },
    },
  ]);

  const result = await markAllNotificationsAsRead(CALLER_REPORTER_1);
  assert.equal(result.markedCount, 2);

  const countAfter = await getUnreadNotificationCount(CALLER_REPORTER_1);
  assert.equal(countAfter.unreadCount, 0);
});

test('NOTIF-07: Admin Broadcast dapat mengirim notifikasi serentak ke seluruh pelapor', async () => {
  seedMockDocs([
    {
      path: 'users/reporter_test_1',
      data: { role: 'reporter', displayName: 'Pelapor A' },
    },
    {
      path: 'users/reporter_test_2',
      data: { role: 'reporter', displayName: 'Pelapor B' },
    },
    {
      path: 'users/admin_test_1',
      data: { role: 'admin', displayName: 'Admin' },
    },
  ]);

  const broadcastResult = await broadcastNotificationByAdmin(
    CALLER_ADMIN,
    {
      title: 'Pemeliharaan Sistem Kampus',
      body: 'Layanan SISKA akan mengalami pemeliharaan pada Minggu malam.',
      targetRole: 'reporter',
    },
    'req_broadcast_01',
  );

  assert.equal(broadcastResult.sentCount, 2);

  // Pastikan notifikasi tersimpan di kedua akun reporter
  const notifsRep1 = listMockCollectionDocs(`users/${CALLER_REPORTER_1.uid}/notifications`);
  const notifsRep2 = listMockCollectionDocs(`users/${CALLER_REPORTER_2.uid}/notifications`);
  assert.equal(notifsRep1.length, 1);
  assert.equal(notifsRep2.length, 1);
  assert.equal(notifsRep1[0].data.title, 'Pemeliharaan Sistem Kampus');
});

test('NOTIF-08: Transisi status laporan secara otomatis memicu pembuatan notifikasi bagi pelapor', async () => {
  seedMockDocs([
    {
      path: 'reports/rpt_auto_notif',
      data: {
        reporterId: CALLER_REPORTER_1.uid,
        category: 'Pelecehan',
        description: 'Uji integrasi notifikasi',
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  ]);

  await updateReportStatus(
    CALLER_ADMIN,
    'rpt_auto_notif',
    { status: 'under_review' },
    'req_status_notif_01',
  );

  // Cek apakah reporter menerima notifikasi
  const notifs = listMockCollectionDocs(`users/${CALLER_REPORTER_1.uid}/notifications`);
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].data.type, 'report_status_changed');
  assert.equal(notifs[0].data.targetId, 'rpt_auto_notif');
  assert.match(notifs[0].data.body, /Dalam peninjauan/);
});

test('NOTIF-09: Target notifikasi harus diarahkan ke halaman yang sesuai per jenis event', async () => {
  const { resolveNotificationTarget } = await import('@/lib/notification-targets');

  assert.deepEqual(resolveNotificationTarget('report', 'rpt_123', 'reporter'), {
    href: '/user/reports',
    query: { reportId: 'rpt_123' },
    label: 'Lihat laporan',
  });

  assert.deepEqual(resolveNotificationTarget('conversation', 'conv_123', 'admin'), {
    href: '/admin/chat',
    query: { conversationId: 'conv_123' },
    label: 'Buka percakapan',
  });

  assert.deepEqual(resolveNotificationTarget('education', 'edu_123', 'reporter'), {
    href: '/education/detail/edu_123',
    query: null,
    label: 'Buka edukasi',
  });

  assert.deepEqual(resolveNotificationTarget('none', null, 'reporter'), {
    href: '/user',
    query: null,
    label: 'Lihat detail',
  });
});
