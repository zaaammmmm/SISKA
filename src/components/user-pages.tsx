"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Bot, BookOpen, CalendarDays, Check, CheckCircle2, Clock, Clock3, Copy, Download, Headset, Heart,
  HeartHandshake, LogOut, Mail, MapPin, MessageCircleWarning, Plus, RefreshCw, Search, Send, ShieldCheck,
  SlidersHorizontal, Upload, User, UserRound, Users,
} from "lucide-react";
import { signOut, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { AppShell } from "@/components/shell";
import { ChatWorkspace, type Msg } from "@/components/chat";
import { IncidentCard, PrivacyNote } from "@/components/report-parts";
import {
  FileItem, Modal, Note, PageHead, PasswordField, Pagination, ReportsTable, SelectField, StatusPill, Stepper, TextField,
  Toast, fileMeta,
} from "@/components/ui";
import { auth } from "@/lib/firebase";
import { eduItems, findReport, SAMPLE_FILES, timeline, userConversations, userReports, type Status } from "@/lib/demo-data";
import { useCurrentUser } from "@/lib/use-current-user";

/* =============================== Dashboard =============================== */
export function UserDashboard() {
  const me = useCurrentUser();
  const count = (s: Status) => userReports.filter((r) => r.status === s).length;
  const stats = [
    { label: "Total laporan", icon: Copy, n: userReports.length, cap: "Seluruh laporan ilustrasi" },
    { label: "Menunggu verifikasi", icon: Clock3, n: count("Menunggu verifikasi"), cap: "Informasi awal akan ditinjau" },
    { label: "Diproses", icon: RefreshCw, n: count("Diproses"), cap: "Tahap tindak lanjut" },
    { label: "Selesai", icon: CheckCircle2, n: count("Selesai"), cap: "Riwayat tetap dapat dilihat" },
  ];
  return (
    <AppShell role="user">
      <PageHead
        title={`Halo, ${me.name}`}
        subtitle="Kamu bisa melanjutkan kapan pun merasa siap."
        action={<Link href="/user/new-report" className="btn btn-primary"><Plus aria-hidden /> Buat Laporan Baru</Link>}
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
        <Link href="/user/reports" className="link-arrow"><ArrowRight aria-hidden /> Lihat Semua</Link>
      </div>
      <ReportsTable rows={userReports.slice(0, 3)} />
      <div className="help-grid">
        <section className="card help-card">
          <h3>Butuh bantuan untuk langkah berikutnya?</h3>
          <p>Pilih berbicara dengan petugas atau membaca informasi awal dari SISKA AI. Keduanya memiliki peran berbeda.</p>
          <div className="row">
            <Link href="/user/chat" className="btn btn-primary"><Headset aria-hidden /> Chat dengan Admin</Link>
            <Link href="/user/ai" className="btn btn-outline"><Bot aria-hidden /> Tanya SISKA AI</Link>
          </div>
        </section>
        <section className="card help-card">
          <BookOpen className="top" aria-hidden />
          <h3>Pahami hak dan pilihanmu</h3>
          <p>Baca materi tentang persetujuan, dukungan, dan privasi.</p>
          <Link href="/user/education" className="link-teal" style={{ paddingLeft: 9 }}>Buka Edukasi</Link>
        </section>
      </div>
    </AppShell>
  );
}

/* ============================== Buat laporan ============================= */
const initialForm = {
  title: "Permohonan tindak lanjut pesan tidak nyaman",
  category: "Pelecehan melalui pesan",
  date: "11 Oktober 2026",
  time: "19.30",
  place: "Ruang percakapan daring komunitas",
  story: "Saya menerima pesan yang membuat saya tidak nyaman dalam kegiatan komunitas. Saya ingin mengetahui pilihan tindak lanjut dan pendampingan. Rincian tambahan akan saya sampaikan saat siap.",
};
type Attach = { name: string; meta: string };

export function NewReportPage() {
  const router = useRouter();
  const [f, setF] = useState(initialForm);
  const [files, setFiles] = useState<Attach[]>([{ name: SAMPLE_FILES[0].name, meta: SAMPLE_FILES[0].meta }]);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeToast = useCallback(() => setToast(""), []);
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  function addFiles(list: FileList | null) {
    if (!list) return;
    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    const next = Array.from(list).filter((x) => allowed.includes(x.type)).map((x) => ({ name: x.name, meta: fileMeta(x, "belum dikirim") }));
    setFiles((cur) => [...cur, ...next]);
  }

  function onSubmit(e: React.FormEvent) { e.preventDefault(); setConfirm(true); }
  function doSend() {
    setConfirm(false);
    setToast("Laporan terkirim • simulasi berhasil");
    setTimeout(() => router.push("/user/reports"), 1200);
  }

  return (
    <AppShell role="user">
      <PageHead title="Buat laporan" subtitle="Mulai dengan informasi yang kamu ingat dan nyaman bagikan." />
      <div className="two-col">
        <form className="card" onSubmit={onSubmit} style={{ padding: "21px 21px 23px" }}>
          <h2 className="card-title" style={{ fontSize: 15, marginBottom: 16 }}>Informasi awal laporan</h2>
          <div className="form-grid">
            <TextField label="Judul laporan" required value={f.title} onChange={upd("title")} />
            <SelectField label="Kategori" value={f.category} onChange={upd("category")}>
              {["Pelecehan melalui pesan", "Pelecehan fisik", "Kekerasan berbasis gender", "Informasi dan dukungan", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
            </SelectField>
            <TextField label="Tanggal kejadian" icon={CalendarDays} value={f.date} onChange={upd("date")} placeholder="mis. 11 Oktober 2026" />
            <TextField label="Waktu kejadian (perkiraan)" icon={Clock} value={f.time} onChange={upd("time")} placeholder="mis. 19.30" />
            <TextField className="full" label="Lokasi / media kejadian" icon={MapPin} value={f.place} onChange={upd("place")} />
            <div className="field full">
              <label className="label" htmlFor="story">Kronologi (sesuai kesiapanmu)</label>
              <textarea id="story" className="textarea" required rows={3} value={f.story} onChange={upd("story")} />
              <p className="help">Boleh tulis singkat atau lewati detail yang belum nyaman dibagikan.</p>
            </div>
            <div className="field full">
              <span className="label">Bukti pendukung (opsional)</span>
              <div
                className={`dropzone ${drag ? "drag" : ""}`} role="button" tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              >
                <div className="top"><Upload aria-hidden /> Pilih file atau letakkan di sini • PDF, JPG, PNG</div>
                <small>Hindari data pihak lain yang tidak diperlukan.</small>
                <input ref={fileRef} type="file" hidden multiple accept="application/pdf,image/png,image/jpeg" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </div>
              <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
                {files.map((x, i) => <FileItem key={x.name + i} doc name={x.name} meta={x.meta} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />)}
              </div>
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-primary"><Send aria-hidden /> Kirim Laporan</button>
            <button type="button" className="btn btn-outline" onClick={() => setToast("Draft disimpan • simulasi berhasil")}>Simpan Draft</button>
          </div>
        </form>

        <div className="stack">
          <section className="card" style={{ padding: "21px 23px" }}>
            <h3 className="side-title" style={{ fontSize: 15 }}>Pelan-pelan, tidak apa-apa</h3>
            <HeartHandshake aria-hidden size={23} color="var(--teal)" style={{ margin: "19px 0 14px" }} />
            <p className="prose" style={{ fontSize: 12 }}>Ceritakan informasi yang kamu rasa cukup untuk memulai. Kamu tidak harus mengingat semuanya.</p>
            <hr className="divider" />
            <div className="sec-title" style={{ margin: "0 0 7px" }}>Sebelum melanjutkan</div>
            <p className="prose" style={{ fontSize: 11 }}>Periksa tanggal, media kejadian, dan lampiran. Simpan draft jika kamu ingin berhenti sejenak.</p>
          </section>
          <Note title="Pilihan informasimu">
            Bagikan hanya yang diperlukan. Gunakan nama samaran pada contoh lampiran; jangan sertakan password.
          </Note>
          <div><Link href="/user/chat" className="btn btn-outline"><Headset aria-hidden /> Chat dengan Admin</Link></div>
        </div>
      </div>

      {confirm && (
        <Modal onClose={() => setConfirm(false)} labelledBy="confirm-title">
          <div className="modal-ico"><Check aria-hidden /></div>
          <h2 id="confirm-title">Kirim laporan ini?</h2>
          <span className="chip chip-teal">Demo • konfirmasi ilustrasi</span>
          <p>Periksa kembali informasi dan lampiran yang kamu pilih. Kamu dapat kembali mengubah laporan sebelum melanjutkan.</p>
          <Note title="Menunggu persetujuanmu">Laporan hanya diteruskan setelah kamu memilih Kirim Laporan. Dalam demo ini, tidak ada data yang benar-benar dikirim.</Note>
          <div className="actions">
            <button className="btn btn-primary" onClick={doSend}>Kirim Laporan</button>
            <button className="btn btn-outline" onClick={() => setConfirm(false)}>Kembali Mengedit</button>
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast} onClose={closeToast} />}
    </AppShell>
  );
}

/* ============================ Riwayat laporan ============================ */
const PER_PAGE = 5;
function HistoryInner() {
  const sp = useSearchParams();
  const forceEmpty = sp.get("state") === "empty";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState({ q: "", status: "" });
  const [page, setPage] = useState(1);

  const source = forceEmpty ? [] : userReports;
  const rows = useMemo(() => source.filter((r) =>
    (!applied.status || r.status === applied.status) &&
    (!applied.q || (r.id + r.summary).toLowerCase().includes(applied.q.toLowerCase()))), [source, applied]);
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <PageHead
        title="Riwayat laporan"
        subtitle={source.length === 0 ? "Ruang untuk mengikuti langkah yang sudah kamu ambil." : "Lihat informasi dan tahapan laporanmu dalam satu tempat."}
        action={source.length > 0 ? <Link href="/user/new-report" className="btn btn-primary"><Plus aria-hidden /> Buat Laporan Baru</Link> : undefined}
      />
      <form className="card filters" onSubmit={(e) => { e.preventDefault(); setApplied({ q, status }); setPage(1); }} style={{ marginBottom: 21 }}>
        <TextField label="Cari laporan" icon={Search} placeholder="Nomor atau kata kunci laporan" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option><option>Menunggu verifikasi</option><option>Diproses</option><option>Selesai</option>
        </SelectField>
        <button className="btn btn-outline"><SlidersHorizontal aria-hidden /> Terapkan</button>
      </form>

      {rows.length === 0 ? (
        <div className="table-card empty">
          <div className="empty-icon"><Copy aria-hidden /></div>
          <h3>{source.length === 0 ? "Belum ada laporan" : "Laporan tidak ditemukan"}</h3>
          <p>{source.length === 0 ? "Kamu bisa memulai saat merasa siap. Tidak perlu terburu-buru." : "Coba ubah kata kunci atau filter status."}</p>
          <Link href="/user/new-report" className="btn btn-primary"><Plus aria-hidden /> Buat Laporan Baru</Link>
          <Link href="/user/education" className="link-teal">Pelajari layanan terlebih dahulu</Link>
        </div>
      ) : (
        <>
          <ReportsTable rows={pageRows} />
          <Pagination page={page} perPage={PER_PAGE} total={rows.length} onPage={setPage} />
        </>
      )}
      <div style={{ marginTop: source.length === 0 ? 24 : 0 }}>
        <Note>
          {source.length === 0
            ? "Jika ingin memahami pilihan layanan sebelum melapor, kamu dapat bertanya kepada admin atau SISKA AI tanpa menuliskan detail kejadian."
            : "Status di sini adalah contoh tahapan layanan, bukan hasil penilaian atas pengalamanmu. Untuk informasi tindak lanjut, pilih Chat dengan Admin."}
        </Note>
      </div>
    </>
  );
}
export function HistoryPage() {
  return <AppShell role="user"><Suspense><HistoryInner /></Suspense></AppShell>;
}

/* ============================== Detail laporan =========================== */
export function UserReportDetail({ id }: { id: string }) {
  const r = findReport(decodeURIComponent(id));
  return (
    <AppShell role="user">
      <PageHead
        title="Detail laporan"
        subtitle={<>Riwayat Laporan / {r.id}</>}
        action={<button className="btn btn-outline"><Download aria-hidden /> Ekspor Ringkasan</button>}
      />
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 23, fontWeight: 600, color: "var(--ink)", letterSpacing: "-.01em" }}>{r.id}</div>
          <p className="prose" style={{ fontSize: 12, marginTop: 5 }}>{r.summary}</p>
        </div>
        <StatusPill status={r.status} />
      </div>
      <div className="two-col wide-right" style={{ gridTemplateColumns: "minmax(0,1fr) 295px" }}>
        <div className="stack">
          <IncidentCard report={r} />
          <PrivacyNote title="Informasi tetap dalam kendalimu">
            Detail di halaman ini adalah data ilustrasi. Bagikan informasi tambahan hanya jika kamu merasa siap; petugas dapat membantu menjelaskan tahap berikutnya.
          </PrivacyNote>
        </div>
        <div className="stack">
          <section className="card">
            <h3 className="side-title">Tahapan laporan</h3>
            <Stepper steps={timeline(r.status, r.date)} />
          </section>
          <section className="card">
            <h3 className="side-title">Ingin bertanya?</h3>
            <p className="prose" style={{ fontSize: 12, margin: "12px 0 17px" }}>Untuk membahas laporan pribadi, pilih percakapan dengan petugas SISKA.</p>
            <Link href="/user/chat" className="btn btn-primary"><Headset aria-hidden /> Chat dengan Admin</Link>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

/* ================================= Chat ================================= */
function ModeCards({ active }: { active: "admin" | "ai" }) {
  return (
    <div className="mode-cards">
      <Link href="/user/chat" className={`mode-card ${active === "admin" ? "active" : ""}`}>
        <div className="mode-top"><Headset aria-hidden /><b>Chat dengan Admin</b>{active === "admin" && <em>Aktif</em>}</div>
        <p>Berkomunikasi langsung dengan petugas SISKA.</p>
      </Link>
      <Link href="/user/ai" className={`mode-card ${active === "ai" ? "active" : ""}`}>
        <div className="mode-top"><Bot aria-hidden /><b>Chatbot SISKA AI</b>{active === "ai" ? <em>Aktif</em> : <em>Mulai Chat AI →</em>}</div>
        <p>Dapatkan informasi awal dan panduan penggunaan layanan.</p>
      </Link>
    </div>
  );
}

const adminThread: Msg[] = [
  { id: "m1", from: "me", author: "Kamu", time: "10.20", text: "Halo, saya ingin mengetahui langkah setelah membuat laporan." },
  { id: "m2", from: "them", author: "Petugas SISKA • A", time: "10.24", text: "Halo, terima kasih sudah menghubungi SISKA. Kamu dapat melihat tahapan di Detail Laporan. Jika nyaman, kita bisa membahas pilihan dukungan yang ingin kamu ketahui." },
];

export function UserChatPage() {
  const [hasAtt, setHasAtt] = useState(false);
  return (
    <AppShell role="user">
      <PageHead title="Chat dengan Admin" subtitle={hasAtt ? "Contoh pemilihan lampiran • file belum dikirim." : "Percakapan dengan petugas manusia, terpisah dari SISKA AI."} />
      <ModeCards active="admin" />
      <ChatWorkspace
        conversations={userConversations}
        initialThread={adminThread}
        header={{ icon: Headset, title: "Petugas SISKA • A", subtitle: "Petugas manusia • ketersediaan contoh: sedang bertugas", chip: <span className="chip chip-teal">Chat langsung</span> }}
        dateLabel="15 Oktober 2026 • Riwayat percakapan ilustrasi"
        meLabel="Kamu"
        placeholder="Tulis pesan untuk petugas..."
        helper="Bagikan seperlunya. Demo ini tidak benar-benar mengirim pesan."
        attachHelper="Bagikan hanya yang kamu nyaman sampaikan. Lampiran ini hanya contoh."
        onAttachmentChange={setHasAtt}
      />
      <div style={{ marginTop: 19 }}>
        {hasAtt
          ? <Note>Periksa lampiran sebelum membagikan. Hapus dengan ikon × atau pilih Batal jika belum nyaman. Tidak ada file yang diunggah pada demo ini.</Note>
          : <Note>Privasi: sampaikan hanya informasi yang diperlukan. Ketersediaan petugas dan pesan di atas adalah contoh; demo ini tidak mengirim pesan.</Note>}
      </div>
    </AppShell>
  );
}

const aiConversations = [
  { id: "ai1", title: "Percakapan baru", time: "10.24", line1: "SISKA AI", line2: "Informasi layanan", kind: "ai" as const },
  { id: "ai2", title: "Alur pelaporan", time: "09.40", line1: "SISKA AI", line2: "Panduan layanan", kind: "ai" as const },
];

export function UserAiPage() {
  return (
    <AppShell role="user">
      <PageHead title="Chatbot AI" subtitle="Asisten informasi awal, terpisah dari petugas manusia." />
      <ModeCards active="ai" />
      <ChatWorkspace
        conversations={aiConversations}
        initialThread={[{ id: "g", from: "them", author: "SISKA AI", time: "10.24", text: "Halo, saya SISKA AI. Saya dapat membantu menjelaskan informasi umum tentang alur pelaporan dan layanan yang tersedia. Saya bukan layanan darurat atau pengganti pendamping profesional." }]}
        header={{ icon: Bot, title: "SISKA AI • Asisten informasi", subtitle: "Jawaban AI perlu diverifikasi untuk informasi penting", chip: <span className="chip chip-teal">Chat AI</span> }}
        dateLabel="15 Oktober 2026 • Riwayat percakapan ilustrasi"
        meLabel="Kamu"
        placeholder="Tanyakan informasi umum..."
        helper="Jangan masukkan nama, kronologi rinci, atau data pribadi. Balasan di sini hanya simulasi."
        autoReply={{ author: "SISKA AI", text: "Terima kasih atas pertanyaanmu. Ini adalah balasan simulasi; integrasi AI produksi perlu dihubungkan melalui backend tepercaya. Untuk hal yang bersifat pribadi, silakan pilih Chat dengan Admin." }}
        allowAttach={false}
        listTitle="Riwayat chat AI"
      />
      <div style={{ marginTop: 19 }}>
        <Note>Privasi: AI hanya memberi informasi awal. Jawabannya bukan nasihat medis atau hukum dan bukan pengganti pendamping profesional.</Note>
      </div>
    </AppShell>
  );
}

/* ================================ Edukasi ================================ */
const eduIcon = { heart: Heart, alert: MessageCircleWarning, users: Users, shield: ShieldCheck };
export function EducationPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "guide">("all");
  const items = eduItems.filter((e) => (tab === "all" || e.guide) && (e.title + e.body + e.tag).toLowerCase().includes(q.toLowerCase()));
  return (
    <AppShell role="user">
      <PageHead title="Edukasi dan informasi dukungan" subtitle="Materi non-grafis untuk memahami hak, batasan, dan pilihanmu." />
      <div className="search-row">
        <TextField label="Cari materi" icon={Search} placeholder="Cari persetujuan, pendampingan, atau privasi" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips" role="tablist">
          <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>Semua materi</button>
          <button role="tab" aria-selected={tab === "guide"} className={tab === "guide" ? "on" : ""} onClick={() => setTab("guide")}>Panduan layanan</button>
        </div>
      </div>
      <div className="edu-grid">
        {items.map((e) => {
          const I = eduIcon[e.icon];
          return (
            <article className="edu-card" key={e.id}>
              <div className="edu-top"><I aria-hidden /><span className="chip">{e.tag}</span></div>
              <h3>{e.title}</h3>
              <p>{e.body}</p>
              <div className="edu-foot"><span>{e.meta}</span><button className="link-arrow"><ArrowRight aria-hidden /> Baca Materi</button></div>
            </article>
          );
        })}
        {items.length === 0 && <p className="help">Materi tidak ditemukan. Coba kata kunci lain.</p>}
      </div>
      <div style={{ marginTop: 19 }}>
        <Note title="Dukungan sesuai kebutuhanmu">Informasi ini bukan nasihat medis atau hukum. Untuk pilihan layanan terkait situasimu, kamu dapat berbicara dengan petugas atau pendamping profesional.</Note>
      </div>
    </AppShell>
  );
}

/* ================================= Profil ================================ */
export function ProfilePage() {
  const router = useRouter();
  const me = useCurrentUser();
  const [username, setUsername] = useState<string | null>(null);
  const [pw, setPw] = useState({ cur: "", next: "", conf: "" });
  const [pwError, setPwError] = useState("");
  const [toast, setToast] = useState("");
  const closeToast = useCallback(() => setToast(""), []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (auth?.currentUser) await updateProfile(auth.currentUser, { displayName: (username ?? me.username).trim() });
      setToast("Perubahan disimpan" + (auth ? "" : " • simulasi berhasil"));
    } catch { setToast("Perubahan belum berhasil disimpan"); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (pw.next.length < 6) return setPwError("Password baru minimal 6 karakter.");
    if (pw.next !== pw.conf) return setPwError("Konfirmasi password belum sama.");
    try {
      const u = auth?.currentUser;
      if (u && u.email) {
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw.cur));
        await updatePassword(u, pw.next);
      }
      setPw({ cur: "", next: "", conf: "" });
      setToast("Password diperbarui" + (auth ? "" : " • simulasi berhasil"));
    } catch { setPwError("Password saat ini belum sesuai atau sesi perlu diperbarui. Coba login ulang."); }
  }

  async function logout() { try { if (auth) await signOut(auth); } finally { router.push("/login"); } }

  return (
    <AppShell role="user">
      <PageHead title="Profil dan pengaturan" subtitle="Kelola akunmu tanpa perlu menambahkan data pribadi yang tidak diperlukan." />
      <div className="two-col wide-right" style={{ gridTemplateColumns: "minmax(0,1fr) 260px" }}>
        <div className="stack">
          <form className="card" onSubmit={saveProfile}>
            <h2 className="card-title" style={{ fontSize: 15 }}>Informasi akun</h2>
            <div className="profile-head">
              <span className="profile-av"><UserRound aria-hidden /></span>
              <div><b>{me.name}</b><small>Akun ilustrasi • bukan identitas nyata</small></div>
            </div>
            <div className="stack" style={{ gap: 16 }}>
              <TextField label="Username" icon={User} value={username ?? me.username} onChange={(e) => setUsername(e.target.value)} />
              <TextField label="Email" icon={Mail} type="email" value={me.email} readOnly />
            </div>
            <div className="actions"><button className="btn btn-primary">Simpan Perubahan</button></div>
          </form>
          <form className="card" onSubmit={changePassword}>
            <h2 className="card-title" style={{ fontSize: 15, marginBottom: 17 }}>Pengaturan password</h2>
            <div className="form-grid">
              <PasswordField label="Password saat ini" placeholder="Masukkan password" autoComplete="current-password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} />
              <PasswordField label="Password baru" placeholder="Buat password unik" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <PasswordField className="full" label="Konfirmasi password baru" placeholder="Ulangi password baru" autoComplete="new-password" value={pw.conf} onChange={(e) => setPw({ ...pw, conf: e.target.value })} error={pwError} />
            </div>
            <div className="actions"><button className="btn btn-outline">Ubah Password</button></div>
          </form>
        </div>
        <div className="stack">
          <Note title="Keamanan akun">Gunakan password yang unik. Pertimbangkan untuk logout setelah menggunakan perangkat bersama.</Note>
          <section className="card">
            <h3 className="side-title" style={{ fontSize: 14 }}>Keluar dari akun</h3>
            <p className="prose" style={{ fontSize: 11, margin: "12px 0 16px" }}>Pastikan draft yang diperlukan sudah disimpan sebelum meninggalkan layanan.</p>
            <button className="btn btn-outline btn-sm" onClick={logout}><LogOut aria-hidden /> Logout</button>
          </section>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={closeToast} />}
    </AppShell>
  );
}
