/**
 * SISKA — In-App Notification Domain Service (`NotificationService`)
 * Sumber otoritas:
 * - docs/05-BACKEND-ARCHITECTURE.md §2.3, §4 (Request Flow), §8 (Error Contract)
 * - docs/07-FRONTEND-ARCHITECTURE.md §6 ("Mask sensitive content in notifications")
 * - docs/08-AUTHORIZATION-MATRIX.md (Self-only access, Admin broadcast)
 */

import type {
  DocumentData,
  Query,
  Transaction,
  WriteBatch,
} from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { toIsoDateString, toIsoStringOrNull } from '@/lib/firebase/firestore';
import { requireAdmin, requireRole } from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { ApiError } from '@/server/errors/api-error';
import { recordAuditEvent } from '@/server/services/audit.service';
import type {
  BroadcastNotificationInput,
  ListNotificationsQuery,
  MarkReadByTargetInput,
} from '@/server/validators/notification.validator';
import type {
  BroadcastNotificationResult,
  MarkNotificationsByTargetResult,
  PaginatedNotificationsResult,
  SerializedNotificationItem,
  UnreadNotificationCountResult,
} from '@/types/api';
import type {
  NotificationDocument,
  NotificationTargetType,
  NotificationType,
} from '@/types/domain';

function serializeNotificationDoc(
  id: string,
  data: DocumentData,
): SerializedNotificationItem {
  return {
    id,
    recipientUid: String(data.recipientUid ?? ''),
    type: (data.type as NotificationType) ?? 'system_announcement',
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    targetType: (data.targetType as NotificationTargetType) ?? 'none',
    targetId: typeof data.targetId === 'string' ? data.targetId : null,
    isRead: Boolean(data.isRead),
    readAt: toIsoStringOrNull(data.readAt),
    createdAt: toIsoDateString(data.createdAt),
  };
}

export interface CreateNotificationParams {
  recipientUid: string;
  type: NotificationType;
  title: string;
  body: string;
  targetType?: NotificationTargetType;
  targetId?: string | null;
  senderUid?: string | null;
  batch?: WriteBatch;
  transaction?: Transaction;
}

/**
 * Menyuntikkan notifikasi ke sub-koleksi `users/{recipientUid}/notifications/{id}`.
 * Dapat dieksekusi secara mandiri atau disematkan ke dalam Transaction/WriteBatch service lain.
 */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<SerializedNotificationItem> {
  const db = getAdminDb();
  const now = new Date();

  const docRef = db
    .collection('users')
    .doc(params.recipientUid)
    .collection('notifications')
    .doc();

  const docData: NotificationDocument = {
    recipientUid: params.recipientUid,
    type: params.type,
    title: params.title,
    body: params.body,
    targetType: params.targetType ?? 'none',
    targetId: params.targetId ?? null,
    senderUid: params.senderUid ?? null,
    isRead: false,
    readAt: null,
    createdAt: now,
  };

  if (params.transaction) {
    params.transaction.set(docRef, docData);
  } else if (params.batch) {
    params.batch.set(docRef, docData);
  } else {
    await docRef.set(docData);
  }

  return serializeNotificationDoc(docRef.id, docData);
}

/**
 * Mengambil daftar notifikasi milik pengguna yang sedang login (`GET /api/v1/notifications`).
 * Dilengkapi paginasi cursor dan filter unreadOnly.
 */
export async function listUserNotifications(
  caller: AuthenticatedCaller,
  query: ListNotificationsQuery,
): Promise<PaginatedNotificationsResult> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();

  let fsQuery: Query = db
    .collection('users')
    .doc(authorized.uid)
    .collection('notifications');

  if (query.unreadOnly) {
    fsQuery = fsQuery.where('isRead', '==', false);
  }

  fsQuery = fsQuery.orderBy('createdAt', 'desc');

  if (query.cursor) {
    const cursorSnap = await db
      .collection('users')
      .doc(authorized.uid)
      .collection('notifications')
      .doc(query.cursor)
      .get();

    if (!cursorSnap.exists) {
      const msg = "Parameter 'cursor' tidak valid.";
      throw ApiError.validation(msg, { cursor: msg });
    }
    fsQuery = fsQuery.startAfter(cursorSnap);
  }

  const snapshot = await fsQuery.limit(query.limit + 1).get();
  const hasMore = snapshot.docs.length > query.limit;
  const pageDocs = hasMore ? snapshot.docs.slice(0, query.limit) : snapshot.docs;

  const items = pageDocs.map((doc) =>
    serializeNotificationDoc(doc.id, doc.data()),
  );
  const nextCursor =
    hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

  return {
    items,
    nextCursor,
  };
}

/**
 * Menghitung badge notifikasi yang belum dibaca (lonceng topbar + badge sidebar).
 *
 * Hitungan DIDEDUPLIKASI per sumber, bukan per dokumen notifikasi:
 * - laporan   : 1 per laporan berbeda (status berubah 3x di laporan yang sama = 1).
 * - percakapan: 1 per PENGGUNA berbeda (pelapor dengan 20 pesan belum dibaca = 1).
 * - lainnya   : 1 per notifikasi (pengumuman, dsb.).
 */
export async function getUnreadNotificationCount(
  caller: AuthenticatedCaller,
): Promise<UnreadNotificationCountResult> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();

  const snapshot = await db
    .collection('users')
    .doc(authorized.uid)
    .collection('notifications')
    .where('isRead', '==', false)
    .get();

  const reportTargets = new Set<string>();
  const chatSources = new Set<string>();
  let otherCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() ?? {};
    const targetId = typeof data.targetId === 'string' && data.targetId ? data.targetId : null;

    if (data.targetType === 'report') {
      // Tanpa targetId tetap terhitung (per notifikasi) agar tidak hilang dari badge.
      reportTargets.add(targetId ?? `notif:${doc.id}`);
    } else if (data.targetType === 'conversation') {
      const senderUid =
        typeof data.senderUid === 'string' && data.senderUid ? data.senderUid : null;
      // Notifikasi lama tanpa senderUid dihitung per percakapan.
      chatSources.add(senderUid ? `user:${senderUid}` : `conv:${targetId ?? doc.id}`);
    } else {
      otherCount += 1;
    }
  }

  return {
    unreadCount: reportTargets.size + chatSources.size + otherCount,
    unreadReportCount: reportTargets.size,
    unreadConversationCount: chatSources.size,
  };
}

/**
 * Menandai satu notifikasi sebagai telah dibaca (`PATCH /api/v1/notifications/{id}/read`).
 * Proteksi Anti-IDOR: Jika bukan milik pemanggil, selalu return 404.
 */
export async function markNotificationAsRead(
  caller: AuthenticatedCaller,
  notificationId: string,
): Promise<SerializedNotificationItem> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();

  const docRef = db
    .collection('users')
    .doc(authorized.uid)
    .collection('notifications')
    .doc(notificationId);

  const snap = await docRef.get();
  if (!snap.exists) {
    throw ApiError.notFound('Notifikasi tidak ditemukan.');
  }

  const now = new Date();
  await docRef.update({
    isRead: true,
    readAt: now,
  });

  const updatedData = {
    ...snap.data(),
    isRead: true,
    readAt: now,
  };

  return serializeNotificationDoc(notificationId, updatedData);
}

/**
 * Menandai seluruh notifikasi milik pemanggil sebagai telah dibaca (`PATCH /api/v1/notifications/read-all`).
 */
export async function markAllNotificationsAsRead(
  caller: AuthenticatedCaller,
): Promise<{ markedCount: number }> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();

  const snapshot = await db
    .collection('users')
    .doc(authorized.uid)
    .collection('notifications')
    .where('isRead', '==', false)
    .get();

  if (snapshot.empty) {
    return { markedCount: 0 };
  }

  const now = new Date();

  // Chat yang ikut ditandai dibaca harus ikut menggeser receipt percakapan; kalau tidak,
  // daftar chat masih menampilkan "N belum dibaca" padahal lonceng sudah 0.
  const conversationIds = new Set<string>();
  for (const doc of snapshot.docs) {
    const data = doc.data() ?? {};
    if (data.targetType === 'conversation' && typeof data.targetId === 'string' && data.targetId) {
      conversationIds.add(data.targetId);
    }
  }

  // Firestore membatasi maksimal 500 operasi per batch. Pecah menjadi
  // chunk 400 agar mark-all tetap berhasil untuk akun dengan notifikasi banyak.
  const CHUNK_SIZE = 400;
  for (let i = 0; i < snapshot.docs.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    for (const doc of snapshot.docs.slice(i, i + CHUNK_SIZE)) {
      batch.update(doc.ref, {
        isRead: true,
        readAt: now,
      });
    }
    await batch.commit();
  }

  const receiptIds = Array.from(conversationIds);
  for (let i = 0; i < receiptIds.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    for (const conversationId of receiptIds.slice(i, i + CHUNK_SIZE)) {
      batch.set(
        db.collection('conversations').doc(conversationId)
          .collection('readReceipts').doc(authorized.uid),
        { uid: authorized.uid, readAt: now, updatedAt: now },
      );
    }
    await batch.commit();
  }

  return { markedCount: snapshot.docs.length };
}

/**
 * Menandai semua notifikasi belum dibaca untuk satu target sebagai dibaca
 * (`PATCH /api/v1/notifications/read-by-target`).
 * Dipanggil saat pengguna melakukan aksi langsung, mis. membuka detail laporan,
 * sehingga badge turun tanpa harus membuka lonceng. Hanya menyentuh notifikasi milik caller.
 */
export async function markNotificationsReadByTarget(
  caller: AuthenticatedCaller,
  input: MarkReadByTargetInput,
): Promise<MarkNotificationsByTargetResult> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();

  const snapshot = await db
    .collection('users')
    .doc(authorized.uid)
    .collection('notifications')
    .where('targetId', '==', input.targetId)
    .get();

  const unread = snapshot.docs.filter(
    (doc) => {
      const data = doc.data() ?? {};
      return data.targetType === input.targetType && data.isRead === false;
    },
  );
  if (unread.length === 0) return { markedCount: 0 };

  const now = new Date();
  const CHUNK_SIZE = 400;
  for (let i = 0; i < unread.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    for (const doc of unread.slice(i, i + CHUNK_SIZE)) {
      batch.update(doc.ref, { isRead: true, readAt: now });
    }
    await batch.commit();
  }

  return { markedCount: unread.length };
}

/**
 * Mengirim notifikasi serentak (broadcast) ke seluruh pelapor atau seluruh pengguna (Hanya Admin).
 */
export async function broadcastNotificationByAdmin(
  caller: AuthenticatedCaller,
  input: BroadcastNotificationInput,
  requestId: string,
): Promise<BroadcastNotificationResult> {
  const admin = requireAdmin(caller);
  const db = getAdminDb();
  const now = new Date();

  let usersQuery: Query = db.collection('users');
  if (input.targetRole !== 'all') {
    usersQuery = usersQuery.where('role', '==', 'reporter');
  }

  const userSnapshots = await usersQuery.get();
  if (userSnapshots.empty) {
    return {
      sentCount: 0,
      targetRole: input.targetRole ?? 'reporter',
      requestId,
    };
  }

  const docDataTemplate: Omit<NotificationDocument, 'recipientUid'> = {
    type: 'system_announcement',
    title: input.title,
    body: input.body,
    targetType: input.targetType ?? 'none',
    targetId: input.targetId ?? null,
    isRead: false,
    readAt: null,
    createdAt: now,
  };

  // Batasi batch Firestore per 400 operasi (batas aman Firestore adalah 500)
  const CHUNK_SIZE = 400;
  const userDocs = userSnapshots.docs;

  for (let i = 0; i < userDocs.length; i += CHUNK_SIZE) {
    const chunk = userDocs.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    for (const uDoc of chunk) {
      const notifRef = db
        .collection('users')
        .doc(uDoc.id)
        .collection('notifications')
        .doc();

      batch.set(notifRef, {
        ...docDataTemplate,
        recipientUid: uDoc.id,
      });
    }

    await batch.commit();
  }

  await recordAuditEvent({
    actorUid: admin.uid,
    action: 'notification.broadcast',
    targetType: 'notification',
    targetId: 'broadcast_all',
    requestId,
    occurredAt: now,
  });

  return {
    sentCount: userDocs.length,
    targetRole: input.targetRole ?? 'reporter',
    requestId,
  };
}
