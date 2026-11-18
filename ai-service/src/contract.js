// Adapter Respons Kontrak

const GROUNDED_ROUTES = new Set(['answered', 'curhat', 'contacts', 'emergency']);

// Normalisasi Sumber Sitasi
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
