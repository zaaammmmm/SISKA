// Layanan Gateway AI

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

// Pola Prompt Injection
const PROMPT_INJECTION_PATTERNS = [
  /abaikan\s+(semua\s+)?instruksi/i,
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /tampilkan\s+(seluruh\s+)?isi\s+laporan/i,
  /token\s+autentikasi/i,
  /kredensial\s+sistem/i,
];

// Pola Data Pribadi
const PRIVATE_CASE_DATA_PATTERNS = [
  /isi\s+laporan\s+(saya|orang\s+lain|pelapor)/i,
  /\b(?:rpt|report|laporan)[_-][a-z0-9_-]{2,}/i,
  /siapa\s+pelapor/i,
  /buka(kan)?\s+bukti\s+laporan/i,
  /data\s+laporan\s+pengguna/i,
];

// Stopwords Bahasa Indonesia
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

// Pola Kondisi Darurat
const EMERGENCY_SAFETY_PATTERNS = [
  /darurat/i,
  /bahaya\s+sekarang/i,
  /ancam(an)?\s+nyawa/i,
  /bunuh\s+diri/i,
  /sedang\s+diserang/i,
  /butuh\s+pertolongan\s+segera/i,
];

function containsPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

// Pemrosesan Pertanyaan AI
export async function answerGeneralQuestion(
  caller: AuthenticatedCaller,
  input: AiChatInput,
  requestId: string,
): Promise<AiChatResponse> {
  requireRole(caller, ['reporter', 'admin']);
  const queryText = input.message.trim();

  // Filter Keamanan Input
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
  const isEmergency = containsPattern(queryText, EMERGENCY_SAFETY_PATTERNS);

  // Panggilan Layanan RAG
  const remoteResponse = await callRemoteAiChat(
    {
      message: queryText,
      conversationId: input.conversationId,
      userId: caller.uid,
    },
    requestId,
  );
  if (
    remoteResponse &&
    (!isEmergency || (remoteResponse.grounded && remoteResponse.sources.length > 0))
  ) {
    return {
      answer: remoteResponse.answer,
      grounded: remoteResponse.grounded,
      sources: remoteResponse.sources,
      escalationMessage: remoteResponse.escalationMessage ?? null,
    };
  }

  // Fallback Kondisi Darurat
  if (isEmergency) {
    return {
      answer:
        'Kami memahami situasi ini mendesak. SISKA AI tidak dapat menangani kondisi darurat secara langsung.',
      grounded: false,
      sources: [],
      escalationMessage:
        'Jika ada bahaya langsung, hubungi layanan darurat setempat. Untuk bantuan SISKA, gunakan fitur Chat dengan Admin.',
    };
  }

  // Retrieval Lokal Firestore
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

  // Gerbang Abstention
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
