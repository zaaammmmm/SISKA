import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ApiError } from '@/server/errors/api-error';

export const AI_PDF_MAX_TEXT_CHARS = 300_000;

export async function extractAiPdfText(
  bytes: Uint8Array,
  title: string,
): Promise<string> {
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
  });

  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    let totalChars = title.length;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = textContent.items
        .filter((item) => 'str' in item && typeof item.str === 'string')
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean);
      const text = lines.join(' ').replace(/\s+/g, ' ').trim();

      if (!text) continue;

      totalChars += text.length;
      if (totalChars > AI_PDF_MAX_TEXT_CHARS) {
        throw ApiError.uploadRejected(
          `Teks hasil ekstraksi PDF melebihi batas ${AI_PDF_MAX_TEXT_CHARS.toLocaleString('id-ID')} karakter.`,
          413,
          { file: 'Gunakan dokumen yang lebih singkat atau pecah menjadi beberapa PDF.' },
        );
      }

      pages.push(`## Halaman ${pageNumber}\n\n${text}`);
    }

    if (pages.length === 0) {
      throw ApiError.uploadRejected(
        'PDF tidak memiliki teks yang dapat diekstrak. PDF hasil scan memerlukan OCR sebelum diunggah.',
        400,
        { file: 'Unggah PDF yang memiliki teks terpilih, atau lakukan OCR dan tinjau hasilnya terlebih dahulu.' },
      );
    }

    const content = `# ${title}\n\n${pages.join('\n\n')}`;
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
    throw ApiError.uploadRejected(
      'PDF tidak dapat dibaca. Pastikan berkas tidak rusak dan merupakan PDF yang valid.',
      400,
      { file: 'Periksa berkas PDF lalu coba unggah kembali.' },
    );
  } finally {
    await task.destroy();
  }
}
