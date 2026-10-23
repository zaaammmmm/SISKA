/**
 * SISKA — Knowledge Base Domain Service & Ingestion Pipeline (`KnowledgeBaseService`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-012
 * - docs/02-ERD.md §2, §4, §6 (`knowledgeDocuments`, `knowledgeChunks`)
 * - docs/04-API-SPEC.yaml (/admin/knowledge-documents, /admin/knowledge-documents/{documentId}, /admin/knowledge-documents/reindex)
 * - docs/06-AI-ARCHITECTURE.md §3 & §4 (Ingestion pipeline: validate, SHA-256, extract, chunk, publish as indexed or mark failed)
 * - docs/09-TEST-PLAN.md KB-01, KB-02, KB-03
 */

import { createHash } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
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

/**
 * Mengekstrak teks dan bagian semantik per halaman dari biner PDF (docs/06-AI-ARCHITECTURE.md §4).
 * Melempar error berkode `'PDF_PARSE_FAILED'` bila struktur PDF rusak/terpotong (mis. tanpa `%%EOF` atau tanpa halaman).
 */
export function extractAndChunkPdfBytes(
  bytes: Uint8Array,
  docTitle: string,
): ExtractedPdfPageChunk[] {
  const rawLatin1 = Buffer.from(bytes).toString('latin1');

  // Validasi integritas struktur PDF (menangkap berkas PDF terpotong seperti fixture seed_kb_gagal)
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

    // Ekstrak literal teks dari operator PDF `(...) Tj` maupun array `[...] TJ`
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

    // Pisahkan judul halaman dan label `Bagian: <section>` (kompatibel penuh dengan format PDF seed-data.mjs)
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

    // Semantic chunking (~500-800 kata dengan overlap ~80 kata bila satu halaman sangat panjang — docs/06-AI-ARCHITECTURE.md §4.5)
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

/**
 * Menjalankan proses ingestion PDF untuk suatu dokumen `knowledgeDocuments/{docId}`:
 * - Menghapus chunk versi lama (idempoten).
 * - Mengekstrak & memecah teks menjadi `knowledgeChunks/{docId}_c{NN}`.
 * - Memperbarui status dokumen ke `'indexed'` beserta `chunkCount`, atau `'failed'` (`errorCode: 'PDF_PARSE_FAILED'`) bila gagal.
 */
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

/**
 * Mengambil daftar dokumen Knowledge Base beserta status pengindeksan (`GET /api/v1/admin/knowledge-documents`)
 * dengan amplop standar `{ items, nextCursor }`.
 * Hanya dapat diakses oleh Admin (KB-02).
 */
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

/**
 * Mengunggah PDF resmi Knowledge Base dan menjalankan pipeline ingestion (`POST /api/v1/admin/knowledge-documents`).
 * Sesuai docs/06-AI-ARCHITECTURE.md §3 & §4 serta KB-01:
 * 1. Menghitung SHA-256 biner PDF.
 * 2. Menyimpan PDF asli di Cloud Storage privat (`knowledge-base/{docId}/v1.pdf`).
 * 3. Mencatat metadata awal `knowledgeDocuments/{docId}` dengan status `'processing'` dan `auditEvents` (`kb.document_uploaded`).
 * 4. Memicu ingesti ke microservice FastAPI (`POST /admin/documents`) bila aktif, serta menjalankan ekstraksi teks & chunking
 *    sehingga status bertransisi ke `'indexed'` atau `'failed'` (`PDF_PARSE_FAILED`) tanpa pernah mandek di `'processing'`.
 */
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

  const bucket = getAdminBucket();
  const storageFile = bucket.file(storagePath);

  await storageFile.save(Buffer.from(upload.bytes), {
    resumable: false,
    contentType: 'application/pdf',
    metadata: {
      cacheControl: 'private, no-store',
    },
  });

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
    await storageFile.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw ApiError.internal(
      err instanceof Error ? err.message : 'KB document commit failed',
      'Gagal menyimpan metadata dokumen Knowledge Base.',
    );
  }

  // 1. Pemicu Server-to-Server ke microservice FastAPI RAG bila diaktifkan (docs/06-AI-ARCHITECTURE.md §3)
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

  // 2. Jalankan pipeline ingestion lokal (transisi otomatis processing -> indexed / failed sesuai KB-01)
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

/**
 * Menghapus dokumen Knowledge Base beserta seluruh `knowledgeChunks` terkait, entri indeks FastAPI, dan berkas asli di Cloud Storage
 * (`DELETE /api/v1/admin/knowledge-documents/{documentId}`).
 * Sesuai docs/02-ERD.md §6 & KB-03:
 * Mencatat `auditEvents` (`kb.document_deleted`) yang tetap bertahan meskipun dokumen sudah dihapus.
 */
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

  await Promise.all([
    docData.storagePath
      ? getAdminBucket()
          .file(docData.storagePath)
          .delete({ ignoreNotFound: true })
          .catch(() => undefined)
      : Promise.resolve(),
    triggerRemoteAiDocumentDelete(documentId, requestId),
  ]);
}

/**
 * Menjalankan pengindeksan ulang (reindex) idempoten atas dokumen Knowledge Base (`POST /api/v1/admin/knowledge-documents/reindex`).
 * Memicu endpoint `POST /admin/reindex` pada microservice FastAPI (bila aktif) serta mengunduh berkas PDF asli dari Cloud Storage
 * untuk memproses ulang chunking secara aktual.
 */
export async function requestKnowledgeReindex(
  caller: AuthenticatedCaller,
  requestId: string,
): Promise<KnowledgeReindexResult> {
  const adminCaller = requireAdmin(caller);
  const db = getAdminDb();
  const bucket = getAdminBucket();

  await recordAuditEvent({
    actorUid: adminCaller.uid,
    action: 'kb.reindex_requested',
    targetType: 'knowledgeDocument',
    targetId: 'all',
    requestId,
  });

  // Beritahukan microservice FastAPI bila mode remote aktif (docs/06-AI-ARCHITECTURE.md §3)
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
      const [buffer] = await bucket.file(data.storagePath).download();
      const res = await ingestKnowledgeDocumentBytes({
        docId: docSnap.id,
        title: data.title,
        version: data.version ?? 1,
        bytes: new Uint8Array(buffer),
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
