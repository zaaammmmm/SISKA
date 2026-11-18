// Pembersih Penanda Sitasi

const CITATION_RX =
  /[ \t]*(?:\[\s*(?:\d+(?:\s*[,;–-]\s*\d+)*|n)\s*\])+/gi;
const EMPTY_PAREN_RX = /[ \t]*\(\s*(?:sumber|dokumen|lihat|ref|referensi)?\s*:?\s*\)/gi;

export function stripCitations(text) {
  if (!text) return '';
  return String(text)
    .replace(CITATION_RX, '')
    .replace(EMPTY_PAREN_RX, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
