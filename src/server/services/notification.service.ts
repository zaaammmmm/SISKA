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
} from '@/server/validators/notification.validator';
import type {
  BroadcastNotificationResult,
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
 * Menghitung jumlah notifikasi yang belum dibaca untuk badge lonceng topbar.
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

  return {
    unreadCount: snapshot.docs.length,
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
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      isRead: true,
      readAt: now,
    });
  }

  await batch.commit();

  return { markedCount: snapshot.docs.length };
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
