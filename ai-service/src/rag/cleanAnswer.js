/**
 * Pembersih teks jawaban sebelum dikirim ke pengguna.
 *
 * Model diminta menulis penanda sumber [n] karena guard `checkOutput` memakainya untuk
 * memastikan setiap klaim punya rujukan di KONTEKS. Penanda itu hanya berguna untuk
 * verifikasi internal; bagi pengguna ia membingungkan ("SISKA adalah ... [1]"), jadi
 * dibuang SETELAH verifikasi dan SETELAH daftar sumber dihitung.
 */

// [1]  [1,2]  [1, 2]  [1-3]  [1–3]  [1][2]  [ 1 ]  -- beserta spasi/tab di depannya
const CITATION_RX =
  /[ \t]*(?:\[\s*(?:\d+(?:\s*[,;–-]\s*\d+)*|n)\s*\])+/gi;
// sisa kurung kosong setelah penanda dibuang: "(sumber: )", "(lihat )", "( )"
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
