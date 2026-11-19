// Pemecahan Dokumen
const CHUNK_CHARS = 900;
const CHUNK_MIN = 160;

const H_PASAL = /^Pasal\s+\d+[A-Z]?$/;
const H_BAB = /^BAB\s+[IVXLC]+$/;
const H_PART = /^(Bagian|Paragraf)\s+[A-Z]\w+(\s+\w+)?$/;
const H_DEC = /^\d{1,2}(\.\d{1,2})+\.?\s+[A-Z][^.:;,]{2,60}$/;
const H_TOP = /^[A-Z]\.\s+[A-Z0-9][A-Z0-9 \-/&()]{3,}$/;
const H_ONE = /^\d{1,2}\.\s+[A-Z][^.:;,]{2,60}$/;
const LONE_NUM = /^-?\s*\d{1,3}\s*-?$/;

// Perbaikan OCR
export function ocrFix(s) {
    return s
        .replace(/(?<=\d)[Oo]+(?=[\d.]|\b)/g, (m) => '0'.repeat(m.length))
        .replace(/(?<=[.])[Oo](?=\d)/g, '0')
        .replace(/\bRp\s*(?=\d)/g, 'Rp');
}
export function norm(s) {
    return s
        .normalize('NFKC')
        .replace(/ı/g, 'i')
        .replace(/­/g, '')
        .replace(/[ \t ]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
const isUpper = (w) => /\p{Lu}/u.test([...w][0] || '');
function isSub(l) {
    if (H_DEC.test(l))
        return true;
    if (!H_ONE.test(l))
        return false;
    const words = l.split(/\s+/).filter(Boolean).slice(1);
    return words.filter((w) => w.length > 3).every(isUpper) && words.filter((w) => w.length > 3).length >= 2;
}
function isHead(l) {
    return H_PASAL.test(l) || H_BAB.test(l) || H_PART.test(l) || H_TOP.test(l);
}
const normLine = (l) => l.trim().toLowerCase().replace(/\d+/g, '#');

// Pembersihan Halaman
export function cleanPages(pages) {
    const n = pages.length;
    const cnt = new Map();
    for (const p of pages) {
        for (const l of new Set(p.text.split('\n'))) {
            if (l.trim())
                cnt.set(normLine(l), (cnt.get(normLine(l)) || 0) + 1);
        }
    }
    return pages.map((p) => {
        const lines = p.text.split('\n');
        let label = String(p.idx);
        const tail = lines.slice(-3).filter((x) => x.trim()).reverse();
        for (const l of tail) {
            if (LONE_NUM.test(l.trim())) {
                label = l.replace(/\D/g, '');
                break;
            }
        }
        const kept = lines.filter((l) => !LONE_NUM.test(l.trim()) && !(n >= 4 && !isHead(l.trim()) && (cnt.get(normLine(l)) || 0) >= 0.4 * n && l.trim().length < 90));
        return { idx: p.idx, label, text: kept.join('\n') };
    });
}

// Halaman dari isi dokumen
export function toPages(content, file) {
    if (/\.pdf$/i.test(file)) {
        const raw = content.split('\f').map((t, i) => ({ idx: i + 1, text: norm(ocrFix(t)) }));
        return cleanPages(raw);
    }
    return [{ idx: 1, label: '', text: norm(content) }];
}

function reflow(lines) {
    const paras = [];
    let cur = '';
    for (let l of lines) {
        l = l.trim();
        if (!l)
            continue;
        if (cur && /^(\(\d+\)|[a-z]\.|\d+\.|[-•*])\s/.test(l)) {
            paras.push(cur);
            cur = l;
        }
        else if (cur && !cur.endsWith('-')) {
            cur = `${cur} ${l}`.trim();
        }
        else {
            cur = cur ? cur.slice(0, -1) + l : l;
        }
    }
    if (cur)
        paras.push(cur);
    return paras;
}
function splitText(paras, size) {
    const out = [];
    let cur = '';
    for (const p of paras) {
        const parts = p.length <= size ? [p] : p.split(/(?<=[.;:])\s+/);
        for (const s of parts) {
            if (cur && cur.length + s.length + 1 > size) {
                out.push(cur);
                cur = '';
            }
            cur = `${cur} ${s}`.trim();
        }
    }
    if (cur)
        out.push(cur);
    return out;
}

// Format Konteks Chunk
export function ctext(c) {
    const head = [c.cite, c.section, c.page ? `hlm. ${c.page}` : ''].filter(Boolean).join(' | ');
    return `[${head}]\n${c.text}`;
}
function slugify(file) {
    return file.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '-').slice(0, 24);
}

// Chunking Dokumen
export function chunkDocument(content, doc, opts = {}) {
    const size = opts.chunkChars || Number(process.env.CHUNK_CHARS) || CHUNK_CHARS;
    const min = opts.chunkMin || Number(process.env.CHUNK_MIN) || CHUNK_MIN;
    const slug = slugify(doc.file);
    const blocks = [];
    let chapter = '', part = '', top = '', sec = '', buf = [], pg0 = null;
    const flush = () => {
        if (buf.length)
            blocks.push({ sec, pg: pg0, lines: buf });
        buf = [];
        pg0 = null;
    };
    for (const p of toPages(content, doc.file)) {
        const lines = p.text.split('\n');
        let i = 0;
        while (i < lines.length) {
            const l = lines[i].trim();
            const md = /^#{1,4}\s+(.*)/.exec(l);
            if (H_BAB.test(l)) {
                flush();
                const nxt = i + 1 < lines.length ? lines[i + 1].trim() : null;
                const t = nxt !== null && !isHead(nxt) ? nxt : '';
                chapter = l + (t ? ` ${t}` : '');
                part = '';
                sec = chapter;
                i += t ? 2 : 1;
                pg0 = p.label;
                continue;
            }
            if (H_PART.test(l)) {
                flush();
                part = l;
                sec = [chapter, l].filter(Boolean).join(' > ');
                pg0 = p.label;
            }
            else if (H_PASAL.test(l)) {
                flush();
                sec = [chapter, part, l].filter(Boolean).join(' > ');
                pg0 = p.label;
            }
            else if (H_TOP.test(l)) {
                flush();
                top = l;
                sec = l;
                pg0 = p.label;
            }
            else if (md || isSub(l)) {
                flush();
                sec = md ? md[1] : [top, l].filter(Boolean).join(' > ');
                pg0 = p.label;
            }
            else if (l) {
                if (!buf.length && pg0 === null)
                    pg0 = p.label;
                buf.push(l);
            }
            i += 1;
        }
    }
    flush();
    const chunks = [];
    let n = 0;
    for (const b of blocks) {
        for (const t of splitText(reflow(b.lines), size)) {
            if (chunks.length && t.length < min && chunks[chunks.length - 1].section === b.sec) {
                chunks[chunks.length - 1].text += ` ${t}`;
                continue;
            }
            n += 1;
            chunks.push({ id: `${slug}-${String(n).padStart(4, '0')}`, doc: doc.file, cite: doc.cite, section: b.sec, page: b.pg || '', text: t });
        }
    }
    return chunks.map((c) => ({ ...c, ctext: ctext(c) }));
}
export const chunkMarkdown = chunkDocument;
