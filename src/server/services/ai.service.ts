/**
 * SISKA — AI RAG Gateway & Guardrail Service (`AiGatewayService`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-011, NFR-PRIV-02, NFR-AI-01
 * - docs/04-API-SPEC.yaml (/ai/chat)
 * - docs/06-AI-ARCHITECTURE.md §1–§6
 * - docs/09-TEST-PLAN.md AI-01..AI-05, REL-01
 */

import { getAdminDb } from '@/lib/firebase/admin';
import { requireRole } from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { callRemoteAiChat } from '@/server/contracts/ai-service.contract';
import type { AiChatInput } from '@/server/validators/ai.validator';
import type { AiChatResponse, AiCitationSource } from '@/types/api';
import type {
  KnowledgeChunkDocument,
  KnowledgeDocument,
} from '@/types/domain';

export type { AiChatResponse, AiCitationSource };

/** Pola deteksi upaya Prompt Injection pada pertanyaan maupun di dalam teks chunk dokumen (AI-03) */
const PROMPT_INJECTION_PATTERNS = [
  /abaikan\s+(semua\s+)?instruksi/i,
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /tampilkan\s+(seluruh\s+)?isi\s+laporan/i,
  /token\s+autentikasi/i,
  /kredensial\s+sistem/i,
];

/**
 * Pola deteksi permintaan data kasus/laporan pribadi secara generik tanpa bergantung pada nama fixture uji (AI-04 & NFR-PRIV-02)
 */
const PRIVATE_CASE_DATA_PATTERNS = [
  /isi\s+laporan\s+(saya|orang\s+lain|pelapor)/i,
  /\b(?:rpt|report|laporan)[_-][a-z0-9_-]{2,}/i,
  /siapa\s+pelapor/i,
  /buka(kan)?\s+bukti\s+laporan/i,
  /data\s+laporan\s+pengguna/i,
];

/** Daftar kata umum (stopwords) Bahasa Indonesia agar tidak memicu kecocokan palsu pada Relevance Gate */
const INDONESIAN_STOPWORDS = new Set([
  'apa',
  'apakah',
  'bagaimana',
  'bisa',
  'cara',
  'dalam',
  'dan',
  'dapat',
  'dari',
  'dengan',
  'ini',
  'itu',
  'jika',
  'juga',
  'kami',
  'kapan',
  'karena',
  'kepada',
  'kita',
  'luar',
  'mana',
  'melalui',
  'mengapa',
  'mereka',
  'oleh',
  'pada',
  'para',
  'saat',
  'saja',
  'saya',
  'sebagai',
  'sebuah',
  'secara',
  'seperti',
  'siapa',
  'sudah',
  'tentang',
  'tersebut',
  'tidak',
  'untuk',
  'yang',
]);

/** Pola deteksi kondisi darurat / keselamatan mendesak (AI-05) */
const EMERGENCY_SAFETY_PATTERNS = [
  /darurat/i,
  /bahaya\s+sekarang/i,
  /ancam(an)?\s+nyawa/i,
  /bunuh\s+diri/i,
  /sedang\s+diserang/i,
  /butuh\s+pertolongan\s+segera/i,
];

const APPROVED_ESCALATION_MESSAGE =
  'SISKA AI adalah asisten informasi umum dan bukan kanal layanan darurat. ' +
  'Jika Anda berada dalam kondisi darurat atau membutuhkan pendampingan segera, ' +
  'silakan hubungi petugas melalui fitur Chat SISKA atau merujuk pada kontak resmi: ' +
  '[KONTAK RESMI KAMPUS - BELUM DITETAPKAN].';

function containsPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Memproses pertanyaan informasi umum ke SISKA AI (`POST /api/v1/ai/chat`).
 *
 * Kontrol Keamanan Mutlak (docs/06-AI-ARCHITECTURE.md & 09-TEST-PLAN.md):
 * 1. TIDAK PERNAH membaca koleksi `reports`, `evidence`, atau `conversations` (NFR-PRIV-02 & AI-04).
 * 2. Menolak upaya prompt injection pada pertanyaan pengguna maupun di dalam chunk dokumen (AI-03).
 * 3. Memberikan panduan eskalasi terverifikasi tanpa mengarang nomor kontak saat terdeteksi kondisi darurat (AI-05).
 * 4. Jika microservice eksternal FastAPI (`AI_SERVICE_URL`) dikonfigurasi dan aktif, meneruskan hanya pertanyaan
 *    yang sudah lolos filter dengan batas waktu ketat (`REL-01`). Jika tidak terjangkau/belum jalan,
 *    melakukan retrieval terverifikasi langsung dari koleksi `knowledgeDocuments` (`status == 'indexed'`)
 *    dan `knowledgeChunks` di Firestore, atau menyatakan abstain (`grounded: false`) bila bukti tidak cukup (`AI-02`).
 */
export async function answerGeneralQuestion(
  caller: AuthenticatedCaller,
  input: AiChatInput,
  requestId: string,
): Promise<AiChatResponse> {
  requireRole(caller, ['reporter', 'admin']);
  const queryText = input.message.trim();

  // 1. Guardrail Kondisi Darurat (AI-05)
  const isEmergency = containsPattern(queryText, EMERGENCY_SAFETY_PATTERNS);
  if (isEmergency) {
    return {
      answer:
        'Kami memahami situasi ini mendesak. SISKA AI hanya menyediakan informasi prosedur umum dan tidak dapat menangani kondisi darurat secara langsung.',
      grounded: false,
      sources: [],
      escalationMessage: APPROVED_ESCALATION_MESSAGE,
    };
  }

  // 2. Guardrail Prompt Injection & Akses Data Laporan Pribadi (AI-03 & AI-04)
  if (
    containsPattern(queryText, PROMPT_INJECTION_PATTERNS) ||
    containsPattern(queryText, PRIVATE_CASE_DATA_PATTERNS)
  ) {
    return {
      answer:
        'Maaf, SISKA AI tidak memiliki akses ke data laporan pribadi, bukti kasus, atau kredensial sistem, serta hanya dapat menjawab pertanyaan informasi umum berdasarkan dokumen panduan resmi yang terverifikasi.',
      grounded: false,
      sources: [],
      escalationMessage: null,
    };
  }

  // 3. Coba panggil microservice FastAPI RAG melalui kontrak server-to-server jika diaktifkan (REL-01)
  const remoteResponse = await callRemoteAiChat(
    {
      message: queryText,
      conversationId: input.conversationId,
    },
    requestId,
  );
  if (remoteResponse) {
    return {
      answer: remoteResponse.answer,
      grounded: remoteResponse.grounded,
      sources: remoteResponse.sources,
      escalationMessage: remoteResponse.escalationMessage ?? null,
    };
  }

  // 4. Retrieval Terverifikasi terhadap `knowledgeDocuments` (status == 'indexed') & `knowledgeChunks`
  const db = getAdminDb();
  const indexedDocsSnap = await db
    .collection('knowledgeDocuments')
    .where('status', '==', 'indexed')
    .get();

  if (indexedDocsSnap.empty) {
    return {
      answer:
        'Saat ini belum ada dokumen panduan terindeks yang cukup untuk menjawab pertanyaan Anda secara terverifikasi.',
      grounded: false,
      sources: [],
      escalationMessage: null,
    };
  }

  const approvedDocs = new Map<string, KnowledgeDocument>();
  for (const doc of indexedDocsSnap.docs) {
    const data = doc.data() as KnowledgeDocument;
    approvedDocs.set(doc.id, data);
  }

  const chunksSnap = await db.collection('knowledgeChunks').limit(200).get();

  const queryTokens = Array.from(
    new Set(
      queryText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, ' ')
        .split(/\s+/)
        .filter(
          (token) => token.length >= 3 && !INDONESIAN_STOPWORDS.has(token),
        ),
    ),
  );

  interface ScoredChunk {
    chunk: KnowledgeChunkDocument;
    docTitle: string;
    score: number;
    coverage: number;
  }

  const scored: ScoredChunk[] = [];

  for (const chunkDoc of chunksSnap.docs) {
    const chunk = chunkDoc.data() as KnowledgeChunkDocument;
    const parentDoc = approvedDocs.get(chunk.documentId);
    if (!parentDoc) continue;

    // Sanitasi murni berbasis konten chunk terhadap instruksi prompt injection yang tersembunyi di dalam PDF (AI-03)
    if (containsPattern(chunk.text, PROMPT_INJECTION_PATTERNS)) {
      continue;
    }

    const haystack = `${parentDoc.title} ${chunk.section ?? ''} ${chunk.text}`.toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) {
        score += 1;
      }
    }

    const coverage = queryTokens.length > 0 ? score / queryTokens.length : 0;

    // Relevance / Confidence Gate (docs/06-AI-ARCHITECTURE.md §2):
    // Hanya terima chunk bila minimal 2 kata kunci bermakna cocok ATAU cakupan >= 34% dari kata kunci bermakna
    const meetsRelevanceGate =
      queryTokens.length > 0 && (score >= 2 || coverage >= 0.34);

    if (meetsRelevanceGate) {
      scored.push({
        chunk,
        docTitle: parentDoc.title,
        score,
        coverage,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, 2);

  // 5. Abstention Gate jika tidak ada bagian dokumen resmi yang relevan (AI-02 & NFR-AI-01)
  if (topMatches.length === 0) {
    return {
      answer:
        'Maaf, informasi tersebut belum tercantum dalam dokumen panduan resmi SISKA yang terverifikasi. Silakan hubungi petugas melalui fitur Chat untuk mendapatkan penjelasan lebih lanjut.',
      grounded: false,
      sources: [],
      escalationMessage: null,
    };
  }

  const synthesizedPassages = topMatches
    .map((m) => m.chunk.text.trim())
    .join(' ');

  const sources: AiCitationSource[] = topMatches.map((m) => ({
    documentId: m.chunk.documentId,
    title: m.docTitle,
    page: m.chunk.page,
  }));

  return {
    answer: synthesizedPassages,
    grounded: true,
    sources,
    escalationMessage: null,
  };
}
