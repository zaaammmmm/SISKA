// Layanan Knowledge Base

import { createHash } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
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

const PDF_MAX_WORDS_PER_CHUNK = 600;
const PDF_CHUNK_OVERLAP_WORDS = 80;

// Kelompokkan potongan teks pdfjs menjadi baris berdasarkan posisi vertikal.
function groupPdfTextItemsIntoLines(
  items: ReadonlyArray<unknown>,
): string[] {
  const lines: string[] = [];
  let current = '';
  let currentY: number | null = null;

  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim();
    if (text.length > 0) lines.push(text);
    current = '';
  };

  for (const raw of items) {
    const item = raw as {
      str?: unknown;
      transform?: unknown;
      hasEOL?: unknown;
    };
    if (typeof item.str !== 'string') continue;

    const y =
      Array.isArray(item.transform) && typeof item.transform[5] === 'number'
        ? (item.transform[5] as number)
        : null;

    if (currentY !== null && y !== null && Math.abs(y - currentY) > 2) {
      flush();
    }
    if (y !== null) currentY = y;

    current += item.str;
    if (item.hasEOL === true) {
      flush();
      currentY = null;
    }
  }
  flush();

  return lines;
}

function chunkPdfPageLines(
  lineLiterals: string[],
  pageNumber: number,
  docTitle: string,
): ExtractedPdfPageChunk[] {
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

  if (fullPageText.length === 0) return [];

  const words = fullPageText.split(/\s+/);
  if (words.length <= PDF_MAX_WORDS_PER_CHUNK) {
    return [
      {
        page: pageNumber,
        section: section ?? `Halaman ${pageNumber}`,
        text: fullPageText,
      },
    ];
  }

  const chunks: ExtractedPdfPageChunk[] = [];
  let start = 0;
  let part = 1;
  while (start < words.length) {
    const slice = words
      .slice(start, start + PDF_MAX_WORDS_PER_CHUNK)
      .join(' ');
    chunks.push({
      page: pageNumber,
      section: section
        ? `${section} (Bagian ${part})`
        : `Halaman ${pageNumber} (Bagian ${part})`,
      text: slice,
    });
    if (start + PDF_MAX_WORDS_PER_CHUNK >= words.length) break;
    start += PDF_MAX_WORDS_PER_CHUNK - PDF_CHUNK_OVERLAP_WORDS;
    part += 1;
  }
  return chunks;
}

// Ekstraksi & Chunking PDF
// Memakai pdfjs-dist (sama seperti ekstraktor AI) agar PDF dengan stream
// terkompresi (FlateDecode), font tertanam, dan object stream dapat dibaca.
// Nomor halaman mengikuti nomor halaman PDF asli.
export async function extractAndChunkPdfBytes(
  bytes: Uint8Array,
  docTitle: string,
): Promise<ExtractedPdfPageChunk[]> {
  const header = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
  if (!header.includes('%PDF-')) {
    throw new Error('PDF_PARSE_FAILED');
  }

  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
  });

  try {
    const pdf = await task.promise;
    const pageChunks: ExtractedPdfPageChunk[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = groupPdfTextItemsIntoLines(textContent.items);
      pageChunks.push(...chunkPdfPageLines(lines, pageNumber, docTitle));
    }

    if (pageChunks.length === 0) {
      // PDF valid, tetapi tidak ada teks (umumnya hasil scan tanpa OCR).
      throw new Error('PDF_NO_TEXT');
    }

    return pageChunks;
  } catch (error) {
    if (error instanceof Error && error.message === 'PDF_NO_TEXT') {
      throw error;
    }
    console.error('[knowledge] pdfjs gagal membaca PDF:', error);
    throw new Error('PDF_PARSE_FAILED');
  } finally {
    await task.destroy();
  }
}

function pdfFailureCode(error: unknown): 'PDF_NO_TEXT' | 'PDF_PARSE_FAILED' {
  return error instanceof Error && error.message === 'PDF_NO_TEXT'
    ? 'PDF_NO_TEXT'
    : 'PDF_PARSE_FAILED';
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
    const extractedChunks = await extractAndChunkPdfBytes(bytes, title);

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
  } catch (error) {
    const errorCode = pdfFailureCode(error);
    await docRef.update({
      status: 'failed',
      chunkCount: 0,
      errorCode,
      updatedAt: now,
    });

    return {
      status: 'failed',
      chunkCount: 0,
      errorCode,
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

// Penyimpanan berkas PDF Knowledge Base (Cloudinary atau Firebase Storage)
async function saveKnowledgePdfObject(
  storagePath: string,
  bytes: Uint8Array,
  fileName: string,
): Promise<void> {
  if (resolveActiveStorageProvider() === 'cloudinary') {
    await uploadBytesToCloudinary({
      storagePath,
      bytes,
      contentType: 'application/pdf',
      fileName,
      deliveryType: 'private',
    });
    return;
  }
  await getAdminBucket()
    .file(storagePath)
    .save(Buffer.from(bytes), {
      resumable: false,
      contentType: 'application/pdf',
      metadata: { cacheControl: 'private, no-store' },
    });
}

async function deleteKnowledgePdfObject(storagePath: string): Promise<void> {
  if (!storagePath) return;
  if (resolveActiveStorageProvider() === 'cloudinary') {
    await deleteFromCloudinary({
      storagePath,
      contentType: 'application/pdf',
      deliveryType: 'private',
    }).catch(() => undefined);
    return;
  }
  await getAdminBucket()
    .file(storagePath)
    .delete({ ignoreNotFound: true })
    .catch(() => undefined);
}

// Hapus catatan Knowledge Base (dokumen, chunk, dan berkas PDF) berdasarkan ragFile
async function removeKnowledgeRecordsByRagFile(file: string): Promise<number> {
  const db = getAdminDb();
  const existing = await db
    .collection('knowledgeDocuments')
    .where('ragFile', '==', file)
    .get();

  for (const docSnap of existing.docs) {
    const data = docSnap.data() as KnowledgeDocument;
    const chunksSnap = await db
      .collection('knowledgeChunks')
      .where('documentId', '==', docSnap.id)
      .get();

    const batch = db.batch();
    for (const chunkDoc of chunksSnap.docs) {
      batch.delete(chunkDoc.ref);
    }
    batch.delete(docSnap.ref);
    await batch.commit();

    await deleteKnowledgePdfObject(data.storagePath);
  }
  return existing.docs.length;
}

// Catat PDF dari halaman "Dokumen SISKA AI" ke Firestore (knowledgeDocuments)
// setelah AI Service berhasil mengindeksnya. Berkas PDF asli disimpan di storage.
export async function registerAiRagPdfInKnowledgeBase(params: {
  caller: AuthenticatedCaller;
  file: string;
  title: string;
  bytes: Uint8Array;
  chunkCount: number;
}): Promise<SerializedKnowledgeDocument> {
  const adminCaller = requireAdmin(params.caller);
  const db = getAdminDb();

  // Bila ada catatan lama untuk berkas yang sama (mis. sisa dari proses yang tidak tuntas), bersihkan dulu.
  await removeKnowledgeRecordsByRagFile(params.file);

  const docRef = db.collection('knowledgeDocuments').doc();
  const version = 1;
  const storagePath = `knowledge-base/${docRef.id}/v${version}.pdf`;
  const now = new Date();

  await saveKnowledgePdfObject(storagePath, params.bytes, params.file);

  const doc: KnowledgeDocument = {
    title: params.title,
    sourceUrl: null,
    storagePath,
    sha256: createHash('sha256').update(params.bytes).digest('hex'),
    uploadedBy: adminCaller.uid,
    status: 'indexed',
    chunkCount: params.chunkCount,
    version,
    errorCode: null,
    ragFile: params.file,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await docRef.create(doc);
  } catch (err) {
    await deleteKnowledgePdfObject(storagePath);
    throw ApiError.internal(
      err instanceof Error ? err.message : 'KB document commit failed',
      'Gagal menyimpan metadata dokumen Knowledge Base.',
    );
  }

  return serializeKnowledgeDoc(docRef.id, doc);
}

// Hapus catatan Firestore + berkas PDF untuk dokumen yang dihapus dari halaman "Dokumen SISKA AI"
export async function removeAiRagDocumentFromKnowledgeBase(
  file: string,
): Promise<number> {
  return removeKnowledgeRecordsByRagFile(file);
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
    } catch (error) {
      console.error(
        `[knowledge] reindex gagal untuk dokumen ${docSnap.id}:`,
        error,
      );
      await docSnap.ref.update({
        status: 'failed',
        chunkCount: 0,
        errorCode: pdfFailureCode(error),
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
