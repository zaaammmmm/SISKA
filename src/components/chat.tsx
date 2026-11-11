"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText, Paperclip, Search, Send, X, Headset, User } from "lucide-react";
import type { Conversation } from "@/lib/demo-data";
import { fileMeta } from "@/components/ui";
import { auth, db } from "@/lib/firebase";
import { fetchConversationMessages, fetchConversations, markConversationAsRead, openConversation, postConversationMessage } from "@/lib/api-client";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";

export type Msg = {
  id: string; from: "me" | "them"; author: string; time: string; text: string;
  attachment?: { name: string; meta: string };
  readByRecipient?: boolean;
};

type Header = { icon: LucideIcon; title: string; subtitle: string; chip: React.ReactNode };
type LiveRole = "reporter" | "admin";

type Props = {
  conversations: Conversation[];
  initialThread: Msg[];
  header: Header | ((c?: Conversation) => Header);
  dateLabel: string;
  banner?: React.ReactNode | ((c?: Conversation) => React.ReactNode);
  meLabel: string;
  placeholder: string;
  helper: string;
  attachHelper?: string;
  onAttachmentChange?: (has: boolean) => void;
  autoReply?: { author: string; text: string };
  listTitle?: string;
  allowAttach?: boolean;
  /** Aktifkan listener Firestore untuk chat produksi; pengiriman tetap melalui API backend. */
  liveRole?: LiveRole;
};

const nowTime = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".");
const timeFromValue = (value: unknown) => {
  const date = value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date ? value : value ? new Date(String(value)) : new Date();
  return Number.isNaN(date.getTime()) ? nowTime() : date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".");
};

function timestampMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value &&
      typeof (value as { toMillis: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof value === "object" && "toDate" in value &&
      typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const date = value instanceof Date ? value : value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function mapConversation(
  id: string,
  data: DocumentData,
  role: LiveRole,
  reporterName = "",
): Conversation {
  const reporterId = String(data.reporterId ?? data.reporterUid ?? "");
  const lastMessage = typeof data.lastMessage === "string" ? data.lastMessage.trim() : "";
  const lastSenderUid = String(data.lastMessageSenderUid ?? "");
  const senderLabel = lastSenderUid
    ? lastSenderUid === reporterId
      ? (reporterName || "Pelapor")
      : "Petugas SISKA"
    : "";
  return {
    id,
    title: role === "reporter"
      ? "Percakapan dengan SISKA"
      : (reporterName || `Pelapor ${reporterId.slice(0, 8) || "baru"}`),
    time: timeFromValue(data.updatedAt),
    line1: role === "reporter"
      ? "Petugas SISKA"
      : `Pelapor • ${reporterName || reporterId.slice(0, 8) || "-"}`,
    line2: lastMessage
      ? `${senderLabel ? `${senderLabel}: ` : ""}${lastMessage}`
      : data.status === "closed" ? "Percakapan ditutup" : "Buka untuk melihat pesan",
    kind: "direct",
    reporterId,
    sortTime: timestampMillis(data.updatedAt),
    unreadCount: Number.isFinite(Number(data.unreadCount)) ? Number(data.unreadCount) : 0,
    badge: Number(data.unreadCount) > 0 ? `${Number(data.unreadCount) > 99 ? "99+" : Number(data.unreadCount)} belum dibaca` : undefined,
  };
}

function snapshotItems(
  snapshot: QuerySnapshot<DocumentData>,
  role: LiveRole,
  reporterNames: Record<string, string>,
): Conversation[] {
  return snapshot.docs.map((item) => {
    const data = item.data();
    const reporterId = String(data.reporterId ?? data.reporterUid ?? "");
    return mapConversation(item.id, data, role, reporterNames[reporterId] ?? "");
  });
}


export function ChatWorkspace({
  conversations, initialThread, header, dateLabel, banner, meLabel, placeholder, helper,
  attachHelper, onAttachmentChange, autoReply, listTitle = "Percakapan", allowAttach = true, liveRole,
}: Props) {
  const [liveConversations, setLiveConversations] = useState<Conversation[]>([]);
  const [reporterNamesVersion, setReporterNamesVersion] = useState(0);
  const reporterNamesRef = useRef<Record<string, string>>({});
  const visibleConversations = liveRole ? liveConversations : conversations;
  const [active, setActive] = useState<string | undefined>(conversations[0]?.id);
  const [queryText, setQueryText] = useState("");
  const [threads, setThreads] = useState<Record<string, Msg[]>>({ [conversations[0]?.id ?? ""]: initialThread });
  const [text, setText] = useState("");
  const [att, setAtt] = useState<{ name: string; meta: string } | null>(null);
  const [currentUid, setCurrentUid] = useState("");
  const [liveError, setLiveError] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const activeConversation = visibleConversations.find((conversation) => conversation.id === active);

  // Sinkronkan daftar percakapan lintas akun/perangkat melalui Firestore listener.
  useEffect(() => {
    if (!liveRole) return;
    let cancelled = false;
    const unsubscribers: Unsubscribe[] = [];
    const profileUnsubscribers = new Map<string, Unsubscribe>();
    let assignedItems: Conversation[] = [];
    let unassignedItems: Conversation[] = [];
    const syncReporterProfiles = (items: Conversation[]) => {
      if (liveRole !== "admin" || !db) return;
      const reporterIds = new Set(items.map((item) => item.reporterId).filter((id): id is string => !!id));
      for (const [reporterId, unsubscribe] of profileUnsubscribers) {
        if (!reporterIds.has(reporterId)) {
          unsubscribe();
          profileUnsubscribers.delete(reporterId);
        }
      }
      for (const reporterId of reporterIds) {
        if (profileUnsubscribers.has(reporterId)) continue;
        const unsubscribe = onSnapshot(doc(db, "users", reporterId), (profileSnapshot) => {
          const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
          const displayName = typeof profile.displayName === "string" ? profile.displayName.trim() : "";
          const name = displayName || "Pengguna";
          reporterNamesRef.current = { ...reporterNamesRef.current, [reporterId]: name };
          setReporterNamesVersion((version) => version + 1);
          setLiveConversations((current) => current.map((conversation) => {
            if (conversation.reporterId !== reporterId) return conversation;
            return {
              ...conversation,
              title: name,
              line1: `Pelapor • ${name}`,
              line2: conversation.line2.replace(/^Pelapor:\s*/, `${name}: `),
            };
          }));
        }, (error) => {
          setLiveError(`Gagal memuat identitas pelapor: ${error.message}`);
        });
        profileUnsubscribers.set(reporterId, unsubscribe);
      }
    };

    const publishAdminItems = () => {
      const merged = new Map<string, Conversation>();
      [...assignedItems, ...unassignedItems].forEach((item) => merged.set(item.id, item));
      const mergedItems = [...merged.values()];
      syncReporterProfiles(mergedItems);
      const sorted = mergedItems.sort((a, b) => (b.sortTime ?? 0) - (a.sortTime ?? 0));
      setLiveConversations(sorted);
      setActive((current) => current && merged.has(current) ? current : sorted[0]?.id);
    };

    const start = async () => {
      try {
        if (!auth || !db) throw new Error("Firebase belum dikonfigurasi untuk fitur chat real-time.");
        await auth.authStateReady();
        const user = auth.currentUser;
        if (!user) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
        // Pastikan custom claim role terbaru ikut dibawa token Firestore Security Rules.
        await user.getIdToken(true);
        if (cancelled) return;
        setCurrentUid(user.uid);
        setLiveError("");

        if (liveRole === "reporter") {
          // Pastikan satu percakapan umum tersedia; endpoint backend menjaga aturan kepemilikan.
          const opened = await openConversation();
          if (cancelled) return;
          setActive(opened.id);
          const reporterQuery = query(
            collection(db, "conversations"),
            where("reporterId", "==", user.uid),
            orderBy("updatedAt", "desc"),
          );
          unsubscribers.push(onSnapshot(reporterQuery, (snapshot) => {
            const items = snapshotItems(snapshot, "reporter", reporterNamesRef.current);
            setLiveConversations(items);
            setActive((current) => current && items.some((item) => item.id === current) ? current : opened.id);
          }, (error) => setLiveError(`Gagal menerima pembaruan percakapan: ${error.message}`)));
        } else {
          // Dua listener mencakup chat yang sudah ditugaskan dan chat yang belum diklaim.
          const assignedQuery = query(
            collection(db, "conversations"),
            where("assignedAdminId", "==", user.uid),
            orderBy("updatedAt", "desc"),
          );
          const unassignedQuery = query(
            collection(db, "conversations"),
            where("assignedAdminId", "==", null),
            orderBy("updatedAt", "desc"),
          );
          unsubscribers.push(onSnapshot(assignedQuery, (snapshot) => {
            assignedItems = snapshotItems(snapshot, "admin", reporterNamesRef.current);
            publishAdminItems();
          }, (error) => setLiveError(`Gagal memuat chat yang ditugaskan: ${error.message}`)));
          unsubscribers.push(onSnapshot(unassignedQuery, (snapshot) => {
            unassignedItems = snapshotItems(snapshot, "admin", reporterNamesRef.current);
            publishAdminItems();
          }, (error) => setLiveError(`Gagal memuat chat yang belum ditugaskan: ${error.message}`)));
        }
      } catch (error) {
        if (!cancelled) setLiveError(error instanceof Error ? error.message : "Tidak dapat menghubungkan chat real-time.");
      }
    };
    void start();
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      profileUnsubscribers.forEach((unsubscribe) => unsubscribe());
      profileUnsubscribers.clear();
    };
  }, [liveRole]);

  // Ambil unreadCount dari API terotorisasi. Listener Firestore tetap dipakai untuk
  // daftar chat realtime, sedangkan API menjadi sumber kebenaran status baca per UID.
  useEffect(() => {
    if (!liveRole) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refreshUnread = async () => {
      try {
        const result = await fetchConversations();
        if (cancelled) return;
        const unreadById = new Map(result.items.map((item) => [item.id, item.unreadCount ?? 0]));
        setLiveConversations((current) => current.map((conversation) => {
          const unreadCount = unreadById.get(conversation.id) ?? 0;
          return {
            ...conversation,
            unreadCount,
            badge: unreadCount > 0 ? `${unreadCount > 99 ? "99+" : unreadCount} belum dibaca` : undefined,
          };
        }));
      } catch {
        // Pertahankan nilai terakhir jika API sementara tidak tersedia.
      }
    };
    void refreshUnread();
    timer = setInterval(() => void refreshUnread(), 15_000);
    const onFocus = () => void refreshUnread();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [liveRole]);

  // Membuka percakapan menandai seluruh pesan masuk sebagai dibaca khusus untuk UID ini.
  useEffect(() => {
    if (!liveRole || !active || !activeConversation) return;
    let cancelled = false;
    setLiveConversations((current) => current.map((conversation) =>
      conversation.id === active
        ? { ...conversation, unreadCount: 0, badge: undefined }
        : conversation,
    ));
    void markConversationAsRead(active).then(() => {
      if (cancelled) return;
      // Segarkan status agar badge pada sidebar/header konsisten dengan server.
      void fetchConversations().then((result) => {
        if (cancelled) return;
        const unreadById = new Map(result.items.map((item) => [item.id, item.unreadCount ?? 0]));
        setLiveConversations((current) => current.map((conversation) => {
          const unreadCount = unreadById.get(conversation.id) ?? 0;
          return { ...conversation, unreadCount, badge: unreadCount > 0 ? `${unreadCount > 99 ? "99+" : unreadCount} belum dibaca` : undefined };
        }));
      }).catch(() => undefined);
    }).catch((error) => {
      if (!cancelled) setLiveError(error instanceof Error ? error.message : "Status baca percakapan gagal diperbarui.");
    });
    return () => { cancelled = true; };
  }, [liveRole, active, activeConversation?.id]);

  // Listener pesan aktif. Pesan baru tampil otomatis tanpa polling maupun refresh.
  useEffect(() => {
    if (!liveRole || !active || !db || !currentUid) return;
    const messagesQuery = query(
      collection(db, "conversations", active, "messages"),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(messagesQuery, (snapshot) => {
      const next: Msg[] = snapshot.docs.map((item) => {
        const data = item.data();
        const senderUid = String(data.senderUid ?? "");
        return {
          id: item.id,
          from: senderUid === currentUid ? "me" : "them",
          author: senderUid === currentUid
            ? meLabel
            : liveRole === "admin"
              ? reporterNamesRef.current[activeConversation?.reporterId ?? ""] || "Pelapor"
              : "Petugas SISKA",
          time: timeFromValue(data.createdAt),
          text: String(data.body ?? ""),
        };
      });
      setThreads((current) => ({ ...current, [active]: next }));
      // API mengembalikan readByRecipient berdasarkan receipt lawan bicara.
      void fetchConversationMessages(active, { limit: 100 }).then((result) => {
        const readState = new Map(result.items.map((message) => [message.id, message.readByRecipient]));
        setThreads((current) => ({
          ...current,
          [active]: (current[active] ?? next).map((message) => ({
            ...message,
            readByRecipient: readState.get(message.id) ?? false,
          })),
        }));
      }).catch(() => undefined);
    }, (error) => setLiveError(`Gagal menerima pesan real-time: ${error.message}`));
  }, [liveRole, active, currentUid, meLabel, activeConversation?.reporterId, reporterNamesVersion]);

  // Perbarui indikator "Dibaca" pada pesan terkirim ketika peserta lain membuka chat.
  useEffect(() => {
    if (!liveRole || !active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refreshReadState = async () => {
      try {
        const result = await fetchConversationMessages(active, { limit: 100 });
        if (cancelled) return;
        const readState = new Map(result.items.map((message) => [message.id, message.readByRecipient]));
        setThreads((current) => ({
          ...current,
          [active]: (current[active] ?? []).map((message) => ({
            ...message,
            readByRecipient: readState.get(message.id) ?? false,
          })),
        }));
      } catch {
        // Status terakhir tetap ditampilkan jika refresh gagal.
      }
    };
    void refreshReadState();
    timer = setInterval(() => void refreshReadState(), 15_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [liveRole, active]);

  // jaga agar percakapan aktif selalu ada pada daftar yang sedang difilter
  useEffect(() => {
    if (!visibleConversations.find((c) => c.id === active)) setActive(visibleConversations[0]?.id);
  }, [visibleConversations, active]);

  const list = useMemo(
    () => visibleConversations.filter((c) => (c.title + c.line1 + c.line2).toLowerCase().includes(queryText.toLowerCase())),
    [visibleConversations, queryText],
  );
  const thread = (active && threads[active]) || [];
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [thread.length, active]);
  useEffect(() => onAttachmentChange?.(!!att), [att, onAttachmentChange]);

  function push(id: string, m: Msg) {
    setThreads((t) => ({ ...t, [id]: [...(t[id] ?? []), m] }));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!active || (!text.trim() && !att) || sending) return;
    const id = active;
    if (liveRole) {
      if (!text.trim()) return;
      setSending(true);
      setLiveError("");
      try {
        // API backend memvalidasi peserta, status percakapan, rate limit, dan senderUid.
        // Listener Firestore akan memasukkan pesan setelah transaksi server berhasil.
        await postConversationMessage(id, text.trim());
        setText("");
      } catch (error) {
        setLiveError(error instanceof Error ? error.message : "Pesan gagal dikirim. Silakan coba lagi.");
      } finally {
        setSending(false);
      }
      return;
    }
    push(id, { id: crypto.randomUUID(), from: "me", author: meLabel, time: nowTime(), text: text.trim(), attachment: att ?? undefined });
    setText(""); setAtt(null);
    if (autoReply) {
      setTimeout(() => push(id, { id: crypto.randomUUID(), from: "them", author: autoReply.author, time: nowTime(), text: autoReply.text }), 900);
    }
  }

  const activeConv = activeConversation;
  const h = liveRole
    ? {
        icon: liveRole === "admin" ? User : Headset,
        title: liveRole === "admin" ? (activeConv?.title ?? "Pilih percakapan") : "Petugas SISKA",
        subtitle: liveRole === "admin" ? "Chat langsung dengan pelapor" : "Percakapan langsung dengan petugas SISKA",
        chip: <span className="chip chip-teal">{activeConv ? "Terhubung" : "Menunggu percakapan"}</span>,
      }
    : typeof header === "function" ? header(activeConv) : header;
  const bannerNode = liveRole ? null : typeof banner === "function" ? banner(activeConv) : banner;
  const Head = h.icon;
  return (
    <div className="chat">
      <aside className="chat-list" aria-label={listTitle}>
        <div className="chat-list-head">
          <h3>{listTitle}</h3>
          <div className="chat-search">
            <input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Cari percakapan" aria-label="Cari percakapan" />
            <Search aria-hidden />
          </div>
        </div>
        {list.map((c) => (
          <button key={c.id} className={`conv ${c.id === active ? "active" : ""}`} onClick={() => setActive(c.id)}>
            <div className="conv-top">{c.title}<span>{c.time}</span></div>
            <div className="conv-l"><span>{c.line1}</span></div>
            <div className="conv-l"><span>{c.line2}</span>{c.badge && <span className="conv-badge">{c.badge}</span>}</div>
          </button>
        ))}
        {list.length === 0 && <p className="help" style={{ padding: "7px 17px" }}>{liveRole && !liveError ? "Belum ada percakapan." : "Tidak ada percakapan yang cocok."}</p>}
      </aside>

      <section className="chat-pane">
        <div className="chat-head">
          <Head aria-hidden />
          <div className="t"><b>{h.title}</b><small>{h.subtitle}</small></div>
          {h.chip}
        </div>
        <div className="chat-body" ref={bodyRef}>
          <div className="chat-date">{dateLabel}</div>
          {bannerNode && <div className="chat-banner">{bannerNode}</div>}
          {thread.length === 0 && <p className="help" style={{ textAlign: "center" }}>{liveRole ? active ? "Belum ada pesan. Mulai percakapan dengan mengirim pesan." : "Pilih percakapan untuk melihat pesan." : "Belum ada pesan pada percakapan ini."}</p>}
          {thread.map((m) => (
            <div key={m.id} className={`bubble ${m.from}`}>
              <div className="who">{m.author}<span>{m.time}</span></div>
              {m.text}
              {m.from === "me" && liveRole && <small className="message-read-state">{m.readByRecipient ? "Dibaca" : "Terkirim"}</small>}
              {m.attachment && <div className="att"><FileText aria-hidden />{m.attachment.name}</div>}
            </div>
          ))}
        </div>

        <form className="compose" onSubmit={send}>
          {att && !liveRole && (
            <div className="attach-row">
              <div className="file-item">
                <FileText aria-hidden />
                <div className="meta"><b>{att.name}</b><span>{att.meta}</span></div>
                <button type="button" onClick={() => setAtt(null)} aria-label={`Hapus ${att.name}`}><X /></button>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAtt(null)}>Batal</button>
            </div>
          )}
          <div className="compose-row">
            {allowAttach && !liveRole && (
              <>
                <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,application/pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setAtt({ name: f.name, meta: fileMeta(f, "belum dikirim") }); e.target.value = ""; }} />
                <button type="button" className="clip" aria-label="Lampirkan file" onClick={() => fileRef.current?.click()}><Paperclip /></button>
              </>
            )}
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={liveRole && !active ? "Pilih percakapan terlebih dahulu" : placeholder} aria-label="Tulis pesan" disabled={!!liveRole && (!active || sending)} />
            <button className="btn btn-primary btn-sm" style={{ height: 36 }} disabled={!!liveRole && (!active || sending || !text.trim())}>
              <Send aria-hidden /> {sending ? "Mengirim..." : "Kirim"}
            </button>
          </div>
          {liveError && <p className="help" role="alert" style={{ color: "#b42318" }}>{liveError}</p>}
          <p className="help">{liveRole ? (sending ? "Mengirim pesan ke server..." : "Pesan tersinkron otomatis untuk seluruh peserta percakapan.") : att && attachHelper ? attachHelper : helper}</p>
        </form>
      </section>
    </div>
  );
}
