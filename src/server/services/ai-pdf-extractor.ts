import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ApiError } from '@/server/errors/api-error';

export const AI_PDF_MAX_TEXT_CHARS = 300_000;

// Pemisah halaman: dibaca ai-service agar nomor halaman, header/footer, dan Pasal/BAB diproses sama seperti notebook
export const PAGE_BREAK = '\f';

interface Piece {
  str: string;
  x: number;
  y: number;
  width: number;
}

// Susun ulang baris dari posisi teks (atas ke bawah, kiri ke kanan) agar struktur Pasal/BAB tetap terbaca
function pageLines(items: ReadonlyArray<unknown>): string {
  const pieces: Piece[] = [];
  for (const item of items) {
    const it = item as { str?: unknown; transform?: unknown; width?: unknown };
    if (typeof it.str !== 'string' || !it.str.trim() || !Array.isArray(it.transform)) continue;
    pieces.push({
      str: it.str,
      x: Number(it.transform[4]) || 0,
      y: Number(it.transform[5]) || 0,
      width: Number(it.width) || 0,
    });
  }
  pieces.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Piece[][] = [];
  for (const piece of pieces) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - piece.y) <= 2.5) last.push(piece);
    else lines.push([piece]);
  }
  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      let out = '';
      let prevEnd: number | null = null;
      for (const piece of line) {
        if (prevEnd !== null && piece.x - prevEnd > 1) out += ' ';
        out += piece.str.trim();
        prevEnd = piece.x + piece.width;
      }
      return out.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n');
}

export async function extractAiPdfText(
  bytes: Uint8Array,
  title: string,
): Promise<string> {
  // pdfjs-dist 4.10.x membutuhkan Node.js >=20; proyek SISKA menetapkan Node.js >=22.
  // Buat task di dalam try agar error sinkron dari PDF.js juga tertangani.
  let task: ReturnType<typeof getDocument> | null = null;

  try {
    task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const pdf = await task.promise;
    const pages: string[] = [];
    let totalChars = title.length;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = pageLines(textContent.items);
      pages.push(text);
      if (!text) continue;

      totalChars += text.length;
      if (totalChars > AI_PDF_MAX_TEXT_CHARS) {
        throw ApiError.uploadRejected(
          `Teks hasil ekstraksi PDF melebihi batas ${AI_PDF_MAX_TEXT_CHARS.toLocaleString('id-ID')} karakter.`,
          413,
          { file: 'Gunakan dokumen yang lebih singkat atau pecah menjadi beberapa PDF.' },
        );
      }

    }

    if (!pages.some(Boolean)) {
      throw ApiError.uploadRejected(
        'PDF tidak memiliki teks yang dapat diekstrak. PDF hasil scan memerlukan OCR sebelum diunggah.',
        400,
        { file: 'Unggah PDF yang memiliki teks terpilih, atau lakukan OCR dan tinjau hasilnya terlebih dahulu.' },
      );
    }

    const content = pages.join(PAGE_BREAK);
    if (content.length > AI_PDF_MAX_TEXT_CHARS) {
      throw ApiError.uploadRejected(
        `Teks hasil ekstraksi PDF melebihi batas ${AI_PDF_MAX_TEXT_CHARS.toLocaleString('id-ID')} karakter.`,
        413,
        { file: 'Gunakan dokumen yang lebih singkat atau pecah menjadi beberapa PDF.' },
      );
    }
    return content;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    // Jangan tampilkan detail parser kepada pengguna, tetapi simpan penyebab aslinya
    // agar error kompatibilitas Node/PDF.js, font, dan struktur PDF dapat dibedakan.
    const cause = error instanceof Error ? error : new Error(String(error));
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'ai_pdf_extractor',
        errorName: cause.name,
        errorMessage: cause.message.slice(0, 500),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      }),
    );

    throw ApiError.uploadRejected(
      'PDF gagal diproses oleh layanan ekstraksi. Silakan coba unggah kembali. Jika masalah berlanjut, hubungi administrator.',
      400,
      { file: 'Coba unggah kembali. Jika masalah berlanjut, hubungi administrator.' },
    );
  } finally {
    if (task) {
      try {
        await task.destroy();
      } catch (error) {
        // Kegagalan cleanup tidak boleh menimpa error ekstraksi yang sebenarnya.
        const cause = error instanceof Error ? error : new Error(String(error));
        console.warn(
          JSON.stringify({
            level: 'warn',
            scope: 'ai_pdf_extractor_cleanup',
            errorName: cause.name,
            errorMessage: cause.message.slice(0, 300),
          }),
        );
      }
    }
  }
}
