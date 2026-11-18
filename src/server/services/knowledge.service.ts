// Layanan Knowledge Base

import { createHash } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import {
  deleteFromCloudinary,
  downloadBytesFromCloudinary,
  resolveActiveStorageProvider,
  uploadBytesToCloudinary,
} from '@/lib/cloudinary';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { toIsoDateString } from '@/lib/firebase/firestore';
import {
  INDISTINGUISHABLE_NOT_FOUND_MESSAGE,
  requireAdmin,
} from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import {
  triggerRemoteAiDocumentDelete,
  triggerRemoteAiDocumentIngest,
  triggerRemoteAiReindex,
} from '@/server/contracts/ai-service.contract';
import { ApiError } from '@/server/errors/api-error';
import {
  recordAuditEvent,
  recordAuditEventInBatch,
} from '@/server/services/audit.service';
import type { ValidatedKnowledgePdfUpload } from '@/server/validators/ai.validator';
import type {
  KnowledgeReindexResult,
  PaginatedKnowledgeDocumentsResult,
  SerializedKnowledgeDocument,
} from '@/types/api';
import type {
  KBDocumentStatus,
  KnowledgeChunkDocument,
  KnowledgeDocument,
} from '@/types/domain';

export type {
  KnowledgeReindexResult,
  PaginatedKnowledgeDocumentsResult,
  SerializedKnowledgeDocument,
};

export interface ExtractedPdfPageChunk {
  page: number;
  section: string | null;
  text: string;
}

// Serialisasi Dokumen KB
function serializeKnowledgeDoc(
  id: string,
  data: DocumentData,
): SerializedKnowledgeDocument {
  return {
    id,
    title: String(data.title ?? ''),
    sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : null,
    sha256: String(data.sha256 ?? ''),
    uploadedBy: String(data.uploadedBy ?? ''),
    status: (data.status as KBDocumentStatus) ?? 'processing',
    chunkCount: Number(data.chunkCount ?? 0),
    version: Number(data.version ?? 1),
    errorCode: typeof data.errorCode === 'string' ? data.errorCode : null,
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt),
  };
}

function unescapePdfLiteral(str: string): string {
  return str
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ');
}

// Ekstraksi & Chunking PDF
export function extractAndChunkPdfBytes(
  bytes: Uint8Array,
  docTitle: string,
): ExtractedPdfPageChunk[] {
  const rawLatin1 = Buffer.from(bytes).toString('latin1');

  if (
    !rawLatin1.startsWith('%PDF-') ||
    !rawLatin1.includes('%%EOF') ||
    !/\/Type\s*\/Page\b/.test(rawLatin1)
  ) {
    throw new Error('PDF_PARSE_FAILED');
  }

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const pageChunks: ExtractedPdfPageChunk[] = [];
  let match: RegExpExecArray | null;
  let pageNumber = 0;

  while ((match = streamRegex.exec(rawLatin1)) !== null) {
    const streamContent = match[1] ?? '';
    const lineLiterals: string[] = [];

    const tjRegex = /\((?:\\.|[^\\()])*\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(streamContent)) !== null) {
      const fullMatch = tjMatch[0];
      const innerParenRegex = /\(((?:\\.|[^\\()])*)\)/g;
      let innerMatch: RegExpExecArray | null;
      const parts: string[] = [];
      while ((innerMatch = innerParenRegex.exec(fullMatch)) !== null) {
        parts.push(unescapePdfLiteral(innerMatch[1] ?? ''));
      }
      const joined = parts.join('').trim();
      if (joined.length > 0) {
        lineLiterals.push(joined);
      }
    }

    if (lineLiterals.length === 0) {
      continue;
    }

    pageNumber += 1;

    let section: string | null = null;
    const bodyLines: string[] = [];
    const normalizedTitle = docTitle.replace(/[^\x20-\x7E]/g, '?').trim();

    for (const line of lineLiterals) {
      if (line === docTitle.trim() || line === normalizedTitle) {
        continue;
      }
      const sectionMatch = /^Bagian:\s*(.+)$/i.exec(line);
      if (sectionMatch && !section) {
        section = sectionMatch[1].trim();
        continue;
      }
      bodyLines.push(line);
    }

    const fullPageText = (bodyLines.length > 0 ? bodyLines : lineLiterals)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (fullPageText.length === 0) {
      continue;
    }

    const words = fullPageText.split(/\s+/);
    const maxWordsPerChunk = 600;
    const overlapWords = 80;

    if (words.length <= maxWordsPerChunk) {
      pageChunks.push({
        page: pageNumber,
        section: section ?? `Halaman ${pageNumber}`,
        text: fullPageText,
      });
    } else {
      let start = 0;
      let part = 1;
      while (start < words.length) {
        const slice = words.slice(start, start + maxWordsPerChunk).join(' ');
        pageChunks.push({
          page: pageNumber,
          section: section
            ? `${section} (Bagian ${part})`
            : `Halaman ${pageNumber} (Bagian ${part})`,
          text: slice,
        });
        if (start + maxWordsPerChunk >= words.length) break;
        start += maxWordsPerChunk - overlapWords;
        part += 1;
      }
    }
  }

  if (pageChunks.length === 0) {
    throw new Error('PDF_PARSE_FAILED');
  }

  return pageChunks;
}

// Ingest Dokumen KB
export async function ingestKnowledgeDocumentBytes(params: {
  docId: string;
  title: string;
  version: number;
  bytes: Uint8Array;
}): Promise<{
  status: KBDocumentStatus;
  chunkCount: number;
  errorCode: string | null;
}> {
  const { docId, title, version, bytes } = params;
  const db = getAdminDb();
  const docRef = db.collection('knowledgeDocuments').doc(docId);
  const now = new Date();

  try {
    const extractedChunks = extractAndChunkPdfBytes(bytes, title);

    const existingChunksSnap = await db
      .collection('knowledgeChunks')
      .where('documentId', '==', docId)
      .get();

    const batch = db.batch();
    for (const oldChunk of existingChunksSnap.docs) {
      batch.delete(oldChunk.ref);
    }

    extractedChunks.forEach((c, idx) => {
      const chunkId = `${docId}_c${String(idx + 1).padStart(2, '0')}`;
      const chunkRef = db.collection('knowledgeChunks').doc(chunkId);
      const chunkDoc: KnowledgeChunkDocument = {
        documentId: docId,
        documentVersion: version,
        chunkIndex: idx,
        page: c.page,
        section: c.section,
        text: c.text,
        createdAt: now,
      };
      batch.set(chunkRef, chunkDoc);
    });

    batch.update(docRef, {
      status: 'indexed',
      chunkCount: extractedChunks.length,
      errorCode: null,
      updatedAt: now,
    });

    await batch.commit();

    return {
      status: 'indexed',
      chunkCount: extractedChunks.length,
      errorCode: null,
    };
  } catch {
    await docRef.update({
      status: 'failed',
      chunkCount: 0,
      errorCode: 'PDF_PARSE_FAILED',
      updatedAt: now,
    });

    return {
      status: 'failed',
      chunkCount: 0,
      errorCode: 'PDF_PARSE_FAILED',
    };
  }
}

// Daftar Dokumen KB
export async function listKnowledgeDocuments(
  caller: AuthenticatedCaller,
): Promise<PaginatedKnowledgeDocumentsResult> {
  requireAdmin(caller);
  const db = getAdminDb();

  const snap = await db
    .collection('knowledgeDocuments')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  return {
    items: snap.docs.map((doc) => serializeKnowledgeDoc(doc.id, doc.data())),
    nextCursor: null,
  };
}

// Unggah Dokumen KB
export async function uploadKnowledgeDocument(
  caller: AuthenticatedCaller,
  upload: ValidatedKnowledgePdfUpload,
  requestId: string,
): Promise<SerializedKnowledgeDocument> {
  const adminCaller = requireAdmin(caller);
  const db = getAdminDb();
  const docRef = db.collection('knowledgeDocuments').doc();
  const version = 1;
  const storagePath = `knowledge-base/${docRef.id}/v${version}.pdf`;
  const computedSha256 = createHash('sha256').update(upload.bytes).digest('hex');
  const now = new Date();
  const provider = resolveActiveStorageProvider();

  if (provider === 'cloudinary') {
    await uploadBytesToCloudinary({
      storagePath,
      bytes: upload.bytes,
      contentType: 'application/pdf',
      fileName: upload.fileName,
      deliveryType: 'private',
    });
  } else {
    const bucket = getAdminBucket();
    const storageFile = bucket.file(storagePath);

    await storageFile.save(Buffer.from(upload.bytes), {
      resumable: false,
      contentType: 'application/pdf',
      metadata: {
        cacheControl: 'private, no-store',
      },
    });
  }

  const initialDoc: KnowledgeDocument = {
    title: upload.title,
    sourceUrl: null,
    storagePath,
    sha256: computedSha256,
    uploadedBy: adminCaller.uid,
    status: 'processing',
    chunkCount: 0,
    version,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const batch = db.batch();
    batch.create(docRef, initialDoc);
    recordAuditEventInBatch(batch, {
      actorUid: adminCaller.uid,
      action: 'kb.document_uploaded',
      targetType: 'knowledgeDocument',
      targetId: docRef.id,
      requestId,
      occurredAt: now,
    });
    await batch.commit();
  } catch (err) {
    if (provider === 'cloudinary') {
      await deleteFromCloudinary({
        storagePath,
        contentType: 'application/pdf',
        deliveryType: 'private',
      }).catch(() => undefined);
    } else {
      await getAdminBucket()
        .file(storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);
    }
    throw ApiError.internal(
      err instanceof Error ? err.message : 'KB document commit failed',
      'Gagal menyimpan metadata dokumen Knowledge Base.',
    );
  }

  const remoteIngestion = await triggerRemoteAiDocumentIngest(
    {
      documentId: docRef.id,
      title: upload.title,
      storagePath,
      sha256: computedSha256,
      version,
      uploadedBy: adminCaller.uid,
    },
    requestId,
  );

  if (remoteIngestion && remoteIngestion.status === 'indexed') {
    const updatedAt = new Date();
    await docRef.update({
      status: 'indexed',
      chunkCount: remoteIngestion.chunkCount,
      errorCode: null,
      updatedAt,
    });
    return serializeKnowledgeDoc(docRef.id, {
      ...initialDoc,
      status: 'indexed',
      chunkCount: remoteIngestion.chunkCount,
      errorCode: null,
      updatedAt,
    });
  }

  const ingestionResult = await ingestKnowledgeDocumentBytes({
    docId: docRef.id,
    title: upload.title,
    version,
    bytes: upload.bytes,
  });

  return serializeKnowledgeDoc(docRef.id, {
    ...initialDoc,
    status: ingestionResult.status,
    chunkCount: ingestionResult.chunkCount,
    errorCode: ingestionResult.errorCode,
    updatedAt: new Date(),
  });
}

// Hapus Dokumen KB
export async function deleteKnowledgeDocument(
  caller: AuthenticatedCaller,
  documentId: string,
  requestId: string,
): Promise<void> {
  const adminCaller = requireAdmin(caller);
  const db = getAdminDb();

  const docRef = db.collection('knowledgeDocuments').doc(documentId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  const docData = docSnap.data() as KnowledgeDocument;
  const chunksSnap = await db
    .collection('knowledgeChunks')
    .where('documentId', '==', documentId)
    .get();

  const batch = db.batch();
  for (const chunkDoc of chunksSnap.docs) {
    batch.delete(chunkDoc.ref);
  }
  batch.delete(docRef);
  recordAuditEventInBatch(batch, {
    actorUid: adminCaller.uid,
    action: 'kb.document_deleted',
    targetType: 'knowledgeDocument',
    targetId: documentId,
    requestId,
    occurredAt: new Date(),
  });

  await batch.commit();

  const provider = resolveActiveStorageProvider();

  await Promise.all([
    docData.storagePath
      ? provider === 'cloudinary'
        ? deleteFromCloudinary({
            storagePath: docData.storagePath,
            contentType: 'application/pdf',
            deliveryType: 'private',
          }).catch(() => undefined)
        : getAdminBucket()
            .file(docData.storagePath)
            .delete({ ignoreNotFound: true })
            .catch(() => undefined)
      : Promise.resolve(),
    triggerRemoteAiDocumentDelete(documentId, requestId),
  ]);
}

// Reindex Dokumen KB
export async function requestKnowledgeReindex(
  caller: AuthenticatedCaller,
  requestId: string,
): Promise<KnowledgeReindexResult> {
  const adminCaller = requireAdmin(caller);
  const db = getAdminDb();
  const provider = resolveActiveStorageProvider();

  await recordAuditEvent({
    actorUid: adminCaller.uid,
    action: 'kb.reindex_requested',
    targetType: 'knowledgeDocument',
    targetId: 'all',
    requestId,
  });

  await triggerRemoteAiReindex(
    { requestedBy: adminCaller.uid },
    requestId,
  );

  const docsSnap = await db.collection('knowledgeDocuments').limit(100).get();
  let indexedCount = 0;
  let failedCount = 0;

  for (const docSnap of docsSnap.docs) {
    const data = docSnap.data() as KnowledgeDocument;
    if (!data.storagePath) {
      failedCount += 1;
      continue;
    }

    try {
      let pdfBytes: Uint8Array;
      if (provider === 'cloudinary') {
        const downloaded = await downloadBytesFromCloudinary({
          storagePath: data.storagePath,
          contentType: 'application/pdf',
          deliveryType: 'private',
        });
        if (!downloaded) {
          throw new Error('PDF_NOT_FOUND_IN_CLOUDINARY');
        }
        pdfBytes = downloaded;
      } else {
        const bucket = getAdminBucket();
        const [buffer] = await bucket.file(data.storagePath).download();
        pdfBytes = new Uint8Array(buffer);
      }

      const res = await ingestKnowledgeDocumentBytes({
        docId: docSnap.id,
        title: data.title,
        version: data.version ?? 1,
        bytes: pdfBytes,
      });
      if (res.status === 'indexed') {
        indexedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      await docSnap.ref.update({
        status: 'failed',
        chunkCount: 0,
        errorCode: 'PDF_PARSE_FAILED',
        updatedAt: new Date(),
      });
      failedCount += 1;
    }
  }

  return {
    status: 'completed',
    processedCount: docsSnap.size,
    indexedCount,
    failedCount,
    requestId,
  };
}
