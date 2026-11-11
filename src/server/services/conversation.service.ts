/**
 * SISKA — Conversation & Message Domain Service (`ConversationService`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-010
 * - docs/02-ERD.md §2, §4 (`conversations`, `messages`)
 * - docs/04-API-SPEC.yaml (/conversations, /conversations/{conversationId}/messages)
 * - docs/08-AUTHORIZATION-MATRIX.md
 * - docs/09-TEST-PLAN.md CHAT-01, CHAT-02, CHAT-03
 */

import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { toIsoDateString } from '@/lib/firebase/firestore';
import {
  assertCanAccessConversation,
  assertCanReadReport,
  requireAdmin,
  requireRole,
  resolveConversationAdminId,
  resolveConversationReporterId,
} from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { ApiError } from '@/server/errors/api-error';
import { recordAuditEventInTransaction } from '@/server/services/audit.service';
import type { PaginationParams } from '@/server/validators/common';
import type {
  CreateConversationInput,
  SendMessageInput,
  UpdateConversationAdminInput,
} from '@/server/validators/conversation.validator';
import type {
  PaginatedConversationsResult,
  PaginatedMessagesResult,
  SerializedConversation,
  SerializedMessage,
} from '@/types/api';
import type {
  ConversationDocument,
  ConversationStatus,
  MessageDocument,
  ReportDocument,
} from '@/types/domain';

export type {
  PaginatedConversationsResult,
  PaginatedMessagesResult,
  SerializedConversation,
  SerializedMessage,
};

function serializeConversationDoc(
  id: string,
  data: DocumentData,
): SerializedConversation {
  const reporterId = resolveConversationReporterId(data);
  const assignedAdminId = resolveConversationAdminId(data);
  return {
    id,
    type: 'report_admin',
    reporterId,
    reporterUid: reporterId,
    assignedAdminId,
    adminUid: assignedAdminId,
    reportId: typeof data.reportId === 'string' ? data.reportId : null,
    status: (data.status as ConversationStatus) ?? 'open',
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt),
    lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : null,
    lastMessageSenderUid:
      typeof data.lastMessageSenderUid === 'string' ? data.lastMessageSenderUid : null,
    lastMessageAt: data.lastMessageAt ? toIsoDateString(data.lastMessageAt) : null,
    unreadCount: Number.isInteger(data.unreadCount) ? data.unreadCount : 0,
  };
}

function serializeMessageDoc(id: string, data: DocumentData): SerializedMessage {
  return {
    id,
    senderUid: String(data.senderUid ?? ''),
    body: String(data.body ?? ''),
    createdAt: toIsoDateString(data.createdAt),
    attachmentPath:
      typeof data.attachmentPath === 'string' ? data.attachmentPath : null,
    readByRecipient: data.readByRecipient === true,
  };
}

/**
 * Menghitung pesan masuk yang belum dibaca berdasarkan receipt per UID.
 * Receipt disimpan di conversations/{id}/readReceipts/{uid}, sehingga status baca
 * admin yang berbeda tidak saling memengaruhi pada percakapan yang belum ditugaskan.
 */
async function getUnreadMessageCount(
  conversationId: string,
  uid: string,
): Promise<number> {
  const db = getAdminDb();
  const conversationRef = db.collection('conversations').doc(conversationId);
  const receiptSnap = await conversationRef.collection('readReceipts').doc(uid).get();
  const readAt = receiptSnap.exists ? receiptSnap.get('readAt') : null;
  const messagesRef = conversationRef.collection('messages');
  let query = messagesRef.orderBy('createdAt', 'asc');
  if (readAt) query = query.startAfter(readAt);
  const snapshot = await query.get();
  return snapshot.docs.filter((doc) => doc.get('senderUid') !== uid).length;
}

/**
 * Mengambil daftar percakapan (`GET /api/v1/conversations`) dengan amplop standar `{ items, nextCursor }`.
 * - Reporter hanya melihat percakapan miliknya (`reporterId == caller.uid`).
 * - Admin melihat percakapan yang ditugaskan kepadanya (`assignedAdminId == caller.uid`)
 *   serta percakapan yang belum ditugaskan (`assignedAdminId == null`).
 */
export async function listConversations(
  caller: AuthenticatedCaller,
): Promise<PaginatedConversationsResult> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();

  if (authorized.role === 'reporter') {
    const snap = await db
      .collection('conversations')
      .where('reporterId', '==', authorized.uid)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const items = await Promise.all(snap.docs.map(async (doc) => ({
      ...serializeConversationDoc(doc.id, doc.data()),
      unreadCount: await getUnreadMessageCount(doc.id, authorized.uid),
    })));
    return { items, nextCursor: null };
  }

  // Untuk Admin: ambil percakapan yang ditugaskan ke admin ini + percakapan belum ditugaskan
  const [assignedSnap, unassignedSnap] = await Promise.all([
    db
      .collection('conversations')
      .where('assignedAdminId', '==', authorized.uid)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get(),
    db
      .collection('conversations')
      .where('assignedAdminId', '==', null)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get(),
  ]);

  const combined = new Map<string, SerializedConversation>();
  for (const doc of [...assignedSnap.docs, ...unassignedSnap.docs]) {
    combined.set(doc.id, serializeConversationDoc(doc.id, doc.data()));
  }

  const sorted = Array.from(combined.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  const items = await Promise.all(sorted.map(async (conversation) => ({
    ...conversation,
    unreadCount: await getUnreadMessageCount(conversation.id, authorized.uid),
  })));
  return { items, nextCursor: null };
}

/**
 * Membuka atau membuat percakapan baru secara atomik (`POST /api/v1/conversations`).
 * - Berjalan di dalam satu Firestore Transaction (`db.runTransaction`) dengan ID dokumen deterministik
 *   untuk mencegah *race condition* (percakapan ganda saat terjadi request konkuren).
 * - Hanya `reporter` yang dapat menginisiasi percakapan miliknya (atau terkait laporan miliknya).
 */
export async function createOrOpenConversation(
  caller: AuthenticatedCaller,
  input: CreateConversationInput,
): Promise<{ conversation: SerializedConversation; created: boolean }> {
  const authorized = requireRole(caller, ['reporter']);
  const db = getAdminDb();

  const targetReportId = input.reportId ?? null;
  const deterministicConvId = targetReportId
    ? `conv_${authorized.uid}_${targetReportId}`
    : `conv_${authorized.uid}_general`;
  const deterministicConvRef = db
    .collection('conversations')
    .doc(deterministicConvId);

  const existingQuery = db
    .collection('conversations')
    .where('reporterId', '==', authorized.uid)
    .orderBy('updatedAt', 'desc')
    .limit(25);

  return db.runTransaction(async (tx) => {
    if (targetReportId) {
      const reportRef = db.collection('reports').doc(targetReportId);
      const reportSnap = await tx.get(reportRef);
      const reportData = reportSnap.exists
        ? (reportSnap.data() as ReportDocument)
        : null;
      assertCanReadReport(authorized, reportData);
    }

    const [deterministicSnap, existingSnap] = await Promise.all([
      tx.get(deterministicConvRef),
      tx.get(existingQuery),
    ]);

    if (deterministicSnap.exists) {
      const detData = deterministicSnap.data() as ConversationDocument;
      if (detData.status === 'open') {
        return {
          conversation: serializeConversationDoc(
            deterministicSnap.id,
            detData,
          ),
          created: false,
        };
      }
    }

    const matchingOpen = existingSnap.docs.find((doc) => {
      const d = doc.data() as ConversationDocument;
      return d.status === 'open' && (d.reportId ?? null) === targetReportId;
    });

    if (matchingOpen) {
      return {
        conversation: serializeConversationDoc(
          matchingOpen.id,
          matchingOpen.data(),
        ),
        created: false,
      };
    }

    const now = new Date();
    const targetRef = deterministicSnap.exists
      ? db.collection('conversations').doc()
      : deterministicConvRef;

    const convData: ConversationDocument = {
      type: 'report_admin',
      reporterId: authorized.uid,
      assignedAdminId: null,
      reportId: targetReportId,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    tx.create(targetRef, convData);

    return {
      conversation: serializeConversationDoc(targetRef.id, convData),
      created: true,
    };
  });
}

/**
 * Mengambil daftar pesan dalam suatu percakapan (`GET /api/v1/conversations/{conversationId}/messages`).
 * Menegakkan `assertCanAccessConversation(caller, convData, 'read')` (CHAT-02 — 404 anti-IDOR).
 */
export async function listMessages(
  caller: AuthenticatedCaller,
  conversationId: string,
  pagination: PaginationParams,
): Promise<PaginatedMessagesResult> {
  const db = getAdminDb();
  const convRef = db.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();

  const convData = convSnap.exists
    ? (convSnap.data() as ConversationDocument)
    : null;

  assertCanAccessConversation(caller, convData, 'read');

  let msgQuery = convRef.collection('messages').orderBy('createdAt', 'asc');

  if (pagination.cursor) {
    const cursorSnap = await convRef
      .collection('messages')
      .doc(pagination.cursor)
      .get();
    if (!cursorSnap.exists) {
      const msg = "Parameter 'cursor' pesan tidak valid.";
      throw ApiError.validation(msg, { cursor: msg });
    }
    msgQuery = msgQuery.startAfter(cursorSnap);
  }

  const snapshot = await msgQuery.limit(pagination.limit + 1).get();
  const hasMore = snapshot.docs.length > pagination.limit;
  const pageDocs = hasMore
    ? snapshot.docs.slice(0, pagination.limit)
    : snapshot.docs;

  const conversation = convData as ConversationDocument;
  const recipientUid = caller.role === 'reporter'
    ? resolveConversationAdminId(conversation)
    : resolveConversationReporterId(conversation);
  const receiptSnapshots = recipientUid
    ? [await convRef.collection('readReceipts').doc(recipientUid).get()]
    : caller.role === 'reporter'
      ? (await convRef.collection('readReceipts').get()).docs
      : [];
  const recipientReadTimes = receiptSnapshots
    .filter((receipt) => receipt.exists && receipt.id !== caller.uid)
    .map((receipt) => receipt.get('readAt'))
    .filter(Boolean)
    .map((value) => typeof value.toMillis === 'function'
      ? value.toMillis()
      : new Date(value).getTime());
  const items = pageDocs.map((doc) => {
    const message = serializeMessageDoc(doc.id, doc.data());
    const createdAt = doc.get('createdAt');
    const createdAtMillis = createdAt && typeof createdAt.toMillis === 'function'
      ? createdAt.toMillis()
      : new Date(createdAt).getTime();
    const readByRecipient = message.senderUid === caller.uid &&
      recipientReadTimes.some((readAt) => readAt >= createdAtMillis);
    return { ...message, readByRecipient };
  });
  const nextCursor =
    hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

  return {
    items,
    nextCursor,
  };
}

/**
 * Mengirim pesan baru pada percakapan (`POST /api/v1/conversations/{conversationId}/messages`).
 * - Menegakkan `assertCanAccessConversation` (CHAT-01, CHAT-02 — 404 anti-IDOR).
 * - Bila percakapan belum memiliki petugas (`assignedAdminId === null`) dan pengirim adalah Admin sah,
 *   secara otomatis menugaskan percakapan tersebut kepada Admin pengirim dalam satu transaksi.
 * - `senderUid` diturunkan dari token terverifikasi, tidak pernah diambil dari payload client.
 */
export async function sendMessage(
  caller: AuthenticatedCaller,
  conversationId: string,
  input: SendMessageInput,
): Promise<SerializedMessage> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();
  const convRef = db.collection('conversations').doc(conversationId);

  const createdMessage = await db.runTransaction(async (tx) => {
    const convSnap = await tx.get(convRef);
    const convData = convSnap.exists
      ? (convSnap.data() as ConversationDocument)
      : null;

    const assignedAdminId = convData ? resolveConversationAdminId(convData) : null;
    const unassignedAdminUsers = authorized.role === 'reporter' && !assignedAdminId
      ? await tx.get(db.collection('users').where('role', '==', 'admin'))
      : null;

    // Jika admin membalas percakapan yang belum ditugaskan (`assignedAdminId === null`),
    // klaim penugasan untuk admin tersebut; jika sudah ditugaskan ke admin lain atau tidak ada, assertCanAccessConversation akan menolak secara seragam (404).
    const effectiveConvData: ConversationDocument | null =
      convData && authorized.role === 'admin' && !assignedAdminId
        ? { ...convData, assignedAdminId: authorized.uid }
        : convData;

    assertCanAccessConversation(authorized, effectiveConvData, 'send');

    if (convData!.status === 'closed') {
      throw ApiError.conflict(
        'Percakapan ini telah ditutup dan tidak dapat menerima pesan baru.',
      );
    }

    const now = new Date();
    const msgRef = convRef.collection('messages').doc();
    const msgData: MessageDocument = {
      senderUid: authorized.uid,
      body: input.body,
      createdAt: now,
      attachmentPath: null,
    };

    tx.create(msgRef, msgData);
    tx.update(convRef, {
      updatedAt: now,
      // Metadata ringkas ini membuat preview daftar chat ikut realtime
      // melalui listener dokumen conversations tanpa listener tambahan per pesan.
      lastMessage: input.body.slice(0, 180),
      lastMessageSenderUid: authorized.uid,
      lastMessageAt: now,
      ...(authorized.role === 'admin' && !assignedAdminId
        ? { assignedAdminId: authorized.uid }
        : {}),
    });

    // Otomatis kirim In-App Notification kepada lawan bicara di percakapan
    const reporterId = resolveConversationReporterId(convData!);
    const recipientUid =
      authorized.role === 'reporter' ? assignedAdminId : reporterId;

    const notificationRecipients = recipientUid
      ? [recipientUid]
      : (unassignedAdminUsers?.docs ?? []).map((adminUser) => adminUser.id);
    for (const targetUid of notificationRecipients) {
      const notifRef = db.collection('users').doc(targetUid)
        .collection('notifications').doc();
      tx.set(notifRef, {
        recipientUid: targetUid,
        type: 'new_chat_message',
        title: 'Pesan Baru Diterima',
        body: 'Anda menerima pesan baru pada ruang percakapan SISKA.',
        targetType: 'conversation',
        targetId: conversationId,
        isRead: false,
        readAt: null,
        createdAt: now,
      });
    }

    return serializeMessageDoc(msgRef.id, msgData);
  });

  return createdMessage;
}

/**
 * Menandai seluruh pesan masuk pada percakapan sebagai telah dibaca untuk UID caller.
 * Receipt per pengguna menjaga isolasi status baca, termasuk chat admin yang belum ditugaskan.
 */
export async function markConversationAsRead(
  caller: AuthenticatedCaller,
  conversationId: string,
): Promise<{ conversationId: string; readAt: string }> {
  const db = getAdminDb();
  const conversationRef = db.collection('conversations').doc(conversationId);
  const conversationSnap = await conversationRef.get();
  const conversation = conversationSnap.exists
    ? conversationSnap.data() as ConversationDocument
    : null;
  assertCanAccessConversation(caller, conversation, 'read');
  const now = new Date();
  await conversationRef.collection('readReceipts').doc(caller.uid).set({
    uid: caller.uid,
    readAt: now,
    updatedAt: now,
  }, { merge: true });

  // Notifikasi untuk percakapan yang sama ikut menjadi read ketika ruang chat dibuka.
  const relatedNotifications = await db.collection('users').doc(caller.uid)
    .collection('notifications')
    .where('targetId', '==', conversationId)
    .get();
  const unreadConversationNotifications = relatedNotifications.docs.filter(
    (notification) => notification.get('targetType') === 'conversation' &&
      notification.get('isRead') === false,
  );
  for (let offset = 0; offset < unreadConversationNotifications.length; offset += 400) {
    const batch = db.batch();
    for (const notification of unreadConversationNotifications.slice(offset, offset + 400)) {
      batch.update(notification.ref, { isRead: true, readAt: now });
    }
    await batch.commit();
  }

  return { conversationId, readAt: now.toISOString() };
}

/**
 * Mengambil detail metadata suatu percakapan (`GET /api/v1/conversations/{conversationId}`).
 * Menegakkan `assertCanAccessConversation(caller, convData, 'read')` secara seragam (404 anti-IDOR).
 */
export async function getConversationById(
  caller: AuthenticatedCaller,
  conversationId: string,
): Promise<SerializedConversation> {
  const db = getAdminDb();
  const convSnap = await db.collection('conversations').doc(conversationId).get();
  const convData = convSnap.exists
    ? (convSnap.data() as ConversationDocument)
    : null;

  assertCanAccessConversation(caller, convData, 'read');

  return serializeConversationDoc(convSnap.id, convData as DocumentData);
}

/**
 * Memperbarui penugasan petugas (`assignedAdminId`) atau status (`open` | `closed`) percakapan
 * oleh Admin berwenang (`PATCH /api/v1/conversations/{conversationId}`).
 * Berjalan secara atomik di dalam Firestore Transaction dan mencatat `auditEvents` (`conversation.updated`).
 */
export async function updateConversationByAdmin(
  caller: AuthenticatedCaller,
  conversationId: string,
  input: UpdateConversationAdminInput,
  requestId: string,
): Promise<SerializedConversation> {
  const adminCaller = requireAdmin(caller);
  const db = getAdminDb();
  const convRef = db.collection('conversations').doc(conversationId);

  return db.runTransaction(async (tx) => {
    const convSnap = await tx.get(convRef);
    const convData = convSnap.exists
      ? (convSnap.data() as ConversationDocument)
      : null;

    assertCanAccessConversation(adminCaller, convData, 'read');

    const now = new Date();
    const nextAssignedAdminId =
      input.assignedAdminId !== undefined
        ? input.assignedAdminId
        : resolveConversationAdminId(convData!);
    const nextStatus: ConversationStatus =
      input.status !== undefined ? input.status : convData!.status;

    tx.update(convRef, {
      assignedAdminId: nextAssignedAdminId,
      status: nextStatus,
      updatedAt: now,
    });

    recordAuditEventInTransaction(tx, {
      actorUid: adminCaller.uid,
      action: 'conversation.updated',
      targetType: 'conversation',
      targetId: conversationId,
      requestId,
      occurredAt: now,
    });

    return serializeConversationDoc(conversationId, {
      ...convData,
      assignedAdminId: nextAssignedAdminId,
      status: nextStatus,
      updatedAt: now,
    });
  });
}
