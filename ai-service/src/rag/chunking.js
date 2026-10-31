const CHUNK_CHARS = Number(process.env.CHUNK_CHARS ?? 900);
const CHUNK_MIN = Number(process.env.CHUNK_MIN ?? 200);
function slugify(filename) {
    return (filename
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'doc');
}
/** Format konteks persis sama dengan ctext() di notebook, supaya retrieval/BM25 konsisten. */
export function ctext(c) {
    const head = [c.cite, c.section, c.page ? `hlm. ${c.page}` : ''].filter(Boolean).join(' | ');
    return `[${head}]\n${c.text}`;
}
function splitLong(text, maxChars) {
    if (text.length <= maxChars)
        return [text];
    const paras = text.split(/\n{2,}/);
    const out = [];
    let buf = '';
    for (const p of paras) {
        if ((buf + '\n\n' + p).length > maxChars && buf) {
            out.push(buf.trim());
            buf = p;
        }
        else {
            buf = buf ? buf + '\n\n' + p : p;
        }
        while (buf.length > maxChars) {
            out.push(buf.slice(0, maxChars).trim());
            buf = buf.slice(maxChars);
        }
    }
    if (buf.trim())
        out.push(buf.trim());
    return out;
}
/**
 * Chunk markdown/teks biasa, sadar heading (#, ##, ###) mirip notebook (BAB/Pasal untuk PDF).
 * Untuk dokumen admin (profil, kontak, FAQ, pengumuman) heading markdown sudah cukup
 * untuk menjaga satu bagian tidak terpotong di tengah.
 */
export function chunkMarkdown(text, doc) {
    const slug = slugify(doc.file);
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let section = doc.cite;
    let buf = [];
    const flush = () => {
        const joined = buf.join('\n').trim();
        if (joined)
            blocks.push({ section, lines: [joined] });
        buf = [];
    };
    for (const raw of lines) {
        const h = raw.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
            flush();
            section = h[2].trim();
        }
        else {
            buf.push(raw);
        }
    }
    flush();
    const chunks = [];
    let n = 0;
    for (const b of blocks) {
        const parts = splitLong(b.lines.join('\n').trim(), CHUNK_CHARS);
        for (const t of parts) {
            if (!t)
                continue;
            if (chunks.length && t.length < CHUNK_MIN && chunks[chunks.length - 1].section === b.section) {
                chunks[chunks.length - 1].text += ' ' + t;
                chunks[chunks.length - 1].ctext = ctext(chunks[chunks.length - 1]);
                continue;
            }
            n += 1;
            const c = {
                id: `${slug}-${String(n).padStart(4, '0')}`,
                doc: doc.file,
                cite: doc.cite,
                section: b.section,
                page: '',
                text: t,
                ctext: '',
            };
            c.ctext = ctext(c);
            chunks.push(c);
        }
    }
    return chunks;
}
