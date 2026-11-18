// Layanan Domain Notifikasi

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

// Serialisasi Dokumen Notifikasi
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

// Pembuatan Notifikasi Baru
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

// Daftar Notifikasi Pengguna
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

// Hitung Notifikasi Belum Dibaca
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

// Tandai Satu Terbaca
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

// Tandai Semua Terbaca
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
  const conversationIds = new Set<string>();
  for (const doc of snapshot.docs) {
    const data = doc.data() ?? {};
    if (data.targetType === 'conversation' && typeof data.targetId === 'string' && data.targetId) {
      conversationIds.add(data.targetId);
    }
  }

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

// Tandai Terbaca Berdasarkan Target
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

// Broadcast Notifikasi Admin
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
