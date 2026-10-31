/**
 * Adapter hasil RAG -> kontrak `POST /chat` SISKA (lihat src/server/contracts/ai-service.contract.ts).
 *
 * Yang SENGAJA tidak ikut dikirim ke frontend: nama rute internal (answered, smalltalk, ...),
 * nama backend model (local/colab), dan latensi. Semua itu hanya untuk log server.
 */

const GROUNDED_ROUTES = new Set(['answered', 'curhat', 'contacts', 'emergency']);

/** Gabungkan sumber per dokumen, urut kemunculan. */
function toCitationSources(sources) {
  const seen = new Set();
  const out = [];
  for (const s of sources || []) {
    const documentId = s.doc || s.id;
    if (!documentId || seen.has(documentId)) continue;
    seen.add(documentId);
    out.push({
      documentId,
      title: s.cite || documentId,
      page: Number.parseInt(s.page, 10) || 0,
    });
  }
  return out;
}

export function toContractResponse(result) {
  const sources = toCitationSources(result.sources);
  return {
    answer: result.answer,
    grounded: GROUNDED_ROUTES.has(result.route) && sources.length > 0,
    sources,
    escalationMessage: null,
  };
}
