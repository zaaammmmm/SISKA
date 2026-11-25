// Layanan Domain Percakapan

import type { DocumentData } from 'firebase-admin/firestore';
import {
  buildCloudinarySignedDownloadUrl,
  deleteFromCloudinary,
  resolveActiveStorageProvider,
  uploadBytesToCloudinary,
} from '@/lib/cloudinary';
import {
  getAdminBucket,
  getAdminDb,
  isFirebaseEmulatorMode,
  resolveAdminConfig,
} from '@/lib/firebase/admin';
import { toIsoDateString, toIsoStringOrNull } from '@/lib/firebase/firestore';
import {
  INDISTINGUISHABLE_NOT_FOUND_MESSAGE,
  assertCanAccessConversation,
  assertCanReadReport,
  requireAdmin,
  requireRole,
  resolveConversationAdminId,
  resolveConversationReporterId,
} from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import {
  decryptText,
  encryptText,
  isEncryptedPayload,
} from '@/server/crypto/encryption';
import { ApiError } from '@/server/errors/api-error';
import {
  recordAuditEvent,
  recordAuditEventInTransaction,
} from '@/server/services/audit.service';
import type { PaginationParams } from '@/server/validators/common';
import type {
  CreateConversationInput,
  SendMessageInput,
  UpdateConversationAdminInput,
} from '@/server/validators/conversation.validator';
import { extensionForEvidenceType } from '@/server/validators/evidence.validator';
import type {
  PaginatedConversationsResult,
  PaginatedMessagesResult,
  SerializedConversation,
  SerializedMessage,
  SignedDownloadUrlResult,
} from '@/types/api';
import {
  EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
  type ConversationDocument,
  type ConversationStatus,
  type MessageDocument,
  type ReportDocument,
} from '@/types/domain';

export type {
  PaginatedConversationsResult,
  PaginatedMessagesResult,
  SerializedConversation,
  SerializedMessage,
};

function resolveEncryptedText(value: unknown, fieldLabel: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (isEncryptedPayload(value)) {
    return decryptText(value);
  }
  if (typeof value === 'string') {
    // Fallback kompatibel untuk data lama/seed yang masih tersimpan plaintext
    return value;
  }
  throw ApiError.internal(
    `Format field '${fieldLabel}' pada percakapan tidak valid.`,
    'Data percakapan tidak dapat didekripsi.',
  );
}

// Serialisasi Dokumen Percakapan
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
    lastMessage: resolveEncryptedText(data.lastMessage, 'lastMessage'),
    lastMessageSenderUid:
      typeof data.lastMessageSenderUid === 'string' ? data.lastMessageSenderUid : null,
    lastMessageAt: data.lastMessageAt ? toIsoDateString(data.lastMessageAt) : null,
    unreadCount: Number.isInteger(data.unreadCount) ? data.unreadCount : 0,
  };
}

// Serialisasi Dokumen Pesan
function serializeMessageDoc(id: string, data: DocumentData): SerializedMessage {
  return {
    id,
    senderUid: String(data.senderUid ?? ''),
    body: resolveEncryptedText(data.body, 'body') ?? '',
    createdAt: toIsoDateString(data.createdAt),
    attachmentPath:
      typeof data.attachmentPath === 'string' ? data.attachmentPath : null,
    readByRecipient: data.readByRecipient === true,
  };
}

// Hitung Pesan Belum Dibaca
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

// Daftar Percakapan Pengguna
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

// Buka atau Buat Percakapan
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

// Daftar Pesan Percakapan
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

// Pengiriman Pesan Baru
export async function sendMessage(
  caller: AuthenticatedCaller,
  conversationId: string,
  input: SendMessageInput,
): Promise<SerializedMessage> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();
  const convRef = db.collection('conversations').doc(conversationId);
  const preGeneratedMsgRef = convRef.collection('messages').doc();
  const provider = resolveActiveStorageProvider();

  let uploadedAttachmentPath: string | null = null;
  let uploadedContentType: string | undefined;

  if (input.attachment) {
    const preSnap = await convRef.get();
    const preData = preSnap.exists
      ? (preSnap.data() as ConversationDocument)
      : null;
    const preAssignedAdmin = preData
      ? resolveConversationAdminId(preData)
      : null;
    const effectivePreData: ConversationDocument | null =
      preData && authorized.role === 'admin' && !preAssignedAdmin
        ? { ...preData, assignedAdminId: authorized.uid }
        : preData;

    assertCanAccessConversation(authorized, effectivePreData, 'send');

    if (preData!.status === 'closed') {
      throw ApiError.conflict(
        'Percakapan ini telah ditutup dan tidak dapat menerima pesan baru.',
      );
    }

    const ext = extensionForEvidenceType(input.attachment.contentType);
    uploadedAttachmentPath = `conversations/${conversationId}/attachments/${preGeneratedMsgRef.id}.${ext}`;
    uploadedContentType = input.attachment.contentType;

    if (provider === 'cloudinary') {
      await uploadBytesToCloudinary({
        storagePath: uploadedAttachmentPath,
        bytes: input.attachment.bytes,
        contentType: input.attachment.contentType,
        fileName: input.attachment.fileName,
        deliveryType: 'private',
      });
    } else {
      const bucket = getAdminBucket();
      await bucket.file(uploadedAttachmentPath).save(Buffer.from(input.attachment.bytes), {
        resumable: false,
        contentType: input.attachment.contentType,
        metadata: {
          cacheControl: 'private, no-store',
        },
      });
    }
  }

  let createdMessage: SerializedMessage;
  try {
    createdMessage = await db.runTransaction(async (tx) => {
      const convSnap = await tx.get(convRef);
      const convData = convSnap.exists
        ? (convSnap.data() as ConversationDocument)
        : null;

      const assignedAdminId = convData ? resolveConversationAdminId(convData) : null;
      const unassignedAdminUsers = authorized.role === 'reporter' && !assignedAdminId
        ? await tx.get(db.collection('users').where('role', '==', 'admin'))
        : null;

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
      const msgRef = preGeneratedMsgRef;
      const encryptedBody = encryptText(input.body);
      const encryptedLastMessage = encryptText(input.body.slice(0, 180));
      const msgData: MessageDocument = {
        senderUid: authorized.uid,
        body: encryptedBody,
        createdAt: now,
        attachmentPath: uploadedAttachmentPath,
      };

      tx.create(msgRef, msgData);
      tx.update(convRef, {
        updatedAt: now,
        lastMessage: encryptedLastMessage,
        lastMessageSenderUid: authorized.uid,
        lastMessageAt: now,
        ...(authorized.role === 'admin' && !assignedAdminId
          ? { assignedAdminId: authorized.uid }
          : {}),
      });

      const reporterId = resolveConversationReporterId(convData!);
      const recipientUid =
        authorized.role === 'reporter' ? assignedAdminId : reporterId;

      const notificationRecipients = recipientUid
        ? [recipientUid]
        : (unassignedAdminUsers?.docs ?? []).map((adminUser) => adminUser.id);
      for (const targetUid of notificationRecipients) {
        const notifRef = db.collection('users').doc(targetUid)
          .collection('notifications').doc(`chat_${conversationId}`);
        tx.set(notifRef, {
          recipientUid: targetUid,
          type: 'new_chat_message',
          title: 'Pesan Baru Diterima',
          body: 'Anda menerima pesan baru pada ruang percakapan SISKA.',
          targetType: 'conversation',
          targetId: conversationId,
          senderUid: authorized.uid,
          isRead: false,
          readAt: null,
          createdAt: now,
        });
      }

      return serializeMessageDoc(msgRef.id, msgData);
    });
  } catch (txError) {
    if (uploadedAttachmentPath) {
      if (provider === 'cloudinary') {
        await deleteFromCloudinary({
          storagePath: uploadedAttachmentPath,
          contentType: uploadedContentType,
          deliveryType: 'private',
        }).catch(() => undefined);
      } else {
        await getAdminBucket()
          .file(uploadedAttachmentPath)
          .delete({ ignoreNotFound: true })
          .catch(() => undefined);
      }
    }
    throw txError;
  }

  return createdMessage;
}

// Otorisasi Unduhan Lampiran
export async function authorizeMessageAttachmentDownload(
  caller: AuthenticatedCaller,
  conversationId: string,
  messageId: string,
  requestId: string,
): Promise<SignedDownloadUrlResult> {
  const db = getAdminDb();
  const convRef = db.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();
  const convData = convSnap.exists
    ? (convSnap.data() as ConversationDocument)
    : null;

  const authorized = assertCanAccessConversation(caller, convData, 'read');

  const msgSnap = await convRef.collection('messages').doc(messageId).get();
  if (!msgSnap.exists) {
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  const msgData = msgSnap.data() as MessageDocument;
  if (!msgData.attachmentPath) {
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  const storagePath = msgData.attachmentPath;
  const inferredMime = storagePath.endsWith('.pdf')
    ? 'application/pdf'
    : storagePath.endsWith('.png')
      ? 'image/png'
      : 'image/jpeg';

  let signedResult: SignedDownloadUrlResult;
  if (resolveActiveStorageProvider() === 'cloudinary') {
    const cldSigned = buildCloudinarySignedDownloadUrl({
      storagePath,
      contentType: inferredMime,
      expiresInSeconds: EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
      deliveryType: 'private',
    });
    signedResult = {
      url: cldSigned.url,
      expiresInSeconds: cldSigned.expiresInSeconds,
      ...(cldSigned.previewUrl ? { previewUrl: cldSigned.previewUrl } : {}),
      ...(cldSigned.blurredPreviewUrl
        ? { blurredPreviewUrl: cldSigned.blurredPreviewUrl }
        : {}),
    };
  } else if (isFirebaseEmulatorMode()) {
    const cfg = resolveAdminConfig();
    const host = cfg.storageHost || '127.0.0.1:9199';
    const encodedPath = encodeURIComponent(storagePath);
    signedResult = {
      url: `http://${host}/v0/b/${cfg.storageBucket}/o/${encodedPath}?alt=media`,
      expiresInSeconds: EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
    };
  } else {
    const [url] = await getAdminBucket()
      .file(storagePath)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + EVIDENCE_SIGNED_URL_EXPIRES_SECONDS * 1000,
        responseDisposition: 'attachment',
      });
    signedResult = {
      url,
      expiresInSeconds: EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
    };
  }

  await recordAuditEvent({
    actorUid: authorized.uid,
    action: 'evidence.downloaded',
    targetType: 'conversation',
    targetId: conversationId,
    requestId,
  });

  return signedResult;
}

// Tandai Percakapan Terbaca
export async function markConversationAsRead(
  caller: AuthenticatedCaller,
  conversationId: string,
): Promise<{ conversationId: string; readAt: string; previousReadAt: string | null }> {
  const db = getAdminDb();
  const conversationRef = db.collection('conversations').doc(conversationId);
  const conversationSnap = await conversationRef.get();
  const conversation = conversationSnap.exists
    ? conversationSnap.data() as ConversationDocument
    : null;
  assertCanAccessConversation(caller, conversation, 'read');
  const now = new Date();
  const receiptRef = conversationRef.collection('readReceipts').doc(caller.uid);
  // Waktu baca sebelumnya dikembalikan agar UI bisa memasang pembatas "N pesan belum terbaca"
  // tepat di antara pesan lama dan pesan yang baru dibuka.
  const previousReceipt = await receiptRef.get();
  const previousReadAt = previousReceipt.exists
    ? toIsoStringOrNull(previousReceipt.data()?.readAt)
    : null;
  await receiptRef.set({
    uid: caller.uid,
    readAt: now,
    updatedAt: now,
  }, { merge: true });

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

  return { conversationId, readAt: now.toISOString(), previousReadAt };
}

// Detail Percakapan
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

// Pembaruan Percakapan Admin
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
