"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText, Paperclip, Search, Send, X } from "lucide-react";
import type { Conversation } from "@/lib/demo-data";
import { fileMeta } from "@/components/ui";

export type Msg = {
  id: string; from: "me" | "them"; author: string; time: string; text: string;
  attachment?: { name: string; meta: string };
};

type Header = { icon: LucideIcon; title: string; subtitle: string; chip: React.ReactNode };

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
};

const nowTime = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".");

export function ChatWorkspace({
  conversations, initialThread, header, dateLabel, banner, meLabel, placeholder, helper,
  attachHelper, onAttachmentChange, autoReply, listTitle = "Percakapan", allowAttach = true,
}: Props) {
  const [active, setActive] = useState(conversations[0]?.id);
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<Record<string, Msg[]>>({ [conversations[0]?.id]: initialThread });
  const [text, setText] = useState("");
  const [att, setAtt] = useState<{ name: string; meta: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // jaga agar percakapan aktif selalu ada pada daftar yang sedang difilter
  useEffect(() => {
    if (!conversations.find((c) => c.id === active)) setActive(conversations[0]?.id);
  }, [conversations, active]);

  const list = useMemo(
    () => conversations.filter((c) => (c.title + c.line1 + c.line2).toLowerCase().includes(query.toLowerCase())),
    [conversations, query],
  );
  const thread = (active && threads[active]) || [];
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }); }, [thread.length, active]);
  useEffect(() => onAttachmentChange?.(!!att), [att, onAttachmentChange]);

  function push(id: string, m: Msg) {
    setThreads((t) => ({ ...t, [id]: [...(t[id] ?? []), m] }));
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!active || (!text.trim() && !att)) return;
    const id = active;
    push(id, { id: crypto.randomUUID(), from: "me", author: meLabel, time: nowTime(), text: text.trim(), attachment: att ?? undefined });
    setText(""); setAtt(null);
    if (autoReply) {
      setTimeout(() => push(id, { id: crypto.randomUUID(), from: "them", author: autoReply.author, time: nowTime(), text: autoReply.text }), 900);
    }
  }

  const activeConv = conversations.find((c) => c.id === active);
  const h = typeof header === "function" ? header(activeConv) : header;
  const bannerNode = typeof banner === "function" ? banner(activeConv) : banner;
  const Head = h.icon;
  return (
    <div className="chat">
      <aside className="chat-list" aria-label={listTitle}>
        <div className="chat-list-head">
          <h3>{listTitle}</h3>
          <div className="chat-search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari percakapan" aria-label="Cari percakapan" />
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
        {list.length === 0 && <p className="help" style={{ padding: "7px 17px" }}>Tidak ada percakapan yang cocok.</p>}
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
          {thread.length === 0 && <p className="help" style={{ textAlign: "center" }}>Belum ada pesan pada percakapan ini.</p>}
          {thread.map((m) => (
            <div key={m.id} className={`bubble ${m.from}`}>
              <div className="who">{m.author}<span>{m.time}</span></div>
              {m.text}
              {m.attachment && <div className="att"><FileText aria-hidden />{m.attachment.name}</div>}
            </div>
          ))}
        </div>

        <form className="compose" onSubmit={send}>
          {att && (
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
            {allowAttach && (
              <>
                <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,application/pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setAtt({ name: f.name, meta: fileMeta(f, "belum dikirim") }); e.target.value = ""; }} />
                <button type="button" className="clip" aria-label="Lampirkan file" onClick={() => fileRef.current?.click()}><Paperclip /></button>
              </>
            )}
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Tulis pesan" />
            <button className="btn btn-primary btn-sm" style={{ height: 36 }}>
              <Send aria-hidden /> {att ? "Kirim Lampiran" : "Kirim"}
            </button>
          </div>
          <p className="help">{att && attachHelper ? attachHelper : helper}</p>
        </form>
      </section>
    </div>
  );
}
