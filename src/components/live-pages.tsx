"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where, type Unsubscribe } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import { EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, updatePassword, updateProfile } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { withBasePath } from "@/lib/base-path";
import { AppShell } from "@/components/shell";
import { AiChatPanel } from "@/components/ai-chat";
import {
  SiskaApiClientError, fetchReportsPage, fetchReportsSummary, fetchReportDetail, fetchNotifications,
  submitNewReport, uploadEvidenceMultipart, openConversation, fetchConversationMessages,
  postConversationMessage, fetchMessageAttachmentSignedUrl, fetchEvidenceSignedDownloadUrl, transitionReportStatusByAdmin,
  updateConversationStatusByAdmin, fetchMyProfile, updateMyProfileName, updateMyProfileWithAvatar,
  fetchAiRagDocumentsByAdmin, addAiRagDocumentByAdmin, uploadAiRagPdfByAdmin, deleteAiRagDocumentByAdmin, resetAiRagDocumentsByAdmin,
  fetchKnowledgeDocumentsByAdmin, uploadKnowledgePdfByAdmin, deleteKnowledgeDocumentByAdmin, triggerKnowledgeReindexByAdmin, fetchAuditEventsByAdmin,
  broadcastNotificationByAdmin, markConversationAsRead, markNotificationsReadByTarget, fetchConversations,
} from "@/lib/api-client";
import { useUnreadSummary } from "@/lib/use-unread-summary";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notification-events";
import type { SerializedReport, SerializedReportDetail, SerializedConversation, SerializedMessage, ReportsSummaryResult, SerializedAiRagDocument, SerializedKnowledgeDocument, SerializedAuditEvent, SignedDownloadUrlResult } from "@/types/api";
import { ALLOWED_STATUS_TRANSITIONS, isStatusNoteRequired, type ReportStatus } from "@/types/domain";

const STATUS: Record<ReportStatus, string> = {
  submitted: "Menunggu tinjauan", under_review: "Dalam peninjauan", in_progress: "Dalam proses", resolved: "Selesai", rejected: "Ditolak",
};
const STATUS_CLASS: Record<ReportStatus, string> = {
  submitted: "amber", under_review: "blue", in_progress: "teal", resolved: "green", rejected: "plum",
};
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Tidak dicantumkan";
const errorText = (e: unknown) => e instanceof SiskaApiClientError ? e.message : "Permintaan gagal. Periksa koneksi dan coba kembali.";
function Head({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>; }
function Alert({ children }: { children: React.ReactNode }) { return <p className="alert" role="alert">{children}</p>; }
function StatusLabel({ status }: { status: ReportStatus }) { return <span className={`pill ${STATUS_CLASS[status]}`}>{STATUS[status]}</span>; }
function ReportRows({ rows, admin = false, filtering = false, unreadReportIds }: { rows: SerializedReport[]; admin?: boolean; filtering?: boolean; unreadReportIds?: ReadonlySet<string> }) {
  const router = useRouter();
  if (!rows.length) {
    return (
      <div className="empty">
        <h3>{filtering ? "Tidak ada laporan yang cocok" : admin ? "Belum ada laporan masuk" : "Kamu belum membuat laporan"}</h3>
        <p>
          {filtering
            ? "Ubah kata kunci atau pilihan status, lalu coba lagi."
            : admin
              ? "Laporan baru akan muncul di sini."
              : "Kamu bisa memulai kapan pun siap. Tidak ada yang terkirim sampai kamu menekan Kirim laporan."}
        </p>
        {!admin && !filtering && <Link href="/user/new-report" className="btn btn-primary">Buat laporan</Link>}
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th scope="col">Nomor</th><th scope="col">Kategori</th><th scope="col">Tanggal</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead>
        <tbody>
          {rows.map(r => {
            const href = `${admin ? "/admin" : "/user"}/reports/${encodeURIComponent(r.id)}`;
            const unread = admin && unreadReportIds?.has(r.id);
            return (
              <tr
                key={r.id}
                className={admin ? `report-row${unread ? " report-row-unread" : ""}` : undefined}
                onClick={admin ? () => router.push(href) : undefined}
                onKeyDown={admin ? event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(href);
                  }
                } : undefined}
                tabIndex={admin ? 0 : undefined}
                role={admin ? "link" : undefined}
                aria-label={admin ? `Buka detail laporan ${r.id}${unread ? ", belum dibuka" : ""}` : undefined}
              >
                <td data-label="Nomor">
                  <span className="report-number-cell"><b>{r.id}</b>{unread && <span className="report-unread-label"><span aria-hidden="true"/>Belum dibuka</span>}</span>
                </td>
                <td data-label="Kategori">{r.category}</td>
                <td data-label="Tanggal" className="num">{dateText(r.createdAt)}</td>
                <td data-label="Status"><StatusLabel status={r.status}/></td>
                <td data-label="Aksi"><Link className="link-teal" href={href} onClick={event => { if (admin) event.stopPropagation(); }}>Lihat detail<span className="sr-only"> laporan {r.id}</span></Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LiveUserDashboard() {
  const [summary, setSummary] = useState<ReportsSummaryResult | null>(null);
  const [rows, setRows] = useState<SerializedReport[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [s, r] = await Promise.all([fetchReportsSummary(), fetchReportsPage({ limit: 5 })]); setSummary(s); setRows(r.items); } catch(e) { setError(errorText(e)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const stats = [{ label: "Total laporan", value: summary?.total ?? 0 }, ...Object.entries(STATUS).map(([key, label]) => ({ label, value: summary?.byStatus[key as ReportStatus] ?? 0 }))];
  return (
    <AppShell role="user">
      <Head title="Dashboard" subtitle="Ringkasan laporan dan akses layanan SISKA." action={<Link className="btn btn-primary" href="/user/new-report">Buat laporan</Link>}/>
      {error && <Alert>{error}</Alert>}
      <div className="stats">{stats.map(x => <div className={`stat ${x.value === 0 ? "zero" : ""}`} key={x.label}><div className="stat-top">{x.label}</div><div className="stat-num">{x.value}</div></div>)}</div>
      <div className="section-head">
        <h2>Laporan terbaru</h2>
        <span className="row">
          <button type="button" className="link-teal" onClick={()=>void load()} disabled={loading}>Muat ulang</button>
          <Link href="/user/reports" className="link-teal">Lihat semua</Link>
        </span>
      </div>
      {loading ? <p className="loading" role="status">Memuat laporan…</p> : <ReportRows rows={rows}/>}
      <div className="help-grid">
        <section className="help-card">
          <h3>Ingin bicara dengan petugas?</h3>
          <p>Kirim pesan ke petugas, atau tanyakan informasi umum tentang alur layanan ke SISKA AI.</p>
          <div className="row"><Link href="/user/chat" className="btn btn-primary">Chat dengan admin</Link><Link href="/user/ai" className="btn btn-outline">Tanya SISKA AI</Link></div>
        </section>
        <section className="help-card">
          <h3>Pelajari hak dan pilihanmu</h3>
          <p>Baca tentang batas pribadi, privasi, dan pilihan dukungan.</p>
          <Link href="/education" className="link-teal">Buka materi edukasi</Link>
        </section>
      </div>
    </AppShell>
  );
}

export function LiveNewReportPage() {
  const router = useRouter();
  const [category,setCategory]=useState(""); const [incidentAt,setIncidentAt]=useState(""); const [location,setLocation]=useState(""); const [description,setDescription]=useState("");
  const [files,setFiles]=useState<File[]>([]); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [createdId,setCreatedId]=useState("");

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login?status=login-required");
      }
    });
    return () => unsubscribe();
  }, [router]);

  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { const report=await submitNewReport({category,incidentAt:incidentAt?new Date(incidentAt).toISOString():null,location:location.trim()||null,description}); setCreatedId(report.id); for (const file of files) await uploadEvidenceMultipart(report.id,file); router.push(`/user/reports/${encodeURIComponent(report.id)}`); } catch(e) { setError(errorText(e)); } finally { setBusy(false); } }
  function addFiles(list: FileList|null) { if(!list)return; const accepted=Array.from(list); const invalid=accepted.find(f=>!(["application/pdf","image/jpeg","image/png"].includes(f.type))||f.size>5*1024*1024); if(invalid){setError(`${invalid.name}: format harus PDF/JPG/PNG dan ukuran maksimal 5 MiB.`);return;} setFiles(old=>[...old,...accepted]); }
  return (
    <AppShell role="user">
      <Head title="Buat laporan" subtitle="Tulis seperlunya. Kamu bisa menambahkan bukti nanti lewat halaman detail laporan."/>
      <form className="card" onSubmit={submit} style={{ width: "100%" }}>
        <div className="note" role="note">
          <div>
            <b>Hanya dua isian yang wajib: kategori dan apa yang terjadi.</b>
            Kolom lain boleh dikosongkan. Belum ada yang terkirim sampai kamu menekan Kirim laporan.
          </div>
        </div>

        <section className="form-section">
          <h2>Tentang kejadian</h2>
          <p className="help">Perkiraan pun tidak apa-apa.</p>
          <div className="form-grid">
            <label className="field"><span className="label">Kategori <em className="req">wajib</em></span><select required value={category} onChange={e=>setCategory(e.target.value)}><option value="">Pilih kategori</option>{["Pelecehan seksual","Kekerasan seksual","Kekerasan berbasis gender","Perundungan","Lainnya"].map(x=><option key={x}>{x}</option>)}</select></label>
            <label className="field"><span className="label">Tanggal dan waktu <em className="opt">boleh dikosongkan</em></span><input type="datetime-local" value={incidentAt} onChange={e=>setIncidentAt(e.target.value)}/></label>
            <label className="field full"><span className="label">Lokasi atau media kejadian <em className="opt">boleh dikosongkan</em></span><input maxLength={500} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Tempat, aplikasi, atau akun"/></label>
          </div>
        </section>

        <section className="form-section">
          <h2>Apa yang terjadi</h2>
          <p className="help">Tulis sebanyak yang kamu nyaman bagikan. Tidak perlu rinci.</p>
          <label className="field"><span className="label">Kronologi <em className="req">wajib</em></span><textarea className="textarea" required minLength={1} maxLength={20000} rows={7} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ceritakan hal yang ingin kamu sampaikan"/></label>
        </section>

        <section className="form-section">
          <h2>Bukti pendukung</h2>
          <p className="help">PDF, JPG, atau PNG. Maksimal 5 MiB per berkas.</p>
          <label className="field"><span className="label">Pilih berkas <em className="opt">boleh dikosongkan</em></span><input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={e=>addFiles(e.target.files)}/></label>
          {files.length>0 && <div className="file-list">{files.map((f,i)=><div key={`${f.name}-${i}`} className="file-item"><span>{f.name}<span className="size">{(f.size/1024).toFixed(0)} KB</span></span><button type="button" className="btn btn-outline btn-sm" onClick={()=>setFiles(old=>old.filter((_,j)=>j!==i))}>Hapus<span className="sr-only"> {f.name}</span></button></div>)}</div>}
        </section>

        {error && <Alert>{error}</Alert>}
        {createdId && <p className="status-msg" role="status" style={{marginTop:20}}>Laporan {createdId} sudah tersimpan. Jika unggah bukti gagal, buka detail laporan untuk memeriksa bukti yang berhasil dikirim.</p>}
        <div className="actions">
          <button className="btn btn-primary" disabled={busy||!!createdId}>{busy?"Mengirim…":createdId?"Laporan sudah dibuat":"Kirim laporan"}</button>
          {createdId && <Link className="btn btn-outline" href={`/user/reports/${encodeURIComponent(createdId)}`}>Buka laporan {createdId}</Link>}
          <Link href="/user" className="btn btn-outline">Batal</Link>
        </div>
        <p className="help" style={{marginTop:16}}>Laporan dibuat lebih dulu. Jika unggah bukti gagal, laporan tetap tersimpan dan bukti bisa dikirim ulang lewat detail laporan.</p>
      </form>
    </AppShell>
  );
}

export function LiveHistoryPage({admin=false}:{admin?:boolean}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows,setRows]=useState<SerializedReport[]>([]); const [cursor,setCursor]=useState<string|null>(null); const [next,setNext]=useState<string|null>(null); const [status,setStatus]=useState(""); const [query,setQuery]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const [unreadReportIds,setUnreadReportIds]=useState<Set<string>>(()=>new Set());
  const load=useCallback(async(reset=true)=>{setBusy(true);setError("");try{const result=await fetchReportsPage({limit:20,status:status ? status as ReportStatus : undefined,cursor:reset?undefined:cursor});setRows(old=>reset?result.items:[...old,...result.items]);setNext(result.nextCursor);setCursor(result.nextCursor);}catch(e){setError(errorText(e));}finally{setBusy(false);}},[status,cursor]);
  useEffect(()=>{void load(true);},[status]);
  useEffect(()=>{
    if(!admin)return;
    let cancelled=false;
    const refreshUnreadReports=async()=>{
      try{
        const unreadIds=new Set<string>();
        let cursor:string|undefined;
        do{
          const page=await fetchNotifications({unreadOnly:true,limit:50,cursor});
          for(const notification of page.items){
            if(notification.type==="new_report_submitted" && notification.targetType==="report" && notification.targetId){
              unreadIds.add(notification.targetId);
            }
          }
          cursor=page.nextCursor??undefined;
        }while(cursor);
        if(!cancelled)setUnreadReportIds(unreadIds);
      }catch{
        // Penanda belum dibuka bersifat informatif; kegagalan notifikasi tidak menghalangi daftar laporan.
      }
    };
    const handleRefresh=()=>void refreshUnreadReports();
    void refreshUnreadReports();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT,handleRefresh);
    window.addEventListener("focus",handleRefresh);
    return()=>{cancelled=true;window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT,handleRefresh);window.removeEventListener("focus",handleRefresh);};
  },[admin]);
  const filtered=useMemo(()=>rows.filter(r=>(r.id+r.category+r.description).toLowerCase().includes(query.toLowerCase())),[rows,query]);

  useEffect(() => {
    const targetReportId = searchParams.get("reportId");
    if (!targetReportId) return;
    const match = rows.find((row) => row.id === targetReportId);
    if (!match) return;
    router.replace(`${admin ? "/admin/reports/" : "/user/reports/"}${encodeURIComponent(match.id)}`);
  }, [admin, router, rows, searchParams]);

  return (
    <AppShell role={admin?"admin":"user"}>
      <Head title={admin?"Kelola laporan":"Riwayat laporan"} subtitle={admin?"Daftar laporan yang dapat ditinjau petugas.":"Daftar laporan milik akunmu."} action={!admin?<Link href="/user/new-report" className="btn btn-primary">Buat laporan</Link>:undefined}/>
      <div className="card filters">
        <label className="field"><span className="label">Cari laporan</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nomor, kategori, atau isi laporan"/></label>
        <label className="field"><span className="label">Status</span><select value={status} onChange={e=>{setStatus(e.target.value);setCursor(null);}}><option value="">Semua status</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <button className="btn btn-outline" onClick={()=>void load(true)} disabled={busy}>Muat ulang</button>
      </div>
      {error&&<Alert>{error}</Alert>}
      {busy&&<p className="loading" role="status">Memuat…</p>}
      <ReportRows rows={filtered} admin={admin} filtering={!!(query||status)} unreadReportIds={unreadReportIds}/>
      {next&&<div className="more-row"><button className="btn btn-outline" disabled={busy} onClick={()=>void load(false)}>Muat laporan berikutnya</button></div>}
    </AppShell>
  );
}

function Detail({id,admin}:{id:string;admin:boolean}) {
 const [report,setReport]=useState<SerializedReportDetail|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [uploadBusy,setUploadBusy]=useState(false);const [next,setNext]=useState<ReportStatus>("under_review");const [note,setNote]=useState("");
 const [previews,setPreviews]=useState<Record<string,SignedDownloadUrlResult&{revealed?:boolean}>>({});
 const load=useCallback(async()=>{try{setError("");const r=await fetchReportDetail(id);setReport(r);setNext(r.status==="submitted"?"under_review":r.status==="under_review"?"in_progress":"resolved");}catch(e){setError(errorText(e));}},[id]);useEffect(()=>{void load();},[load]);
 // Membuka detail laporan = membaca pembaruannya. Badge sidebar/lonceng turun tanpa menunggu klik lonceng.
 const reportStatus=report?.status;
 useEffect(()=>{if(!reportStatus)return;void markNotificationsReadByTarget("report",id).catch(()=>undefined);},[id,reportStatus]);
 async function update(e:React.FormEvent){e.preventDefault();if(!report)return;setBusy(true);setError("");try{await transitionReportStatusByAdmin(id,{status:next,note:note.trim()||undefined});await load();setNote("");}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 async function download(evidenceId:string){try{const {url}=await fetchEvidenceSignedDownloadUrl(id,evidenceId);window.open(url,"_blank","noopener,noreferrer");}catch(e){setError(errorText(e));}}
 async function previewPhoto(evidenceId:string){try{setError("");const res=await fetchEvidenceSignedDownloadUrl(id,evidenceId);setPreviews(old=>({...old,[evidenceId]:{...res,revealed:false}}));}catch(e){setError(errorText(e));}}
 function toggleReveal(evidenceId:string){setPreviews(old=>old[evidenceId]?{...old,[evidenceId]:{...old[evidenceId],revealed:!old[evidenceId].revealed}}:old);}
 async function uploadEvidence(file:File){setUploadBusy(true);setError("");try{await uploadEvidenceMultipart(id,file);await load();}catch(e){setError(errorText(e));}finally{setUploadBusy(false);}}
 return (
  <AppShell role={admin?"admin":"user"}>
    <Head title="Detail laporan" subtitle={`Nomor laporan ${id}`} action={<Link className="btn btn-outline" href={admin?"/admin/reports":"/user/reports"}>Kembali ke daftar</Link>}/>
    {error&&<Alert>{error}</Alert>}
    {!report?<p className="loading" role="status">Memuat detail laporan…</p>:(
      <div className="two-col wide-right">
        <div className="detail-main">
          <div className="detail-title"><h2>{report.id}</h2><StatusLabel status={report.status}/></div>
          <dl className="detail-grid">
            <dt>Kategori</dt><dd>{report.category}</dd>
            <dt>Tanggal kejadian</dt><dd>{dateText(report.incidentAt)}</dd>
            <dt>Tanggal laporan</dt><dd>{dateText(report.createdAt)}</dd>
            <dt>Lokasi</dt><dd>{report.location||"Tidak dicantumkan"}</dd>
          </dl>
          <section className="detail-block"><h3>Kronologi</h3><p className="body">{report.description}</p></section>
          <section className="detail-block">
            <h3>Bukti pendukung</h3>
            {report.evidence.length?<div className="file-list">{report.evidence.map(x=>{
              const isPhoto=x.contentType==="image/jpeg"||x.contentType==="image/png";
              const pv=previews[x.id];
              const imgSrc=pv?(pv.revealed?(pv.previewUrl||pv.url):(pv.blurredPreviewUrl||pv.previewUrl||pv.url)):"";
              return (
              <div key={x.id} className="stack" style={{gap:8}}>
                <div className="file-item">
                  <span>{x.originalName}<span className="size">{(x.sizeBytes/1024).toFixed(0)} KB</span></span>
                  <div className="row" style={{gap:8}}>
                    {isPhoto&&<button type="button" className="btn btn-outline btn-sm" onClick={()=>pv?toggleReveal(x.id):void previewPhoto(x.id)}>{!pv?"Pratinjau Aman":pv.revealed?"Sembunyikan/Blur":"Tampilkan Jelas"}</button>}
                    <button type="button" className="btn btn-outline btn-sm" onClick={()=>void download(x.id)}>Unduh<span className="sr-only"> {x.originalName}</span></button>
                  </div>
                </div>
                {pv&&imgSrc&&(
                  <div className="card" style={{padding:12}}>
                    <img src={imgSrc} alt={`Pratinjau bukti ${x.originalName}`} style={{maxWidth:"100%",maxHeight:320,borderRadius:8,objectFit:"contain",filter:!pv.revealed&&!pv.blurredPreviewUrl?"blur(18px)":"none",transition:"filter 0.2s ease"}}/>
                    <p className="help" style={{marginTop:6}}>{pv.revealed?"Pratinjau foto (metadata EXIF/GPS telah dibersihkan).":"Pratinjau disamarkan untuk kenyamanan visual. Klik 'Tampilkan Jelas' untuk melihat foto."}</p>
                  </div>
                )}
              </div>
              );
            })}</div>:<p className="help">Belum ada bukti.</p>}
            {!admin&&<label className="field" style={{marginTop:16}}><span className="label">Tambah bukti <em className="opt">PDF, JPG, PNG, maks. 5 MiB</em></span><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploadBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadEvidence(file);e.currentTarget.value="";}}/>{uploadBusy&&<span className="help" role="status">Mengunggah bukti…</span>}</label>}
          </section>
          <section className="detail-block">
            <h3>Riwayat status</h3>
            <ol className="timeline">
              {[...report.statusHistory].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(h=>(
                <li key={h.id}>
                  <time dateTime={h.createdAt}>{dateText(h.createdAt)}</time>
                  <span className="what">{STATUS[h.toStatus]}</span>{h.fromStatus&&<span className="from"> dari {STATUS[h.fromStatus]}</span>}
                  {h.note&&<p className="note-text">{h.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
        {admin?(
          <form className="side-panel" onSubmit={update}>
            <h3>Tindak lanjut petugas</h3>
            <p className="current">Status saat ini <StatusLabel status={report.status}/></p>
            {(ALLOWED_STATUS_TRANSITIONS[report.status] as readonly ReportStatus[]).length===0?(
              <p className="help">Laporan ini sudah berstatus akhir, jadi tidak ada perubahan status yang tersedia.</p>
            ):(<>
              <label className="field"><span className="label">Status baru</span><select value={next} onChange={e=>setNext(e.target.value as ReportStatus)}>{(ALLOWED_STATUS_TRANSITIONS[report.status] as readonly ReportStatus[]).map(s=><option key={s} value={s}>{STATUS[s]}</option>)}</select></label>
              <label className="field"><span className="label">Catatan {isStatusNoteRequired(report.status,next)?<em className="req">wajib untuk perubahan ini</em>:<em className="opt">boleh dikosongkan</em>}</span><textarea className="textarea" style={{minHeight:120}} rows={4} required={isStatusNoteRequired(report.status,next)} value={note} onChange={e=>setNote(e.target.value)}/></label>
              <button className="btn btn-primary" disabled={busy}>{busy?"Menyimpan…":"Simpan status"}</button>
            </>)}
          </form>
        ):(
          <aside className="side-panel">
            <h3>Butuh klarifikasi?</h3>
            <p>Hubungi petugas lewat percakapan di SISKA.</p>
            <Link className="btn btn-primary" href="/user/chat" style={{marginTop:0}}>Chat dengan admin</Link>
          </aside>
        )}
      </div>
    )}
  </AppShell>
 );
}
export function LiveUserReportDetail({id}:{id:string}){return <Detail id={id} admin={false}/>;}
export function LiveAdminReportDetail({id}:{id:string}){return <Detail id={id} admin={true}/>;}

function ConversationChat({admin}:{admin:boolean}) {
 const router = useRouter();
 const searchParams = useSearchParams();
 const [conversations,setConversations]=useState<SerializedConversation[]>([]);
 const [active,setActive]=useState("");
 const [messages,setMessages]=useState<SerializedMessage[]>([]);
 // Percakapan pemilik `messages` saat ini. Mencegah pesan percakapan lama dianggap milik percakapan baru.
 const [messagesConv,setMessagesConv]=useState("");
 const [reporterNames,setReporterNames]=useState<Record<string,string>>({});
 const [currentUid,setCurrentUid]=useState("");
 const [text,setText]=useState("");
 const [chatFile,setChatFile]=useState<File|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [statusBusy,setStatusBusy]=useState(false);
 const activeRef=useRef("");
 activeRef.current=active;
 const convFetchSeqRef=useRef(0);
 const msgFetchSeqRef=useRef(0);
 // Jumlah pesan belum dibaca per percakapan (id -> jumlah pesan dari lawan bicara).
 const [unreadByConversation,setUnreadByConversation]=useState<Record<string,number>>({});
 const unreadSummary=useUnreadSummary();

 const loadConversationsFromApi=useCallback(async(clearExistingError=false)=>{
  const seq=++convFetchSeqRef.current;
  const result=await fetchConversations();
  if(seq!==convFetchSeqRef.current)return;
  const items=result.items;
  setConversations(items);
  const nextUnread:Record<string,number>={};
  for(const item of items){
   if(item.id!==activeRef.current&&(item.unreadCount??0)>0)nextUnread[item.id]=item.unreadCount;
  }
  setUnreadByConversation(nextUnread);
  setActive(current=>current&&items.some(item=>item.id===current)?current:(items[0]?.id??""));
  if(clearExistingError)setError("");
  setLoading(false);
 },[]);

 // Auth dan daftar percakapan: ambil data terdekripsi dari API backend terlebih dahulu,
 // lalu gunakan listener Firestore hanya sebagai pemicu pembaruan realtime.
 useEffect(()=>{
  let cancelled=false;
  const unsubscribers:Unsubscribe[]=[];
  let refreshTimer:ReturnType<typeof setTimeout>|undefined;
  const scheduleRefresh=()=>{
   if(cancelled)return;
   if(refreshTimer)clearTimeout(refreshTimer);
   refreshTimer=setTimeout(()=>{
    void loadConversationsFromApi().catch(cause=>{
     if(!cancelled&&auth?.currentUser)setError(errorText(cause));
    });
   },120);
  };

  const attachSignal=(targetQuery:ReturnType<typeof query>,label:string)=>{
   let initial=true;
   unsubscribers.push(onSnapshot(targetQuery,()=>{
    if(initial){initial=false;return;}
    scheduleRefresh();
   },listenerError=>{
    if(cancelled||!auth?.currentUser)return;
    console.error(`[SISKA CHAT] ${label}:`,listenerError);
    setError(`Gagal memantau percakapan: ${listenerError.message}`);
    setLoading(false);
   }));
  };

  async function subscribe(){
   if(!auth||!db){setError("Firebase belum dikonfigurasi. Periksa environment Firebase.");setLoading(false);return;}
   try{
    await auth.authStateReady();
    const user=auth.currentUser;
    if(!user) throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
    const tokenResult=await user.getIdTokenResult(true);
    if(cancelled)return;
    if(admin && tokenResult.claims.role!=="admin"){
     throw new Error("Akun ini belum memiliki Firebase Custom Claims role='admin'. Pastikan backend memasang claim admin, lalu login ulang.");
    }
    setCurrentUid(user.uid);
    // Ambil daftar percakapan yang sudah didekripsi dari backend sebelum menampilkan ke user.
    await loadConversationsFromApi(true);
    if(cancelled)return;

    if(admin){
     attachSignal(query(collection(db,"conversations"),where("assignedAdminId","==",user.uid),orderBy("updatedAt","desc")),"Admin assigned listener");
     attachSignal(query(collection(db,"conversations"),where("assignedAdminId","==",null),orderBy("updatedAt","desc")),"Admin unassigned listener");
    }else{
     attachSignal(query(collection(db,"conversations"),where("reporterId","==",user.uid),orderBy("updatedAt","desc")),"Reporter listener");
    }
   }catch(cause){
    if(!cancelled){const message=cause instanceof Error?cause.message:"Gagal menginisialisasi chat.";console.error("[SISKA CHAT] Initialization:",cause);setError(message);setLoading(false);}
   }
  }
  const stop=()=>{
   if(cancelled)return;
   cancelled=true;
   if(refreshTimer)clearTimeout(refreshTimer);
   unsubscribers.splice(0).forEach(unsubscribe=>unsubscribe());
  };
  window.addEventListener("siska:before-logout",stop);
  void subscribe();
  return ()=>{
   window.removeEventListener("siska:before-logout",stop);
   stop();
  };
 },[admin,loadConversationsFromApi]);

 // Nama reporter dipantau terpisah agar perubahan nama profil ikut muncul tanpa refresh.
 const reporterIdsKey=useMemo(()=>JSON.stringify(Array.from(new Set(conversations.map(item=>item.reporterId).filter(Boolean))).sort()),[conversations]);
 useEffect(()=>{
  // Hanya admin yang perlu membaca profil reporter lain; reporter tidak perlu listener profil tambahan.
  const firestore = db;
  if(!admin || !firestore || !auth?.currentUser) return;
  const reporterIds=JSON.parse(reporterIdsKey) as string[];
  if(!reporterIds.length) return;

  const unsubscribers=reporterIds.map(reporterId => onSnapshot(doc(firestore, "users", reporterId), snapshot => {
    const data=snapshot.data();
    const displayName=typeof data?.displayName==="string" ? data.displayName.trim() : "";
    setReporterNames(old => ({ ...old, [reporterId]: displayName || "Pengguna SISKA" }));
  }, listenerError => {
    if(!auth?.currentUser) return;
    console.error(`[SISKA CHAT] Reporter profile listener (${reporterId}):`, listenerError);
    setReporterNames(old => ({ ...old, [reporterId]: old[reporterId] || "Pengguna SISKA" }));
  }));

  const stop=()=>unsubscribers.splice(0).forEach(unsubscribe=>unsubscribe());
  window.addEventListener("siska:before-logout",stop);
  return ()=>{
   window.removeEventListener("siska:before-logout",stop);
   stop();
  };
 },[admin,reporterIdsKey]);

 // Pesan percakapan aktif: ambil isi terdekripsi dari API backend terlebih dahulu,
 // lalu gunakan snapshot Firestore hanya sebagai pemicu pembaruan realtime.
 useEffect(()=>{
  if(!db||!active){setMessages([]);setMessagesConv("");return;}
  let cancelled=false;
  let loadedIdsSig:string|null=null;
  let latestSnapshotSig:string|null=null;
  setMessages([]);setMessagesConv("");

  const fetchAllFromApi=async(conversationId:string,seq:number)=>{
   const all:SerializedMessage[]=[];
   let cursor:string|null=null;
   for(let page=0;page<50;page+=1){
    const result=await fetchConversationMessages(conversationId,{limit:100,cursor});
    if(cancelled||seq!==msgFetchSeqRef.current)return null;
    all.push(...result.items);
    if(!result.nextCursor)break;
    cursor=result.nextCursor;
   }
   return all;
  };

  const loadMessagesFromApi=async()=>{
   const seq=++msgFetchSeqRef.current;
   try{
    const items=await fetchAllFromApi(active,seq);
    if(!items||cancelled||seq!==msgFetchSeqRef.current)return;
    loadedIdsSig=items.map(item=>item.id).join(",");
    setMessages(items);
    setMessagesConv(active);
    // Jika ada pesan masuk saat request pertama berjalan, segera tarik pembaruannya.
    if(latestSnapshotSig!==null&&latestSnapshotSig!==loadedIdsSig){
     void loadMessagesFromApi();
    }
   }catch(cause){
    if(!cancelled&&auth?.currentUser){
     console.error(`[SISKA CHAT] API messages load (${active}):`,cause);
     setError(errorText(cause));
    }
   }
  };

  void loadMessagesFromApi();

  const messagesQuery=query(collection(db,"conversations",active,"messages"),orderBy("createdAt","asc"));
  const unsubscribe=onSnapshot(messagesQuery,snapshot=>{
   const sig=snapshot.docs.map(item=>item.id).join(",");
   latestSnapshotSig=sig;
   if(loadedIdsSig!==null&&sig!==loadedIdsSig){
    void loadMessagesFromApi();
   }
  },listenerError=>{
   if(!auth?.currentUser)return;
   console.error(`[SISKA CHAT] Messages listener (${active}):`,listenerError);
   setError(`Gagal memantau pembaruan pesan realtime: ${listenerError.message}`);
  });
  const stop=()=>{
   cancelled=true;
   unsubscribe();
  };
  window.addEventListener("siska:before-logout",stop);
  return ()=>{
   window.removeEventListener("siska:before-logout",stop);
   stop();
  };
 },[active]);

 // ===== Status baca =====
 // 1) Membuka percakapan, 2) pesan masuk saat percakapan terbuka, 3) kembali ke tab ini
 // => semuanya menandai percakapan dibaca di server (receipt + notifikasi), lalu badge disegarkan.
 const lastMarkedRef=useRef("");
 // Batas pesan lama/baru: dihitung dari waktu baca SEBELUM percakapan dibuka (dikirim server),
 // lalu dibekukan selama percakapan terbuka agar pembatas tidak bergeser saat pesan baru masuk.
 const pendingBoundaryRef=useRef("");
 const [readBoundary,setReadBoundary]=useState<{conversationId:string;prevMs:number;openMs:number}|null>(null);

 const markActiveAsRead=useCallback((force=false)=>{
  if(!active||typeof document==="undefined"||document.visibilityState!=="visible")return;
  const last=messages[messages.length-1];
  const key=`${active}:${last?.id??""}`;
  if(!force&&lastMarkedRef.current===key)return;
  lastMarkedRef.current=key;
  setUnreadByConversation(old=>{if(!old[active])return old;const next={...old};delete next[active];return next;});
  // Hanya panggilan pertama sejak percakapan dibuka yang menentukan batas pesan belum terbaca.
  const captureFor=pendingBoundaryRef.current===active?active:"";
  if(captureFor)pendingBoundaryRef.current="";
  void markConversationAsRead(active).then(result=>{
   if(!captureFor)return;
   setReadBoundary({
    conversationId:captureFor,
    prevMs:result.previousReadAt?new Date(result.previousReadAt).getTime():0,
    openMs:new Date(result.readAt).getTime(),
   });
  }).catch(()=>{lastMarkedRef.current="";if(captureFor)pendingBoundaryRef.current=captureFor;});
 },[active,messages]);

 // Saat percakapan dibuka atau berpindah.
 useEffect(()=>{
  lastMarkedRef.current="";
  pendingBoundaryRef.current=active;
  setReadBoundary(null);
  markActiveAsRead(true);
 },[active]); // eslint-disable-line react-hooks/exhaustive-deps
 // Saat ada pesan masuk dari lawan bicara ketika percakapan sedang terbuka (dibaca langsung).
 useEffect(()=>{
  const last=messages[messages.length-1];
  if(!last||!currentUid||last.senderUid===currentUid)return;
  markActiveAsRead();
 },[messages,currentUid,markActiveAsRead]);
 // Saat pengguna kembali ke tab/jendela ini.
 useEffect(()=>{
  const onVisible=()=>markActiveAsRead(true);
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("focus",onVisible);
  return()=>{document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("focus",onVisible);};
 },[markActiveAsRead]);

 // Jumlah pesan belum dibaca per percakapan, supaya admin tahu tiap pengguna mengirim berapa pesan.
 // Sumber kebenarannya server (receipt baca per UID). Disegarkan saat badge global berubah.
 const prevChatBadgeRef=useRef<number|null>(null);
 useEffect(()=>{
  if(!currentUid)return;
  if(prevChatBadgeRef.current===null){
   prevChatBadgeRef.current=unreadSummary.chats;
   return;
  }
  if(prevChatBadgeRef.current===unreadSummary.chats)return;
  prevChatBadgeRef.current=unreadSummary.chats;
  let cancelled=false;
  const timer=setTimeout(()=>{
   if(cancelled)return;
   void loadConversationsFromApi().catch(()=>undefined);
  },250); // gabungkan pembaruan beruntun menjadi satu request
  return()=>{cancelled=true;clearTimeout(timer);};
 },[unreadSummary.chats,currentUid,loadConversationsFromApi]);


 // ===== Pembatas "N pesan belum terbaca" =====
 // Pesan lawan bicara yang dikirim setelah terakhir kali percakapan dibaca, sampai saat dibuka.
 const unreadMarker=useMemo(()=>{
  if(!readBoundary||readBoundary.conversationId!==active||messagesConv!==active)return null;
  const unread=messages.filter(message=>{
   if(message.senderUid===currentUid)return false;
   const at=new Date(message.createdAt).getTime();
   return at>readBoundary.prevMs&&at<=readBoundary.openMs;
  });
  return unread.length?{firstId:unread[0].id,count:unread.length}:null;
 },[readBoundary,active,messagesConv,messages,currentUid]);

 // ===== Auto-scroll ke pesan terbaru =====
 const bodyRef=useRef<HTMLDivElement>(null);
 const stickRef=useRef(true);          // pengguna sedang berada di dasar chat
 const scrolledForRef=useRef("");      // percakapan yang sudah di-scroll ke dasar saat dibuka
 const lastSeenMessageRef=useRef("");
 const [newBelow,setNewBelow]=useState(0);

 const scrollToBottom=useCallback((smooth=false)=>{
  const el=bodyRef.current;
  if(!el)return;
  el.scrollTo({top:el.scrollHeight,behavior:smooth?"smooth":"auto"});
  stickRef.current=true;
  setNewBelow(0);
 },[]);

 const onBodyScroll=useCallback(()=>{
  const el=bodyRef.current;
  if(!el)return;
  const nearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<120;
  stickRef.current=nearBottom;
  if(nearBottom)setNewBelow(count=>count?0:count);
 },[]);

 // Pindah percakapan: kembali ke mode "ikuti pesan terbaru".
 useEffect(()=>{stickRef.current=true;setNewBelow(0);lastSeenMessageRef.current="";scrolledForRef.current="";},[active]);

 useEffect(()=>{
  if(!active||messagesConv!==active||!messages.length)return;
  const last=messages[messages.length-1];
  if(scrolledForRef.current!==active){
   // Pertama kali pesan percakapan ini tampil: langsung ke dasar tanpa animasi.
   scrolledForRef.current=active;
   lastSeenMessageRef.current=last.id;
   requestAnimationFrame(()=>scrollToBottom(false));
   return;
  }
  if(last.id===lastSeenMessageRef.current)return;
  lastSeenMessageRef.current=last.id;
  // Pesan sendiri atau pengguna sedang di dasar: ikuti. Kalau sedang membaca pesan lama: jangan loncat.
  if(last.senderUid===currentUid||stickRef.current)requestAnimationFrame(()=>scrollToBottom(true));
  else setNewBelow(count=>count+1);
 },[messages,messagesConv,active,currentUid,scrollToBottom]);

 // Pembatas muncul setelah respons server dan menambah tinggi konten di atas; jaga posisi tetap di dasar.
 useEffect(()=>{
  if(unreadMarker&&stickRef.current)requestAnimationFrame(()=>scrollToBottom(false));
 },[unreadMarker?.firstId,scrollToBottom]); // eslint-disable-line react-hooks/exhaustive-deps

 const current=conversations.find(item=>item.id===active);
 const reporterName=current?(reporterNames[current.reporterId]||(admin?"Memuat nama…":"Anda")):"";

 async function start(){
  setError("");setNotice("");
  const existing=conversations.find(item=>item.status==="open");
  if(existing){setActive(existing.id);setNotice("Anda sudah memiliki percakapan aktif. Percakapan tersebut telah dibuka.");return;}
  setBusy(true);
  try{
   const conversation=await openConversation();
   setActive(conversation.id);
   setConversations(old=>[conversation,...old.filter(item=>item.id!==conversation.id)]);
   setNotice("Percakapan siap. Silakan kirim pesan kepada admin.");
  }catch(cause){setError(errorText(cause));}
  finally{setBusy(false);}
 }

 async function send(e:React.FormEvent){
  e.preventDefault();
  const body=text.trim()||(chatFile?`[Lampiran: ${chatFile.name}]`:"");
  if(!active||!body||!current||current.status!=="open")return;
  setBusy(true);setError("");
  try{
   const sent=await postConversationMessage(active,body,chatFile);
   setText("");
   setChatFile(null);
   setMessages(old=>old.some(item=>item.id===sent.id)?old:[...old,sent]);
   setMessagesConv(active);
   void loadConversationsFromApi().catch(()=>undefined);
  }catch(cause){setError(errorText(cause));}
  finally{setBusy(false);}
 }

 async function openMessageAttachment(messageId:string){
  if(!active)return;
  try{
   setError("");
   const signed=await fetchMessageAttachmentSignedUrl(active,messageId);
   window.open(signed.previewUrl||signed.url,"_blank","noopener,noreferrer");
  }catch(cause){setError(errorText(cause));}
 }

 async function toggleStatus(){
  if(!current)return;
  setStatusBusy(true);setError("");
  try{
   const updated=await updateConversationStatusByAdmin(active,{status:current.status==="open"?"closed":"open"});
   setConversations(old=>old.map(item=>item.id===updated.id?updated:item));
  }
  catch(cause){setError(errorText(cause));}
  finally{setStatusBusy(false);}
 }

 return <AppShell role={admin?"admin":"user"}>
  <Head title={admin?"Chat pengguna":"Chat dengan Admin"} subtitle="Pesan baru muncul otomatis. Tidak perlu memuat ulang halaman." action={!admin?<button className="btn btn-primary" disabled={busy||loading} onClick={()=>void start()}>{conversations.some(item=>item.status==="open")?"Buka percakapan":"Percakapan baru"}</button>:undefined}/>
  {error&&<Alert>{error}</Alert>}{notice&&<p className="status-msg" role="status">{notice}</p>}
  <div className="chat" style={{minHeight:520}}>
   <aside className="chat-list" aria-label="Daftar percakapan"><div className="chat-list-head"><h3>Percakapan</h3></div>
    {conversations.map(conversation=>{
     const name=admin?(reporterNames[conversation.reporterId]||"Pengguna SISKA"):"Chat dengan Admin";
     const preview=conversation.lastMessage||"Buka untuk melihat pesan";
     const unread=active===conversation.id?0:(unreadByConversation[conversation.id]??0);
     return <button key={conversation.id} className={`conv ${active===conversation.id?"active":""}`} aria-current={active===conversation.id?"true":undefined} onClick={()=>setActive(conversation.id)}>
      <span className="conv-row"><b className={unread?"unread":undefined}>{name}</b>{unread>0&&<span className="conv-count" aria-label={`${unread} pesan belum dibaca`}>{unread>99?"99+":unread}</span>}</span><small>{preview.length>64?`${preview.slice(0,61)}…`:preview}</small><small>{conversation.status==="open"?"Terbuka":"Ditutup"}, {dateText(conversation.lastMessageAt||conversation.updatedAt)}</small>
     </button>;
    })}
    {!loading&&!conversations.length&&<p className="help">{admin?"Belum ada percakapan masuk.":"Belum ada percakapan. Pilih Percakapan baru untuk menulis ke petugas."}</p>}
    {loading&&!conversations.length&&<p className="status-msg" role="status">Memuat percakapan…</p>}
   </aside>
   <section className="chat-pane">
    <div className="chat-head"><b>{current?(admin?reporterName:"Chat dengan Admin"):"Percakapan SISKA"}</b><div className="row">
     {admin&&current&&<button className="btn btn-outline btn-sm" disabled={statusBusy} onClick={()=>void toggleStatus()}>{current.status==="open"?"Tutup percakapan":"Buka kembali"}</button>}
    </div></div>
    <div className="chat-body" role="log" aria-live="polite" aria-label="Pesan" ref={bodyRef} onScroll={onBodyScroll}>
     {messages.map(message=>{
      const isReporter=message.senderUid===current?.reporterId;
      const isMine=message.senderUid===currentUid;
      const author=isReporter?(admin?reporterName:"Anda"):"Admin SISKA";
      return <Fragment key={message.id}>
       {unreadMarker?.firstId===message.id&&<div className="unread-divider" role="separator" aria-label={`${unreadMarker.count} pesan belum terbaca`}><span>{unreadMarker.count} pesan belum terbaca</span></div>}
       <div className={`bubble ${isMine?"me":"them"}`}><div className="who">{author}<span>{dateText(message.createdAt)}</span></div><div>{message.body}</div>{message.attachmentPath&&<div style={{marginTop:8}}><button type="button" className="btn btn-outline btn-sm" onClick={()=>void openMessageAttachment(message.id)}>Lihat / Unduh Lampiran</button></div>}</div>
      </Fragment>;
     })}
     {!messages.length&&<p className="help">{current?"Belum ada pesan. Mulai percakapan dengan mengirim pesan.":"Pilih percakapan untuk melihat pesan."}</p>}
     {newBelow>0&&<button type="button" className="jump-latest" onClick={()=>scrollToBottom(true)}>↓ {newBelow} pesan baru</button>}
    </div>
    <form className="compose" onSubmit={send}>
     {chatFile&&<div className="row" style={{marginBottom:8,fontSize:12}}><span>Lampiran: <b>{chatFile.name}</b> ({(chatFile.size/1024).toFixed(0)} KB)</span><button type="button" className="link-teal" onClick={()=>setChatFile(null)}>Hapus</button></div>}
     <div className="compose-row">
      <input type="text" aria-label="Tulis pesan" value={text} onChange={event=>setText(event.target.value)} maxLength={10000} placeholder={current?.status==="closed"?"Percakapan ini sudah ditutup":"Tulis pesan atau lampirkan foto…"} disabled={!current||current.status==="closed"||busy}/>
      <label className="btn btn-outline btn-sm" style={{cursor:!current||current.status==="closed"||busy?"not-allowed":"pointer"}}>
       Lampirkan Foto
       <input type="file" hidden accept="image/jpeg,image/png,application/pdf" disabled={!current||current.status==="closed"||busy} onChange={e=>{const f=e.target.files?.[0];if(f){if(f.size>5*1024*1024){setError("Ukuran lampiran maksimal 5 MiB.");}else{setChatFile(f);}}e.currentTarget.value="";}}/>
      </label>
      <button className="btn btn-primary btn-sm" disabled={!current||current.status==="closed"||busy||(!text.trim()&&!chatFile)}>Kirim</button>
     </div>
    </form>
   </section>
  </div>
 </AppShell>;
}
export function LiveUserChatPage(){return <ConversationChat admin={false}/>;}
export function LiveAdminChatPage(){return <ConversationChat admin={true}/>;}
export function LiveUserAiPage(){return <AppShell role="user"><Head title="SISKA AI" subtitle="Asisten informasi umum yang menjawab dari dokumen yang disiapkan petugas."/><AiChatPanel/></AppShell>;}

export function LiveAdminDashboard(){
  const [summary,setSummary]=useState<ReportsSummaryResult|null>(null);
  const [rows,setRows]=useState<SerializedReport[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [title,setTitle]=useState("Pembaruan SISKA");
  const [body,setBody]=useState("");
  const [targetType,setTargetType]=useState<"none"|"report"|"conversation"|"education">("none");
  const [targetId,setTargetId]=useState("");
  const [targetRole,setTargetRole]=useState<"reporter"|"all">("reporter");
  const [sending,setSending]=useState(false);
  const [history,setHistory]=useState<Array<{title:string;body:string;targetType:"none"|"report"|"conversation"|"education";targetRole:"reporter"|"all";sentAt:string;}>>([]);

  const load = useCallback(async () => {
    try {
      setError("");
      const [s, r] = await Promise.all([fetchReportsSummary(), fetchReportsPage({ limit: 8 })]);
      setSummary(s);
      setRows(r.items);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    setNotice("");
    try {
      const result = await broadcastNotificationByAdmin({
        title: title.trim(),
        body: body.trim(),
        targetType,
        targetId: targetId.trim() || null,
        targetRole,
      });
      setNotice(`Broadcast berhasil dikirim ke ${result.sentCount} pengguna.`);
      setHistory(current => [{
        title: title.trim(),
        body: body.trim(),
        targetType,
        targetRole,
        sentAt: new Date().toISOString(),
      }, ...current].slice(0, 5));
      setTitle("Pembaruan SISKA");
      setBody("");
      setTargetType("none");
      setTargetId("");
      setTargetRole("reporter");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell role="admin">
      <Head title="Dashboard" subtitle="Ringkasan laporan dari backend SISKA."/>
      {error&&<Alert>{error}</Alert>}
      {notice&&<p className="status-msg" role="status">{notice}</p>}
      <div className="stats">{[{label:"Total laporan",value:summary?.total??0},...Object.entries(STATUS).map(([k,v])=>({label:v,value:summary?.byStatus[k as ReportStatus]??0}))].map(s=><div className={`stat ${s.value===0?"zero":""}`} key={s.label}><div className="stat-top">{s.label}</div><div className="stat-num">{s.value}</div></div>)}</div>
      <div className="section-head"><h2>Laporan terbaru</h2><Link href="/admin/reports" className="link-teal">Kelola semua laporan</Link></div>
      <ReportRows rows={rows} admin/>

      <div className="two-col" style={{marginTop:48}}>
        <form className="card" onSubmit={submitBroadcast}>
          <h2 className="card-title">Kirim pengumuman ke pengguna</h2>
          <div className="stack">
            <label className="field"><span className="label">Judul <em className="req">wajib</em></span><input required minLength={3} maxLength={150} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Pembaruan layanan SISKA"/></label>
            <label className="field"><span className="label">Isi pesan <em className="req">wajib</em></span><textarea className="textarea" style={{minHeight:130}} required minLength={5} maxLength={1000} rows={5} value={body} onChange={e=>setBody(e.target.value)} placeholder="Tulis pembaruan, pengingat, atau perubahan penting"/></label>
            <div className="form-grid">
              <label className="field"><span className="label">Tautkan ke</span><select value={targetType} onChange={e=>setTargetType(e.target.value as "none"|"report"|"conversation"|"education")}><option value="none">Tanpa tautan</option><option value="report">Laporan</option><option value="conversation">Percakapan</option><option value="education">Edukasi</option></select></label>
              <label className="field"><span className="label">Penerima</span><select value={targetRole} onChange={e=>setTargetRole(e.target.value as "reporter"|"all")}><option value="reporter">Pelapor saja</option><option value="all">Semua pengguna</option></select></label>
            </div>
            <label className="field"><span className="label">ID tautan <em className="opt">boleh dikosongkan</em></span><input value={targetId} onChange={e=>setTargetId(e.target.value)} placeholder="Contoh: rpt_123 atau edu_456" disabled={targetType==="none"} maxLength={120}/></label>
          </div>
          <div className="actions"><button className="btn btn-primary" disabled={sending||!title.trim()||!body.trim()}>{sending?"Mengirim…":"Kirim pengumuman"}</button></div>
        </form>
        <section className="card">
          <h2 className="card-title">Terkirim sesi ini</h2>
          {history.length===0?<p className="help">Belum ada pengumuman yang dikirim pada sesi ini.</p>:<div className="broadcast-log">{history.map((item,index)=><div key={`${item.sentAt}-${index}`}><strong>{item.title}</strong><span>{item.body}</span><small>{new Date(item.sentAt).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}, {item.targetRole==="all"?"semua pengguna":"pelapor saja"}{item.targetType!=="none"?`, tautan ${item.targetType}`:""}</small></div>)}</div>}
        </section>
      </div>
    </AppShell>
  );
}


export function LiveAdminDocumentsPage(){
 const [documents,setDocuments]=useState<SerializedAiRagDocument[]>([]);
 const [fileName,setFileName]=useState("");
 const [pdfFile,setPdfFile]=useState<File|null>(null);
 const [cite,setCite]=useState("");
 const [content,setContent]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [deleting,setDeleting]=useState("");
 const [resetting,setResetting]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);
  setError("");
  try{
   const result=await fetchAiRagDocumentsByAdmin();
   setDocuments(result.items);
  }catch(e){
   setError(errorText(e));
  }finally{
   setLoading(false);
  }
 },[]);

 useEffect(()=>{void load();},[load]);

 async function handleFileSelect(selected:File|null){
  if(!selected)return;
  setError("");
  setNotice("");
  const name=selected.name;
  if(!/\.(md|txt|pdf)$/i.test(name)){
   setError("Format dokumen tidak didukung. Pilih berkas berformat .pdf, .md, atau .txt.");
   return;
  }
  const inferredTitle=name.replace(/\.(md|txt|pdf)$/i,"").replace(/[-_]+/g," ").trim();
  setFileName(name);
  if(!cite.trim())setCite(inferredTitle);

  if(/\.pdf$/i.test(name)){
   if(selected.size>25*1024*1024){
    setError("Ukuran berkas PDF melebihi batas maksimum 25 MiB.");
    setPdfFile(null);
    return;
   }
   setPdfFile(selected);
   setContent("");
  }else{
   try{
    const text=await selected.text();
    if(text.length>300_000){
     setError("Isi dokumen melebihi batas maksimum 300.000 karakter.");
     return;
    }
    setPdfFile(null);
    setContent(text);
   }catch{
    setError("Isi berkas teks tidak dapat dibaca. Coba pilih berkas .md atau .txt lain.");
   }
  }
 }

 async function upload(e:React.FormEvent){
  e.preventDefault();
  if(!fileName.trim()||!cite.trim()||(!pdfFile&&!content.trim()))return;
  setSaving(true);
  setError("");
  setNotice("");
  try{
   const created=pdfFile
    ?await uploadAiRagPdfByAdmin(pdfFile,cite.trim())
    :await addAiRagDocumentByAdmin({file:fileName.trim(),cite:cite.trim(),content});
   setFileName("");
   setPdfFile(null);
   setCite("");
   setContent("");
   const picker=document.getElementById("siska-ai-doc-file") as HTMLInputElement|null;
   if(picker)picker.value="";
   setNotice(`Dokumen "${created.cite}" (${created.file}) berhasil ditambahkan dan diindeks ke SISKA AI (${created.chunkCount} potongan).`);
   await load();
  }catch(e){
   setError(errorText(e));
  }finally{
   setSaving(false);
  }
 }

 async function remove(doc:SerializedAiRagDocument){
  const message=doc.source==="web"
   ?`Hapus dokumen "${doc.cite}" (${doc.file}) dari sumber pengetahuan SISKA AI?`
   :`Hapus dokumen dasar "${doc.cite}" (${doc.file}) dari sumber pengetahuan SISKA AI? Dokumen akan disembunyikan dan dapat dikembalikan lewat tombol "Kembalikan ke bawaan".`;
  if(!window.confirm(message))return;
  setDeleting(doc.file);
  setError("");
  setNotice("");
  try{
   await deleteAiRagDocumentByAdmin(doc.file);
   setNotice(`Dokumen “${doc.cite}” (${doc.file}) berhasil dihapus dari indeks SISKA AI.`);
   await load();
  }catch(e){
   setError(errorText(e));
  }finally{
   setDeleting("");
  }
 }

 async function resetToDefault(){
  if(!window.confirm("Kembalikan pengetahuan SISKA AI ke bawaan? Semua dokumen tambahan admin akan dihapus dan dokumen dasar yang pernah dihapus akan kembali."))return;
  setResetting(true);
  setError("");
  setNotice("");
  try{
   const result=await resetAiRagDocumentsByAdmin();
   setNotice(`Pengetahuan SISKA AI dikembalikan ke bawaan (${result.restoredBaseDocs} dokumen dasar dipulihkan, ${result.removedAddedDocs} dokumen tambahan dihapus).`);
   await load();
  }catch(e){
   setError(errorText(e));
  }finally{
   setResetting(false);
  }
 }

 const canSubmit=!saving&&Boolean(fileName.trim())&&Boolean(cite.trim())&&Boolean(pdfFile||content.trim());

 return (
 <AppShell role="admin">
  <Head title="Dokumen SISKA AI" subtitle="Unggah berkas PDF, Markdown (.md), atau teks (.txt) sebagai sumber jawaban SISKA AI dan kelola indeks pengetahuannya."/>
  {error&&<Alert>{error}</Alert>}
  {notice&&<p className="status-msg" role="status">{notice}</p>}
  <div className="two-col">
   <form className="card stack" onSubmit={upload}>
    <h2 className="card-title" style={{marginBottom:0}}>Tambah sumber pengetahuan SISKA AI</h2>
    <label className="field">
     <span className="label">Pilih berkas (.pdf, .md, atau .txt) <em className="opt">PDF maks. 25 MiB</em></span>
     <input id="siska-ai-doc-file" type="file" accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain" onChange={e=>void handleFileSelect(e.target.files?.[0]??null)}/>
     {pdfFile&&<span className="help">Berkas PDF terpilih: <b>{pdfFile.name}</b> ({(pdfFile.size/1024/1024).toFixed(2)} MiB). Teks akan diekstrak otomatis di server.</span>}
    </label>
    <label className="field">
     <span className="label">Nama berkas sumber <em className="req">wajib, akhiran .pdf / .md / .txt</em></span>
     <input required maxLength={125} value={fileName} onChange={e=>{const next=e.target.value;setFileName(next);if(pdfFile&&next!==pdfFile.name)setPdfFile(null);}} placeholder="Contoh: panduan-layanan.md atau pedoman-ppks.pdf"/>
    </label>
    <label className="field">
     <span className="label">Judul sitasi sumber <em className="req">wajib</em></span>
     <input required maxLength={200} value={cite} onChange={e=>setCite(e.target.value)} placeholder="Contoh: Panduan Layanan SISKA"/>
    </label>
    {!pdfFile&&(
     <label className="field">
      <span className="label">Isi dokumen (.md / .txt) <em className="req">wajib untuk dokumen teks</em></span>
      <textarea className="textarea" rows={7} maxLength={300000} value={content} onChange={e=>setContent(e.target.value)} placeholder={"# Judul Bagian\n\nTulis atau pilih berkas .md / .txt yang berisi informasi resmi terverifikasi."}/>
      <span className="help">Maksimal 300.000 karakter. Jangan memasukkan kronologi laporan atau data pribadi pengguna.</span>
     </label>
    )}
    <div className="actions" style={{marginTop:4}}>
     <button className="btn btn-primary" disabled={!canSubmit}>{saving?"Mengunggah & mengindeks…":"Tambah dan indeks dokumen"}</button>
     {(fileName||cite||content||pdfFile)&&<button type="button" className="btn btn-outline" disabled={saving} onClick={()=>{setFileName("");setPdfFile(null);setCite("");setContent("");setError("");const picker=document.getElementById("siska-ai-doc-file") as HTMLInputElement|null;if(picker)picker.value="";}}>Bersihkan</button>}
    </div>
   </form>
   <section className="card stack">
    <h2 className="card-title" style={{marginBottom:0}}>Cara kerja indeks SISKA AI</h2>
    <p className="prose">
     Dokumen Markdown (<code>.md</code>) dan teks (<code>.txt</code>) langsung dipecah menjadi potongan konteks (<em>chunks</em>) dan dibuat vektor <em>embedding</em>-nya oleh AI Service. Berkas PDF berteks diekstrak secara otomatis per halaman di backend sebelum diindeks.
    </p>
    <p className="help">
     Perubahan indeks langsung aktif untuk pertanyaan pengguna berikutnya tanpa perlu menjalankan ulang notebook. Dokumen dasar boleh dihapus satu per satu; hasil notebook tetap utuh sehingga semuanya dapat dikembalikan dengan "Kembalikan ke bawaan". PDF hasil pemindaian (<em>scan</em> gambar) memerlukan proses OCR terlebih dahulu sebelum diunggah.
    </p>
    <div className="row">
     <button type="button" className="btn btn-outline" disabled={loading||saving||resetting} onClick={()=>void load()}>{loading?"Memuat…":"Muat ulang daftar"}</button>
     <button type="button" className="btn btn-outline" disabled={loading||saving||resetting} onClick={()=>void resetToDefault()}>{resetting?"Mengembalikan…":"Kembalikan ke bawaan"}</button>
    </div>
   </section>
  </div>
  <section className="card" style={{marginTop:32}}>
   <div className="section-head"><h2>Dokumen sumber terdaftar</h2><span className="chip">{documents.length} dokumen</span></div>
   {loading&&<p className="loading" role="status">Memuat dokumen…</p>}
   {!loading&&!documents.length&&<p className="help">Belum ada dokumen sumber yang terdaftar. Unggah dokumen pertama di atas.</p>}
   {documents.map(doc=>(
    <div key={doc.file} className="doc-row">
     <div style={{minWidth:0}}>
      <b>{doc.cite}</b>
      <div className="help">{doc.file} • {doc.chunkCount} potongan • {doc.source==="web"?"Ditambahkan admin":"Dokumen dasar"}</div>
     </div>
     <button className="btn btn-outline btn-sm" disabled={deleting===doc.file||resetting} onClick={()=>void remove(doc)}>{deleting===doc.file?"Menghapus…":"Hapus"}<span className="sr-only"> {doc.cite}</span></button>
    </div>
   ))}
  </section>
 </AppShell>
 );
}


export function LiveAdminAuditPage(){
 const [events,setEvents]=useState<SerializedAuditEvent[]>([]);const [error,setError]=useState("");const [loading,setLoading]=useState(false);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await fetchAuditEventsByAdmin({limit:50});setEvents(result.items);}catch(e){setError(errorText(e));}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 return (
 <AppShell role="admin">
  <Head title="Log audit" subtitle="Catatan aktivitas backend untuk akuntabilitas dan penelusuran tindakan." action={<button className="btn btn-outline" disabled={loading} onClick={()=>void load()}>Muat ulang</button>}/>
  {error&&<Alert>{error}</Alert>}
  {loading&&<p className="loading" role="status">Memuat log audit…</p>}
  {!loading&&!events.length&&<div className="empty"><h3>Belum ada aktivitas</h3><p>Tindakan petugas dan sistem akan tercatat di sini.</p></div>}
  {events.length>0&&<div className="table-wrap"><table><thead><tr><th scope="col">Waktu</th><th scope="col">Aktor</th><th scope="col">Aksi</th><th scope="col">Target</th><th scope="col">ID permintaan</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td data-label="Waktu" className="num">{dateText(event.occurredAt)}</td><td data-label="Aktor"><code>{event.actorUid}</code></td><td data-label="Aksi">{event.action}</td><td data-label="Target">{event.targetType}: {event.targetId}</td><td data-label="ID permintaan"><code>{event.requestId}</code></td></tr>)}</tbody></table></div>}
 </AppShell>
 );
}

export function LiveProfilePage(){
 const [name,setName]=useState("");const [email,setEmail]=useState("");const [role,setRole]=useState("");const [photoUrl,setPhotoUrl]=useState<string|null>(null);const [avatarFile,setAvatarFile]=useState<File|null>(null);const [error,setError]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 const [currentPassword,setCurrentPassword]=useState("");const [newPassword,setNewPassword]=useState("");const [confirmPassword,setConfirmPassword]=useState("");
 useEffect(()=>{fetchMyProfile().then(p=>{setName(p.displayName);setEmail(p.email);setRole(p.role);setPhotoUrl(p.photoUrl??null);}).catch(e=>setError(errorText(e)));},[]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setMessage("");try{const p=await updateMyProfileWithAvatar({displayName:name.trim(),avatarFile});if(auth?.currentUser) await updateProfile(auth.currentUser,{displayName:p.displayName,...(p.photoUrl?{photoURL:p.photoUrl}:{})});setName(p.displayName);if(p.photoUrl)setPhotoUrl(p.photoUrl);setAvatarFile(null);setMessage(avatarFile?"Profil dan foto berhasil diperbarui.":"Nama profil berhasil diperbarui.");}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 async function changePassword(e:React.FormEvent){e.preventDefault();setError("");setMessage("");if(newPassword.length<6){setError("Password baru minimal 6 karakter.");return;}if(newPassword!==confirmPassword){setError("Konfirmasi password tidak sama.");return;}const user=auth?.currentUser;if(!user?.email){setError("Sesi akun tidak ditemukan. Silakan login ulang.");return;}setBusy(true);try{await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,currentPassword));await updatePassword(user,newPassword);setCurrentPassword("");setNewPassword("");setConfirmPassword("");setMessage("Password berhasil diperbarui.");}catch(e){setError((e as {code?:string})?.code==="auth/wrong-password"?"Password saat ini tidak sesuai.":"Password belum dapat diperbarui. Silakan login ulang jika sesi kedaluwarsa.");}finally{setBusy(false);}}
 return <AppShell role="user"><Head title="Profil dan pengaturan" subtitle="Informasi akun yang tersimpan di SISKA."/><div className="stack" style={{width:"100%"}}><form className="card stack" onSubmit={save}><h2 className="card-title" style={{marginBottom:0}}>Informasi akun</h2><div className="row" style={{gap:16,alignItems:"center"}}><img src={photoUrl||withBasePath("/default_photo.png")} alt="Foto profil" style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:"1px solid var(--line)"}}/><label className="field" style={{flex:1}}><span className="label">Foto profil <em className="opt">JPG/PNG, maks. 5 MiB</em></span><input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={e=>setAvatarFile(e.target.files?.[0]??null)}/></label></div><label className="field"><span className="label">Nama tampilan</span><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field"><span className="label">Email</span><input value={email} readOnly/></label><label className="field"><span className="label">Peran</span><input value={role==="admin"?"Petugas":role==="reporter"?"Pengguna":role} readOnly/></label><button className="btn btn-primary" disabled={busy}>{busy?"Menyimpan…":"Simpan perubahan"}</button></form><form className="card stack" onSubmit={changePassword}><h2 className="card-title" style={{marginBottom:0}}>Ubah password</h2><label className="field"><span className="label">Password saat ini</span><input type="password" autoComplete="current-password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label className="field"><span className="label">Password baru</span><input type="password" autoComplete="new-password" required minLength={6} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label className="field"><span className="label">Konfirmasi password baru</span><input type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label><button className="btn btn-outline" disabled={busy}>Ubah password</button></form>{error&&<Alert>{error}</Alert>}{message&&<p role="status" className="status-msg">{message}</p>}</div></AppShell>;
}
