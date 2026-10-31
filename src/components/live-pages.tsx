"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where, type Unsubscribe } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { AppShell } from "@/components/shell";
import { AiChatPanel } from "@/components/ai-chat";
import {
  SiskaApiClientError, fetchReportsPage, fetchReportsSummary, fetchReportDetail,
  submitNewReport, uploadEvidenceMultipart, openConversation,
  postConversationMessage, transitionReportStatusByAdmin,
  updateConversationStatusByAdmin, fetchMyProfile, updateMyProfileName,
  fetchKnowledgeDocumentsByAdmin, uploadKnowledgePdfByAdmin, deleteKnowledgeDocumentByAdmin, triggerKnowledgeReindexByAdmin, fetchAuditEventsByAdmin,
} from "@/lib/api-client";
import type { SerializedReport, SerializedReportDetail, SerializedConversation, SerializedMessage, ReportsSummaryResult, SerializedKnowledgeDocument, SerializedAuditEvent } from "@/types/api";
import { ALLOWED_STATUS_TRANSITIONS, isStatusNoteRequired, type ReportStatus } from "@/types/domain";

const STATUS: Record<ReportStatus, string> = {
  submitted: "Menunggu tinjauan", under_review: "Dalam peninjauan", in_progress: "Dalam proses", resolved: "Selesai", rejected: "Ditolak",
};
const STATUS_CLASS: Record<ReportStatus, string> = {
  submitted: "amber", under_review: "blue", in_progress: "blue", resolved: "green", rejected: "red",
};
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Tidak dicantumkan";
const errorText = (e: unknown) => e instanceof SiskaApiClientError ? e.message : "Permintaan gagal. Periksa koneksi dan coba kembali.";
function Head({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>; }
function Alert({ children }: { children: React.ReactNode }) { return <p className="error-text" role="alert">{children}</p>; }
function StatusLabel({ status }: { status: ReportStatus }) { return <span className={`pill ${STATUS_CLASS[status]}`}>{STATUS[status]}</span>; }
function ReportRows({ rows, admin = false }: { rows: SerializedReport[]; admin?: boolean }) {
  if (!rows.length) return <div className="table-card empty"><h3>Belum ada laporan</h3><p>Data laporan akan muncul setelah laporan dibuat.</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>Nomor</th><th>Kategori</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><b>{r.id}</b></td><td>{r.category}</td><td>{dateText(r.createdAt)}</td><td><StatusLabel status={r.status}/></td><td><Link className="link-teal" href={`${admin ? "/admin" : "/user"}/reports/${encodeURIComponent(r.id)}`}>Detail</Link></td></tr>)}</tbody></table></div>;
}

export function LiveUserDashboard() {
  const [summary, setSummary] = useState<ReportsSummaryResult | null>(null);
  const [rows, setRows] = useState<SerializedReport[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [s, r] = await Promise.all([fetchReportsSummary(), fetchReportsPage({ limit: 5 })]); setSummary(s); setRows(r.items); } catch(e) { setError(errorText(e)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const stats = [{ label: "Total laporan", value: summary?.total ?? 0 }, ...Object.entries(STATUS).map(([key, label]) => ({ label, value: summary?.byStatus[key as ReportStatus] ?? 0 }))];
  return <AppShell role="user"><Head title="Dashboard" subtitle="Ringkasan laporan dan akses layanan SISKA." action={<Link className="btn btn-primary" href="/user/new-report">Buat laporan</Link>}/>{error && <Alert>{error}</Alert>}<div className="stats">{stats.map(x=><div className="stat" key={x.label}><div className="stat-top">{x.label}</div><div className="stat-num">{x.value}</div></div>)}</div><div className="section-head"><h2>Laporan terbaru</h2><Link href="/user/reports" className="link-arrow">Lihat semua</Link></div>{loading ? <p className="help">Memuat laporan…</p> : <ReportRows rows={rows}/>}<div className="help-grid"><section className="card help-card"><h3>Butuh bantuan?</h3><p>Hubungi petugas atau tanyakan informasi umum melalui SISKA AI.</p><Link href="/user/chat" className="btn btn-primary">Chat admin</Link> <Link href="/user/ai" className="btn btn-outline">SISKA AI</Link></section><section className="card help-card"><h3>Edukasi dan dukungan</h3><p>Pelajari hak, privasi, dan pilihan dukungan.</p><Link href="/user/education" className="link-teal">Buka edukasi</Link></section></div><button className="btn btn-outline" onClick={()=>void load()} disabled={loading}>Muat ulang</button></AppShell>;
}

export function LiveNewReportPage() {
  const router = useRouter();
  const [category,setCategory]=useState(""); const [incidentAt,setIncidentAt]=useState(""); const [location,setLocation]=useState(""); const [description,setDescription]=useState("");
  const [files,setFiles]=useState<File[]>([]); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [createdId,setCreatedId]=useState("");
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { const report=await submitNewReport({category,incidentAt:incidentAt?new Date(incidentAt).toISOString():null,location:location.trim()||null,description}); setCreatedId(report.id); for (const file of files) await uploadEvidenceMultipart(report.id,file); router.push(`/user/reports/${encodeURIComponent(report.id)}`); } catch(e) { setError(errorText(e)); } finally { setBusy(false); } }
  function addFiles(list: FileList|null) { if(!list)return; const accepted=Array.from(list); const invalid=accepted.find(f=>!(["application/pdf","image/jpeg","image/png"].includes(f.type))||f.size>5*1024*1024); if(invalid){setError(`${invalid.name}: format harus PDF/JPG/PNG dan ukuran maksimal 5 MiB.`);return;} setFiles(old=>[...old,...accepted]); }
  return <AppShell role="user"><Head title="Buat laporan" subtitle="Isi informasi yang diperlukan. Lampiran bersifat opsional."/><form className="card" onSubmit={submit} style={{maxWidth:850}}><div className="form-grid"><label className="field"><span className="label">Kategori *</span><select required value={category} onChange={e=>setCategory(e.target.value)}><option value="">Pilih kategori</option>{["Pelecehan seksual","Kekerasan seksual","Kekerasan berbasis gender","Perundungan","Lainnya"].map(x=><option key={x}>{x}</option>)}</select></label><label className="field"><span className="label">Tanggal/waktu kejadian</span><input type="datetime-local" value={incidentAt} onChange={e=>setIncidentAt(e.target.value)}/></label><label className="field full"><span className="label">Lokasi / media kejadian</span><input maxLength={500} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Opsional"/></label><label className="field full"><span className="label">Kronologi / deskripsi *</span><textarea className="textarea" required minLength={1} maxLength={20000} rows={7} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ceritakan hal yang ingin disampaikan…"/></label><label className="field full"><span className="label">Bukti pendukung (maks. 5 MiB per file)</span><input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={e=>addFiles(e.target.files)}/>{files.map((f,i)=><div key={`${f.name}-${i}`} className="help">{f.name} · {(f.size/1024).toFixed(0)} KB <button type="button" className="link-teal" onClick={()=>setFiles(old=>old.filter((_,j)=>j!==i))}>Hapus</button></div>)}</label></div>{error&&<Alert>{error}</Alert>}{createdId&&<p className="help" role="status">Laporan {createdId} sudah tersimpan. Jika unggah bukti gagal, buka detail laporan untuk memastikan status dan bukti yang berhasil dikirim.</p>}<div className="actions"><button className="btn btn-primary" disabled={busy||!!createdId}>{busy?"Mengirim…":createdId?"Laporan sudah dibuat":"Kirim laporan"}</button>{createdId&&<Link className="btn btn-outline" href={`/user/reports/${encodeURIComponent(createdId)}`}>Buka laporan {createdId}</Link>}<Link href="/user" className="btn btn-outline">Batal</Link></div><p className="help">Laporan dibuat terlebih dahulu. Jika unggah bukti gagal, laporan tetap tersimpan dan bukti dapat dikirim ulang melalui detail laporan.</p></form></AppShell>;
}

export function LiveHistoryPage({admin=false}:{admin?:boolean}) {
  const [rows,setRows]=useState<SerializedReport[]>([]); const [cursor,setCursor]=useState<string|null>(null); const [next,setNext]=useState<string|null>(null); const [status,setStatus]=useState(""); const [query,setQuery]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const load=useCallback(async(reset=true)=>{setBusy(true);setError("");try{const result=await fetchReportsPage({limit:20,status:status ? status as ReportStatus : undefined,cursor:reset?undefined:cursor});setRows(old=>reset?result.items:[...old,...result.items]);setNext(result.nextCursor);setCursor(result.nextCursor);}catch(e){setError(errorText(e));}finally{setBusy(false);}},[status,cursor]);
  useEffect(()=>{void load(true);},[status]);
  const filtered=useMemo(()=>rows.filter(r=>(r.id+r.category+r.description).toLowerCase().includes(query.toLowerCase())),[rows,query]);
  return <AppShell role={admin?"admin":"user"}><Head title={admin?"Kelola laporan":"Riwayat laporan"} subtitle={admin?"Daftar laporan yang dapat ditinjau petugas.":"Daftar laporan milik akunmu."} action={!admin?<Link href="/user/new-report" className="btn btn-primary">Buat laporan</Link>:undefined}/><div className="card filters"><label className="field"><span className="label">Cari laporan</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nomor, kategori, deskripsi"/></label><label className="field"><span className="label">Status</span><select value={status} onChange={e=>{setStatus(e.target.value);setCursor(null);}}><option value="">Semua status</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button className="btn btn-outline" onClick={()=>void load(true)} disabled={busy}>Terapkan / muat ulang</button></div>{error&&<Alert>{error}</Alert>}{busy&&<p className="help">Memuat…</p>}<ReportRows rows={filtered} admin={admin}/>{next&&<button className="btn btn-outline" disabled={busy} onClick={()=>void load(false)}>Muat berikutnya</button>}</AppShell>;
}

function Detail({id,admin}:{id:string;admin:boolean}) {
 const [report,setReport]=useState<SerializedReportDetail|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [uploadBusy,setUploadBusy]=useState(false);const [next,setNext]=useState<ReportStatus>("under_review");const [note,setNote]=useState("");
 const load=useCallback(async()=>{try{setError("");const r=await fetchReportDetail(id);setReport(r);setNext(r.status==="submitted"?"under_review":r.status==="under_review"?"in_progress":"resolved");}catch(e){setError(errorText(e));}},[id]);useEffect(()=>{void load();},[load]);
 async function update(e:React.FormEvent){e.preventDefault();if(!report)return;setBusy(true);setError("");try{await transitionReportStatusByAdmin(id,{status:next,note:note.trim()||undefined});await load();setNote("");}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 async function download(evidenceId:string){try{const {url}=await (await import("@/lib/api-client")).fetchEvidenceSignedDownloadUrl(id,evidenceId);window.open(url,"_blank","noopener,noreferrer");}catch(e){setError(errorText(e));}}
 async function uploadEvidence(file:File){setUploadBusy(true);setError("");try{await uploadEvidenceMultipart(id,file);await load();}catch(e){setError(errorText(e));}finally{setUploadBusy(false);}}
 return <AppShell role={admin?"admin":"user"}><Head title="Detail laporan" subtitle={`Nomor laporan: ${id}`} action={<Link className="btn btn-outline" href={admin?"/admin/reports":"/user/reports"}>Kembali</Link>}/>{error&&<Alert>{error}</Alert>}{!report?<p className="help">Memuat detail laporan…</p>:<div className="two-col wide-right"><section className="card"><div className="section-head"><h2>{report.id}</h2><StatusLabel status={report.status}/></div><dl className="detail-grid"><dt>Kategori</dt><dd>{report.category}</dd><dt>Tanggal kejadian</dt><dd>{dateText(report.incidentAt)}</dd><dt>Tanggal laporan</dt><dd>{dateText(report.createdAt)}</dd><dt>Lokasi</dt><dd>{report.location||"Tidak dicantumkan"}</dd></dl><h3>Kronologi / deskripsi</h3><p style={{whiteSpace:"pre-wrap",lineHeight:1.8}}>{report.description}</p><h3>Bukti pendukung</h3>{report.evidence.length?report.evidence.map(x=><div key={x.id} className="file-item"><span>{x.originalName} · {(x.sizeBytes/1024).toFixed(0)} KB</span><button className="btn btn-outline btn-sm" onClick={()=>void download(x.id)}>Unduh</button></div>):<p className="help">Belum ada bukti.</p>}{!admin&&<label className="field"><span className="label">Tambah bukti (PDF/JPG/PNG, maks. 5 MiB)</span><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploadBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadEvidence(file);e.currentTarget.value="";}}/>{uploadBusy&&<small className="help">Mengunggah bukti…</small>}</label>}<h3>Riwayat status</h3>{report.statusHistory.map(h=><div key={h.id} className="help" style={{padding:"8px 0",borderBottom:"1px solid var(--line)"}}>{dateText(h.createdAt)} · {h.fromStatus?STATUS[h.fromStatus]+" → ":""}{STATUS[h.toStatus]}{h.note?` — ${h.note}`:""}</div>)}</section>{admin?<form className="card" onSubmit={update}><h3>Tindak lanjut petugas</h3><p>Status saat ini: <StatusLabel status={report.status}/></p><label className="field"><span className="label">Status baru</span><select value={next} onChange={e=>setNext(e.target.value as ReportStatus)}>{(ALLOWED_STATUS_TRANSITIONS[report.status] as readonly ReportStatus[]).map(s=><option key={s} value={s}>{STATUS[s]}</option>)}</select></label><label className="field"><span className="label">Catatan {isStatusNoteRequired(report.status,next)?"* (wajib untuk transisi ini)":"(opsional)"}</span><textarea className="textarea" rows={4} required={isStatusNoteRequired(report.status,next)} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="btn btn-primary" disabled={busy}>{busy?"Menyimpan…":"Simpan status"}</button></form>:<section className="card"><h3>Butuh klarifikasi?</h3><p>Hubungi petugas melalui percakapan aman.</p><Link className="btn btn-primary" href="/user/chat">Chat dengan admin</Link></section>}</div>}</AppShell>;
}
export function LiveUserReportDetail({id}:{id:string}){return <Detail id={id} admin={false}/>;}
export function LiveAdminReportDetail({id}:{id:string}){return <Detail id={id} admin={true}/>;}

function firestoreDate(value: unknown): string {
 if (value && typeof value === "object" && "toDate" in value && typeof (value as {toDate?:unknown}).toDate === "function") {
  return (value as {toDate:()=>Date}).toDate().toISOString();
 }
 if (value instanceof Date) return value.toISOString();
 if (typeof value === "string") return value;
 return new Date(0).toISOString();
}

function ConversationChat({admin}:{admin:boolean}) {
 const [conversations,setConversations]=useState<SerializedConversation[]>([]);
 const [active,setActive]=useState("");
 const [messages,setMessages]=useState<SerializedMessage[]>([]);
 const [reporterNames,setReporterNames]=useState<Record<string,string>>({});
 const [currentUid,setCurrentUid]=useState("");
 const [text,setText]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [statusBusy,setStatusBusy]=useState(false);

 // Auth dan daftar percakapan: listener dipasang setelah Firebase Auth memulihkan sesi.
 useEffect(()=>{
  let cancelled=false;
  const unsubscribers:Unsubscribe[]=[];
  let assignedItems:SerializedConversation[]=[];
  let unassignedItems:SerializedConversation[]=[];
  const mergeAdminItems=()=>{
   const merged=new Map<string,SerializedConversation>();
   for(const item of [...assignedItems,...unassignedItems]) merged.set(item.id,item);
   const items=Array.from(merged.values()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
   setConversations(items);
   setActive(current=>current&&items.some(item=>item.id===current)?current:(items[0]?.id??""));
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
    const toConversation=(id:string,data:Record<string,unknown>):SerializedConversation=>({
     id,
     type:"report_admin",
     reporterId:String(data.reporterId??data.reporterUid??""),
     reporterUid:String(data.reporterId??data.reporterUid??""),
     assignedAdminId:typeof data.assignedAdminId==="string"?data.assignedAdminId:typeof data.adminUid==="string"?data.adminUid:null,
     adminUid:typeof data.assignedAdminId==="string"?data.assignedAdminId:typeof data.adminUid==="string"?data.adminUid:null,
     reportId:typeof data.reportId==="string"?data.reportId:null,
     status:data.status==="closed"?"closed":"open",
     createdAt:firestoreDate(data.createdAt),
     updatedAt:firestoreDate(data.updatedAt),
     lastMessage:typeof data.lastMessage==="string"?data.lastMessage:null,
     lastMessageAt:data.lastMessageAt?firestoreDate(data.lastMessageAt):null,
     lastMessageSenderUid:typeof data.lastMessageSenderUid==="string"?data.lastMessageSenderUid:null,
    });

    if(admin){
     const assignedQuery=query(collection(db,"conversations"),where("assignedAdminId","==",user.uid),orderBy("updatedAt","desc"));
     const unassignedQuery=query(collection(db,"conversations"),where("assignedAdminId","==",null),orderBy("updatedAt","desc"));
     unsubscribers.push(onSnapshot(assignedQuery,snapshot=>{
      assignedItems=snapshot.docs.map(item=>toConversation(item.id,item.data() as Record<string,unknown>));
      mergeAdminItems();setLoading(false);
     },listenerError=>{if(cancelled||!auth?.currentUser)return;console.error("[SISKA CHAT] Admin assigned listener:",listenerError);setError(`Gagal memuat percakapan yang ditugaskan: ${listenerError.message}`);setLoading(false);}));
     unsubscribers.push(onSnapshot(unassignedQuery,snapshot=>{
      unassignedItems=snapshot.docs.map(item=>toConversation(item.id,item.data() as Record<string,unknown>));
      mergeAdminItems();setLoading(false);
     },listenerError=>{if(cancelled||!auth?.currentUser)return;console.error("[SISKA CHAT] Admin unassigned listener:",listenerError);setError(`Gagal memuat percakapan yang belum ditugaskan: ${listenerError.message}`);setLoading(false);}));
    }else{
     const reporterQuery=query(collection(db,"conversations"),where("reporterId","==",user.uid),orderBy("updatedAt","desc"));
     unsubscribers.push(onSnapshot(reporterQuery,snapshot=>{
      const items=snapshot.docs.map(item=>toConversation(item.id,item.data() as Record<string,unknown>));
      setConversations(items);setLoading(false);
      setActive(current=>current&&items.some(item=>item.id===current)?current:(items[0]?.id??""));
     },listenerError=>{if(cancelled||!auth?.currentUser)return;console.error("[SISKA CHAT] Reporter listener:",listenerError);setError(`Gagal memuat percakapan: ${listenerError.message}`);setLoading(false);}));
    }
   }catch(cause){
    if(!cancelled){const message=cause instanceof Error?cause.message:"Gagal menginisialisasi listener chat.";console.error("[SISKA CHAT] Initialization:",cause);setError(message);setLoading(false);}
   }
  }
  const stop=()=>{
   if(cancelled)return;
   cancelled=true;
   unsubscribers.splice(0).forEach(unsubscribe=>unsubscribe());
  };
  window.addEventListener("siska:before-logout",stop);
  void subscribe();
  return ()=>{
   window.removeEventListener("siska:before-logout",stop);
   stop();
  };
 },[admin]);

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

 // Pesan percakapan aktif: Firestore snapshot menjadi satu-satunya sumber state pesan.
 useEffect(()=>{
  if(!db||!active){setMessages([]);return;}
  setMessages([]);
  const messagesQuery=query(collection(db,"conversations",active,"messages"),orderBy("createdAt","asc"));
  const unsubscribe=onSnapshot(messagesQuery,snapshot=>{
   const items=snapshot.docs.map(item=>{
    const data=item.data();
    return {id:item.id,senderUid:String(data.senderUid??""),body:String(data.body??""),createdAt:firestoreDate(data.createdAt),attachmentPath:typeof data.attachmentPath==="string"?data.attachmentPath:null};
   });
   setMessages(items);
  },listenerError=>{
   if(!auth?.currentUser)return;
   console.error(`[SISKA CHAT] Messages listener (${active}):`,listenerError);
   setError(`Gagal menerima pesan realtime: ${listenerError.message}`);
  });
  const stop=()=>unsubscribe();
  window.addEventListener("siska:before-logout",stop);
  return ()=>{
   window.removeEventListener("siska:before-logout",stop);
   stop();
  };
 },[active]);

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
  const body=text.trim();
  if(!active||!body||!current||current.status!=="open")return;
  setBusy(true);setError("");
  try{
   await postConversationMessage(active,body);
   // Jangan append hasil API ke state lokal: onSnapshot akan menerima dokumen yang sudah committed.
   setText("");
  }catch(cause){setError(errorText(cause));}
  finally{setBusy(false);}
 }

 async function toggleStatus(){
  if(!current)return;
  setStatusBusy(true);setError("");
  try{await updateConversationStatusByAdmin(active,{status:current.status==="open"?"closed":"open"});}
  catch(cause){setError(errorText(cause));}
  finally{setStatusBusy(false);}
 }

 return <AppShell role={admin?"admin":"user"}>
  <Head title={admin?"Chat pengguna":"Chat dengan Admin"} subtitle="Pesan dan perubahan percakapan diperbarui otomatis." action={!admin?<button className="btn btn-primary" disabled={busy||loading} onClick={()=>void start()}>{conversations.some(item=>item.status==="open")?"Buka percakapan":"Percakapan baru"}</button>:undefined}/>
  {error&&<Alert>{error}</Alert>}{notice&&<p className="help" role="status">{notice}</p>}
  <div className="chat" style={{minHeight:520}}>
   <aside className="chat-list"><div className="chat-list-head"><h3>Percakapan</h3></div>
    {conversations.map(conversation=>{
     const name=admin?(reporterNames[conversation.reporterId]||"Pengguna SISKA"):"Chat dengan Admin";
     const preview=conversation.lastMessage||"Buka untuk melihat pesan";
     return <button key={conversation.id} className={`conv ${active===conversation.id?"active":""}`} onClick={()=>setActive(conversation.id)}>
      <b>{name}</b><small>{preview.length>64?`${preview.slice(0,61)}…`:preview}</small><small>{conversation.status==="open"?"Terbuka":"Ditutup"} · {dateText(conversation.lastMessageAt||conversation.updatedAt)}</small>
     </button>;
    })}
    {!loading&&!conversations.length&&<p className="help">Belum ada percakapan.</p>}
    {loading&&!conversations.length&&<p className="help">Memuat percakapan…</p>}
   </aside>
   <section className="chat-pane">
    <div className="chat-head"><b>{current?(admin?reporterName:"Chat dengan Admin"):"Percakapan SISKA"}</b><div className="row">
     {admin&&current&&<button className="btn btn-outline btn-sm" disabled={statusBusy} onClick={()=>void toggleStatus()}>{current.status==="open"?"Tutup percakapan":"Buka kembali"}</button>}
    </div></div>
    <div className="chat-body" aria-live="polite">
     {messages.map(message=>{
      const isReporter=message.senderUid===current?.reporterId;
      const isMine=message.senderUid===currentUid;
      const author=isReporter?(admin?reporterName:"Anda"):"Admin SISKA";
      return <div key={message.id} className={`bubble ${isMine?"me":"them"}`}><div className="who">{author}<span>{dateText(message.createdAt)}</span></div>{message.body}</div>;
     })}
     {!messages.length&&<p className="help">{current?"Belum ada pesan. Mulai percakapan dengan mengirim pesan.":"Pilih percakapan untuk melihat pesan."}</p>}
    </div>
    <form className="compose" onSubmit={send}><div className="compose-row"><input value={text} onChange={event=>setText(event.target.value)} maxLength={10000} placeholder="Tulis pesan…" disabled={!current||current.status==="closed"||busy}/><button className="btn btn-primary btn-sm" disabled={!current||current.status==="closed"||busy||!text.trim()}>Kirim</button></div></form>
   </section>
  </div>
 </AppShell>;
}
export function LiveUserChatPage(){return <ConversationChat admin={false}/>;}
export function LiveAdminChatPage(){return <ConversationChat admin={true}/>;}
export function LiveUserAiPage(){return <AppShell role="user"><Head title="Chatbot SISKA AI" subtitle="Asisten informasi umum berdasarkan knowledge base terverifikasi."/><AiChatPanel/></AppShell>;}

export function LiveAdminDashboard(){const [summary,setSummary]=useState<ReportsSummaryResult|null>(null);const [rows,setRows]=useState<SerializedReport[]>([]);const [error,setError]=useState("");useEffect(()=>{Promise.all([fetchReportsSummary(),fetchReportsPage({limit:8})]).then(([s,r])=>{setSummary(s);setRows(r.items);}).catch(e=>setError(errorText(e)));},[]);return <AppShell role="admin"><Head title="Dashboard admin" subtitle="Ringkasan laporan aktual dari backend SISKA."/><div className="stats">{[{label:"Total laporan",value:summary?.total??0},...Object.entries(STATUS).map(([k,v])=>({label:v,value:summary?.byStatus[k as ReportStatus]??0}))].map(s=><div className="stat" key={s.label}><div className="stat-top">{s.label}</div><div className="stat-num">{s.value}</div></div>)}</div>{error&&<Alert>{error}</Alert>}<div className="section-head"><h2>Laporan terbaru</h2><Link href="/admin/reports" className="link-teal">Kelola semua</Link></div><ReportRows rows={rows} admin/></AppShell>;}


export function LiveAdminDocumentsPage(){
 const [documents,setDocuments]=useState<SerializedKnowledgeDocument[]>([]);const [file,setFile]=useState<File|null>(null);const [title,setTitle]=useState("");const [error,setError]=useState("");const [notice,setNotice]=useState("");const [loading,setLoading]=useState(false);const [saving,setSaving]=useState(false);const [deleting,setDeleting]=useState("");const [reindexing,setReindexing]=useState(false);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await fetchKnowledgeDocumentsByAdmin();setDocuments(result.items);}catch(e){setError(errorText(e));}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function upload(e:React.FormEvent){e.preventDefault();if(!file)return;setSaving(true);setError("");setNotice("");try{await uploadKnowledgePdfByAdmin(file,title.trim()||undefined);setFile(null);setTitle("");const picker=document.getElementById("siska-kb-pdf") as HTMLInputElement|null;if(picker)picker.value="";setNotice("Dokumen diterima backend dan masuk ke proses indeks.");await load();}catch(e){setError(errorText(e));}finally{setSaving(false);}}
 async function remove(doc:SerializedKnowledgeDocument){if(!window.confirm(`Hapus dokumen "${doc.title}" dan seluruh chunk terkait?`))return;setDeleting(doc.id);setError("");try{await deleteKnowledgeDocumentByAdmin(doc.id);setNotice(`Dokumen “${doc.title}” berhasil dihapus.`);await load();}catch(e){setError(errorText(e));}finally{setDeleting("");}}
 async function reindex(){setReindexing(true);setError("");setNotice("");try{const result=await triggerKnowledgeReindexByAdmin();setNotice(`Reindex ${result.status}: ${result.processedCount} diproses, ${result.indexedCount} berhasil, ${result.failedCount} gagal.`);await load();}catch(e){setError(errorText(e));}finally{setReindexing(false);}}
 return <AppShell role="admin"><Head title="Knowledge base SISKA AI" subtitle="Unggah PDF, pantau status indeks, hapus dokumen, dan jalankan reindex melalui backend."/><div className="two-col"><form className="card" onSubmit={upload}><h2 className="card-title">Unggah dokumen PDF</h2><label className="field"><span className="label">Judul dokumen (opsional)</span><input maxLength={250} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Pedoman layanan SISKA"/></label><label className="field"><span className="label">File PDF (maks. 25 MiB) *</span><input id="siska-kb-pdf" type="file" accept="application/pdf,.pdf" required onChange={e=>setFile(e.target.files?.[0]??null)}/></label>{file&&<p className="help">{file.name} · {(file.size/1024/1024).toFixed(2)} MiB</p>}<button className="btn btn-primary" disabled={!file||saving}>{saving?"Mengunggah…":"Unggah dan indeks"}</button></form><section className="card"><h2 className="card-title">Pengindeksan</h2><p className="prose">Reindex meminta backend memproses ulang dokumen knowledge base yang tersedia. Status akhirnya dapat berubah setelah pekerjaan selesai.</p><button className="btn btn-outline" disabled={reindexing||loading} onClick={()=>void reindex()}>{reindexing?"Meminta reindex…":"Jalankan reindex"}</button><button className="btn btn-outline" style={{marginLeft:8}} disabled={loading} onClick={()=>void load()}>Muat ulang daftar</button></section></div>{error&&<Alert>{error}</Alert>}{notice&&<p className="help" role="status">{notice}</p>}<section className="card" style={{marginTop:18}}><div className="section-head"><h2>Dokumen terdaftar</h2><span className="chip">{documents.length} dokumen</span></div>{loading&&<p className="help">Memuat dokumen…</p>}{!loading&&!documents.length&&<p className="help">Belum ada dokumen knowledge base.</p>}{documents.map(doc=><div key={doc.id} className="file-item" style={{justifyContent:"space-between",gap:12}}><div style={{minWidth:0}}><b>{doc.title}</b><div className="help">{doc.status.toUpperCase()} · {doc.chunkCount} chunk · versi {doc.version} · {dateText(doc.updatedAt)}</div>{doc.errorCode&&<div className="error-text">Kode: {doc.errorCode}</div>}</div><button className="btn btn-outline btn-sm" disabled={deleting===doc.id} onClick={()=>void remove(doc)}>{deleting===doc.id?"Menghapus…":"Hapus"}</button></div>)}</section></AppShell>;
}


export function LiveAdminAuditPage(){
 const [events,setEvents]=useState<SerializedAuditEvent[]>([]);const [error,setError]=useState("");const [loading,setLoading]=useState(false);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await fetchAuditEventsByAdmin({limit:50});setEvents(result.items);}catch(e){setError(errorText(e));}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 return <AppShell role="admin"><Head title="Audit log" subtitle="Catatan aktivitas backend untuk akuntabilitas dan penelusuran tindakan." action={<button className="btn btn-outline" disabled={loading} onClick={()=>void load()}>Muat ulang</button>}/>{error&&<Alert>{error}</Alert>}{loading&&<p className="help">Memuat audit log…</p>}{!loading&&!events.length&&<div className="table-card empty"><h3>Belum ada aktivitas</h3></div>}<div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor UID</th><th>Aksi</th><th>Target</th><th>Request ID</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td>{dateText(event.occurredAt)}</td><td><code>{event.actorUid}</code></td><td>{event.action}</td><td>{event.targetType}: {event.targetId}</td><td><code>{event.requestId}</code></td></tr>)}</tbody></table></div></AppShell>;
}

export function LiveProfilePage(){
 const [name,setName]=useState("");const [email,setEmail]=useState("");const [role,setRole]=useState("");const [error,setError]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 const [currentPassword,setCurrentPassword]=useState("");const [newPassword,setNewPassword]=useState("");const [confirmPassword,setConfirmPassword]=useState("");
 useEffect(()=>{fetchMyProfile().then(p=>{setName(p.displayName);setEmail(p.email);setRole(p.role);}).catch(e=>setError(errorText(e)));},[]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setMessage("");try{const p=await updateMyProfileName(name.trim());if(auth?.currentUser) await updateProfile(auth.currentUser,{displayName:p.displayName});setName(p.displayName);setMessage("Nama profil berhasil diperbarui.");}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 async function changePassword(e:React.FormEvent){e.preventDefault();setError("");setMessage("");if(newPassword.length<6){setError("Password baru minimal 6 karakter.");return;}if(newPassword!==confirmPassword){setError("Konfirmasi password tidak sama.");return;}const user=auth?.currentUser;if(!user?.email){setError("Sesi akun tidak ditemukan. Silakan login ulang.");return;}setBusy(true);try{await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,currentPassword));await updatePassword(user,newPassword);setCurrentPassword("");setNewPassword("");setConfirmPassword("");setMessage("Password berhasil diperbarui.");}catch(e){setError((e as {code?:string})?.code==="auth/wrong-password"?"Password saat ini tidak sesuai.":"Password belum dapat diperbarui. Silakan login ulang jika sesi kedaluwarsa.");}finally{setBusy(false);}}
 return <AppShell role="user"><Head title="Profil dan pengaturan" subtitle="Informasi akun tersimpan pada profil SISKA."/><div className="stack" style={{maxWidth:700}}><form className="card" onSubmit={save}><h2 className="card-title">Informasi akun</h2><label className="field"><span className="label">Nama tampilan</span><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field"><span className="label">Email</span><input value={email} readOnly/></label><label className="field"><span className="label">Peran</span><input value={role} readOnly/></label><button className="btn btn-primary" disabled={busy}>{busy?"Menyimpan…":"Simpan perubahan"}</button></form><form className="card" onSubmit={changePassword}><h2 className="card-title">Ubah password</h2><label className="field"><span className="label">Password saat ini</span><input type="password" autoComplete="current-password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label className="field"><span className="label">Password baru</span><input type="password" autoComplete="new-password" required minLength={6} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label className="field"><span className="label">Konfirmasi password baru</span><input type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label><button className="btn btn-outline" disabled={busy}>Ubah password</button></form>{error&&<Alert>{error}</Alert>}{message&&<p role="status" className="help">{message}</p>}</div></AppShell>;
}
