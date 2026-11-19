// Pembersih teks jawaban sebelum dikirim ke pengguna

// [1] [1,2] [1, 2] [1-3] [1–3] [1][2] [ 1 ] -- beserta spasi/tab di depa
const CITATION_RX =
  /[ \t]*(?:\[\s*(?:\d+(?:\s*[,;–-]\s*\d+)*|n)\s*\])+/gi;
// sisa kurung kosong setelah penanda dibuang
const EMPTY_PAREN_RX = /[ \t]*\(\s*(?:sumber|dokumen|lihat|ref|referensi)?\s*:?\s*\)/gi;

export function stripCitations(text) {
  if (!text) return '';
  return String(text)
    .replace(CITATION_RX, '')
    .replace(EMPTY_PAREN_RX, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1') // spasi sisa sebelum tanda baca
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Kata internal yang kadang bocor dari prompt
export function tidyAnswer(text) {
  if (!text) return '';
  return String(text)
    .replace(/^#{1,6}\s+/gm, '')                       // judul markdown
    .replace(/\b(berdasarkan|menurut|sesuai|merujuk pada|mengacu pada)\s+(bagian\s+)?konteks(\s+yang\s+(diberikan|tersedia|ada))?/gi, '$1 dokumen yang tersedia')
    .replace(/\b(di|dalam|pada)\s+konteks(\s+yang\s+(diberikan|tersedia|ada))?/gi, '$1 dokumen yang tersedia')
    .replace(/\bkonteks\s+(yang\s+)?(diberikan|tersedia)/gi, 'dokumen yang tersedia')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Batasi panjang jawaban
export function limitAnswer(text, maxChars) {
  const t = String(text || '').trim();
  if (!maxChars || t.length <= maxChars) return { text: t, truncated: false };
  const head = t.slice(0, maxChars);
  const minKeep = Math.floor(maxChars * 0.5);
  const nl = head.lastIndexOf('\n');
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('.\n'));
  let cut = Math.max(sentence >= 0 ? sentence + 1 : -1, nl);
  if (cut < minKeep) {
    const sp = head.lastIndexOf(' ');
    return { text: head.slice(0, sp > minKeep ? sp : maxChars).trim() + '…', truncated: true };
  }
  return { text: head.slice(0, cut).trim(), truncated: true };
}
