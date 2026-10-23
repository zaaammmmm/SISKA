"use client";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Bell, Check, CalendarDays, CheckCircle2, Clock3, Copy, FileText, FileUp, Inbox, MessagesSquare, RefreshCw, Search,
  ShieldCheck, SlidersHorizontal, Trash2, User, Headset,
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { ChatWorkspace, type Msg } from "@/components/chat";
import { IncidentCard, PrivacyNote } from "@/components/report-parts";
import { Note, PageHead, Pagination, ReportsTable, SelectField, StatusPill, Stepper, TextField, Toast } from "@/components/ui";
import {
  adminConversations, adminReports, DEMO_NOW, DEMO_NOW_SHORT, findReport, statusSteps, timeline, type Status,
} from "@/lib/demo-data";

const count = (s: Status) => adminReports.filter((r) => r.status === s).length;

/* =============================== Dashboard =============================== */
export function AdminDashboard() {
  const total = adminReports.length;
  const parts = statusSteps.map((s) => ({ s, n: count(s), pct: Math.round((count(s) / total) * 100) }));
  const colors = ["#dabd6f", "#057f84", "#b7d7d4"];
  const stats = [
    { label: "Laporan masuk", icon: Inbox, n: total, cap: "Total pada periode contoh" },
    { label: "Menunggu verifikasi", icon: Clock3, n: parts[0].n, cap: "Perlu peninjauan informasi awal" },
    { label: "Diproses", icon: RefreshCw, n: parts[1].n, cap: "Dalam tahap tindak lanjut" },
    { label: "Selesai", icon: CheckCircle2, n: parts[2].n, cap: "Tahapan layanan diselesaikan" },
  ];
  return (
    <AppShell role="admin">
      <PageHead
        title="Dashboard admin"
        subtitle="Ringkasan layanan • 15 Oktober 2026 • seluruh data merupakan ilustrasi."
        action={<Link href="/admin/reports" className="btn btn-primary"><Copy aria-hidden /> Kelola Laporan</Link>}
      />
      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-top">{s.label}<s.icon aria-hidden /></div>
            <div className="stat-num">{s.n}</div>
            <div className="stat-cap">{s.cap}</div>
          </div>
        ))}
      </div>
      <div className="section-head">
        <h2>Laporan terbaru</h2>
        <Link href="/admin/reports" className="link-teal" style={{ fontSize: 12 }}>Lihat Semua Laporan</Link>
      </div>
      <ReportsTable rows={adminReports.slice(0, 3)} admin showCategory />
      <div className="help-grid" style={{ gridTemplateColumns: "minmax(0,1fr) 278px" }}>
        <section className="card" style={{ padding: "18px 20px" }}>
          <h3 className="side-title">Notifikasi baru</h3>
          <div style={{ marginTop: 9 }}>
            <div className="notif">
              <Bell aria-hidden />
              <div className="t"><b>SIS-2026-0142 menunggu verifikasi</b><small>Contoh laporan masuk • 12 Okt 2026, 09.15</small></div>
              <span className="pill pill-amber">Baru</span>
            </div>
            <div className="notif">
              <MessagesSquare aria-hidden />
              <div className="t"><b>2 percakapan belum dibaca</b><small>Sumber chat langsung dan pengalihan AI</small></div>
              <Link href="/admin/chat" className="btn btn-outline btn-sm">Buka Chat</Link>
            </div>
          </div>
        </section>
        <section className="card" style={{ padding: "18px 20px" }}>
          <h3 className="side-title" style={{ fontSize: 14 }}>Komposisi status</h3>
          <div className="seg" role="img" aria-label={parts.map((p) => `${p.pct}% ${p.s}`).join(", ")}>
            {parts.map((p, i) => <span key={p.s} style={{ flex: p.n, background: colors[i] }} />)}
          </div>
          <p className="prose" style={{ fontSize: 10 }}>{parts[0].pct}% Menunggu • {parts[1].pct}% Diproses • {parts[2].pct}% Selesai</p>
          <p className="help" style={{ marginTop: 12 }}>Akses informasi seperlunya untuk tindak lanjut. Hindari menyalin data sensitif.</p>
        </section>
      </div>
    </AppShell>
  );
}

/* ============================== Kelola laporan =========================== */
const MONTH_IDX: Record<string, number> = { Agu: 7, Sep: 8, Okt: 9 };
const NOW = new Date(2026, 9, 15);
function daysAgo(short: string) {
  const [d, m, y] = short.split(" ");
  return Math.round((NOW.getTime() - new Date(+y, MONTH_IDX[m] ?? 0, +d).getTime()) / 86400000);
}
const PER_PAGE = 5;

export function AdminReportsPage() {
  const [q, setQ] = useState("");
  const [range, setRange] = useState("");
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState({ q: "", range: "", status: "" });
  const [page, setPage] = useState(1);

  const rows = useMemo(() => adminReports.filter((r) =>
    (!applied.status || r.status === applied.status) &&
    (!applied.range || daysAgo(r.date) <= +applied.range) &&
    (!applied.q || (r.id + r.summary + r.category).toLowerCase().includes(applied.q.toLowerCase()))), [applied]);

  return (
    <AppShell role="admin">
      <PageHead title="Kelola laporan" subtitle="Tinjau informasi awal dan tahapan tindak lanjut secara terarah." />
      <form className="card filters" style={{ marginBottom: 21 }} onSubmit={(e) => { e.preventDefault(); setApplied({ q, range, status }); setPage(1); }}>
        <TextField label="Cari laporan" icon={Search} placeholder="Nomor atau kata kunci laporan" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField label="Tanggal laporan" icon={CalendarDays} value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="">Semua tanggal</option><option value="7">7 hari terakhir</option><option value="30">30 hari terakhir</option><option value="60">60 hari terakhir</option>
        </SelectField>
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>{statusSteps.map((s) => <option key={s}>{s}</option>)}
        </SelectField>
        <button className="btn btn-outline"><SlidersHorizontal aria-hidden /> Terapkan</button>
      </form>
      {rows.length === 0 ? (
        <div className="table-card empty">
          <div className="empty-icon"><Copy aria-hidden /></div>
          <h3>Laporan tidak ditemukan</h3>
          <p>Coba ubah kata kunci atau filter yang dipakai.</p>
        </div>
      ) : (
        <>
          <ReportsTable rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)} admin showCategory />
          <Pagination page={page} perPage={PER_PAGE} total={rows.length} onPage={setPage} />
        </>
      )}
      <Note>Gunakan nomor laporan untuk koordinasi. Daftar ini tidak menampilkan nama, identitas, atau rincian sensitif pengguna.</Note>
    </AppShell>
  );
}

/* ============================== Detail laporan =========================== */
export function AdminReportDetail({ id }: { id: string }) {
  const r = findReport(decodeURIComponent(id));
  const [current, setCurrent] = useState<Status>(r.status);
  const [next, setNext] = useState<Status>(statusSteps[Math.min(statusSteps.indexOf(r.status) + 1, 2)]);
  const [note, setNote] = useState("Informasi awal ditinjau. Pilihan pendampingan dapat dibahas melalui chat sesuai kesiapan pengguna.");
  const [saved, setSaved] = useState<null | { note: string }>(null);
  const [toast, setToast] = useState("");
  const closeToast = useCallback(() => setToast(""), []);
  const updated = saved !== null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setCurrent(next);
    setSaved({ note });
    setToast(`Status diperbarui ke ${next} • simulasi berhasil`);
  }

  return (
    <AppShell role="admin">
      <div className="page-head" style={{ marginBottom: 21 }}>
        <div>
          <h1>{r.id}</h1>
          <p>Kelola Laporan / Detail • {updated ? `diperbarui ${DEMO_NOW}` : "dibuat 12 Oktober 2026, 09.15"}</p>
        </div>
        <StatusPill status={current} />
      </div>
      <div className="two-col wide-right" style={{ gridTemplateColumns: "minmax(0,1fr) 330px" }}>
        <div className="stack">
          <IncidentCard report={r} />
          {updated
            ? <PrivacyNote title="Contoh tindak lanjut tersimpan">{saved.note} Tidak ada perubahan data nyata.</PrivacyNote>
            : <Note>Data ilustrasi • tidak ada identitas pribadi. Akses dan catatan digunakan seperlunya untuk contoh tindak lanjut.</Note>}
          <section className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "17px 21px" }}>
            <div>
              <h3 className="side-title" style={{ fontSize: 13 }}>Percakapan terkait</h3>
              <p className="help" style={{ marginTop: 5 }}>{r.id} • chat langsung</p>
            </div>
            <Link href="/admin/chat" className="btn btn-outline btn-sm"><Headset aria-hidden /> Buka Chat</Link>
          </section>
        </div>
        <div className="stack">
          <form className="card" onSubmit={submit}>
            <h3 className="side-title">Tindak lanjut petugas</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "19px 0 16px", alignItems: "end" }}>
              <div>
                <div className="help" style={{ margin: "0 0 12px", fontSize: 11 }}>Status saat ini</div>
                <StatusPill status={current} />
              </div>
              <SelectField label="Status berikutnya" value={next} onChange={(e) => setNext(e.target.value as Status)}>
                {statusSteps.map((s) => <option key={s}>{s}</option>)}
              </SelectField>
            </div>
            <div className="field">
              <label className="label" htmlFor="followup">Catatan tindak lanjut</label>
              <textarea id="followup" className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
              <button className="btn btn-primary"><Check aria-hidden /> Perbarui Status</button>
              <span className="help" style={{ margin: 0 }}>Catatan ini merupakan contoh, bukan tindakan nyata.</span>
            </div>
          </form>
          <section className="card">
            <h3 className="side-title" style={{ fontSize: 15 }}>Riwayat status</h3>
            <Stepper steps={timeline(current, r.date, updated ? DEMO_NOW_SHORT : undefined)} />
          </section>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={closeToast} />}
    </AppShell>
  );
}

/* ================================= Chat ================================= */
const adminThread: Msg[] = [
  { id: "m1", from: "them", author: "Petugas A • kamu", time: "10.24", text: "Halo, terima kasih sudah menghubungi SISKA. Kamu dapat melihat tahapan di Detail Laporan. Jika nyaman, kita bisa membahas pilihan dukungan yang ingin kamu ketahui." },
];

export function AdminChatPage() {
  const [tab, setTab] = useState<"all" | "direct" | "ai">("all");
  const list = useMemo(() => adminConversations.filter((c) => tab === "all" || c.kind === tab), [tab]);
  const tabs = [["all", "Semua percakapan"], ["direct", "Chat langsung"], ["ai", "Dialihkan dari SISKA AI"]] as const;
  return (
    <AppShell role="admin">
      <PageHead title="Chat pengguna" subtitle="Bedakan chat langsung dan pengalihan informasi yang disetujui pengguna." />
      <div className="search-row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div className="chips" style={{ padding: 0 }} role="tablist">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <span className="help" style={{ margin: 0 }}>2 belum dibaca • data ilustrasi</span>
      </div>
      <ChatWorkspace
        key={tab}
        conversations={list}
        initialThread={adminThread}
        header={(c) => ({
          icon: User,
          title: `Pengguna demo • ${c?.title ?? ""}`,
          subtitle: c?.kind === "ai" ? "Dialihkan dari SISKA AI • ringkasan disetujui pengguna" : "Chat langsung • petugas dan pengguna",
          chip: <span className="chip chip-teal">Terbuka</span>,
        })}
        banner={(c) => c?.kind === "ai" ? (
          <Note title="Ringkasan disetujui pengguna • persetujuan berbagi aktif">
            Pengguna ingin mengetahui tahapan laporan dan pilihan pendampingan. Tidak ada identitas atau rincian kejadian yang dibagikan. Riwayat AI lengkap tidak ditampilkan.
          </Note>
        ) : null}
        dateLabel="15 Oktober 2026 • Riwayat percakapan ilustrasi"
        meLabel="Petugas A • kamu"
        placeholder="Tulis balasan untuk pengguna..."
        helper="Gunakan bahasa yang empatik. Demo ini tidak benar-benar mengirim balasan."
      />
      <div style={{ marginTop: 19 }}>
        <Note title="Batas akses percakapan">
          Hanya ringkasan yang disetujui pengguna ditampilkan untuk pengalihan AI. Jangan meminta riwayat AI lengkap atau rincian pribadi yang tidak diperlukan. Demo ini tidak menerima atau mengirim pesan.
        </Note>
      </div>
    </AppShell>
  );
}

/* ====================== Pengaturan admin (knowledge base) ================ */
export function AdminSettingsPage() {
  const [docs, setDocs] = useState([{ name: "Pedoman pengaduan kampus.pdf", meta: "PDF • data contoh" }, { name: "Panduan akses layanan.pdf", meta: "PDF • data contoh" }]);
  const [toast, setToast] = useState("");
  const closeToast = useCallback(() => setToast(""), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);

  return (
    <AppShell role="admin">
      <PageHead title="Pengaturan admin" subtitle="Kelola dokumen sumber dan indeks pengetahuan untuk SISKA AI." />
      <div className="two-col wide-right" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <section className="card">
          <h3 className="side-title">Unggah dokumen PDF</h3>
          <div className="field" style={{ margin: "16px 0" }}>
            <span className="label">Pilih file PDF</span>
            <div className="dropzone" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}>
              <div className="top"><FileUp aria-hidden /> {picked ? picked.name : "Pilih file PDF"}</div>
              <small>Dokumen harus diverifikasi sumber dan izinnya sebelum dipakai sebagai knowledge base.</small>
              <input ref={fileRef} type="file" hidden accept="application/pdf" onChange={(e) => setPicked(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <button className="btn btn-primary" disabled={!picked} onClick={() => {
            if (!picked) return;
            setDocs([{ name: picked.name, meta: "PDF • baru diunggah (simulasi)" }, ...docs]);
            setPicked(null); setToast("Dokumen ditambahkan • simulasi berhasil");
          }}><FileUp aria-hidden /> Unggah dokumen</button>
        </section>
        <section className="card">
          <h3 className="side-title">Indeks knowledge base</h3>
          <p className="prose" style={{ fontSize: 12, margin: "12px 0 17px" }}>Reindex akan memproses dokumen, membagi teks menjadi chunk, membuat embedding, dan memperbarui indeks pencarian.</p>
          <button className="btn btn-outline" onClick={() => setToast("Reindex dijalankan • simulasi berhasil")}><RefreshCw aria-hidden /> Reindex knowledge base</button>
        </section>
      </div>
      <section className="card" style={{ marginTop: 17 }}>
        <h3 className="side-title" style={{ marginBottom: 5 }}>Daftar dokumen</h3>
        {docs.length === 0 && <p className="help">Belum ada dokumen.</p>}
        {docs.map((d, i) => (
          <div key={d.name + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i === docs.length - 1 ? 0 : "1px solid var(--line)" }}>
            <FileText aria-hidden size={17} color="var(--teal)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 12, color: "var(--ink)" }}>{d.name}</b>
              <div className="help" style={{ margin: "2.5px 0 0" }}>{d.meta}</div>
            </div>
            <button className="btn-ghost-danger" aria-label={`Hapus ${d.name}`} onClick={() => setDocs(docs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
      </section>
      <div style={{ marginTop: 17 }}><Note icon={ShieldCheck}>Dokumen yang diunggah hanya dipakai sebagai sumber informasi umum SISKA AI dan tidak boleh memuat data pribadi pengguna.</Note></div>
      {toast && <Toast message={toast} onClose={closeToast} />}
    </AppShell>
  );
}
