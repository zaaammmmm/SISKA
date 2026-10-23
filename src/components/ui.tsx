"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Check, CheckCircle2, ChevronDown, Eye, EyeOff, File as FileIcon, FileText, ShieldCheck, X, Download,
} from "lucide-react";
import { statusClass, type Report, type Status } from "@/lib/demo-data";

/* ---------- Heading & small atoms ---------- */
export function PageHead({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={`pill ${statusClass[status]}`}>{status}</span>;
}

export function Note({
  title, children, icon: I = ShieldCheck, warn = false, className = "",
}: { title?: string; children: React.ReactNode; icon?: LucideIcon; warn?: boolean; className?: string }) {
  return (
    <div className={`note ${warn ? "note-warn" : ""} ${className}`} role="note">
      <I aria-hidden />
      <div>
        {title && <b>{title}</b>}
        {children}
      </div>
    </div>
  );
}

/* ---------- Form fields ---------- */
type BaseProps = { label?: string; error?: string; help?: string; className?: string };

export function TextField({
  label, error, help, className = "", icon: I, ...rest
}: BaseProps & { icon?: LucideIcon } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <div className="input-wrap">
        <input id={id} className={`input ${I ? "has-icon" : ""} ${error ? "invalid" : ""}`} aria-invalid={!!error} {...rest} />
        {I && <I className="input-icon" aria-hidden />}
      </div>
      {error ? <p className="error-text" role="alert">{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}

export function PasswordField({
  label, error, help, className = "", ...rest
}: BaseProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className={`field ${className}`}>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <div className="input-wrap">
        <input id={id} type={show ? "text" : "password"} className={`input has-icon ${error ? "invalid" : ""}`} aria-invalid={!!error} {...rest} />
        <button type="button" className="input-icon" onClick={() => setShow((s) => !s)} aria-label={show ? "Sembunyikan password" : "Tampilkan password"}>
          {show ? <Eye /> : <EyeOff />}
        </button>
      </div>
      {error ? <p className="error-text" role="alert">{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}

export function SelectField({
  label, className = "", icon: I, children, ...rest
}: { label?: string; className?: string; icon?: LucideIcon } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const Right = I ?? ChevronDown;
  return (
    <div className={`field ${className}`}>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <div className="input-wrap">
        <select id={id} className="select" {...rest}>{children}</select>
        <Right className="input-icon" aria-hidden />
      </div>
    </div>
  );
}

/* ---------- Report table & pagination ---------- */
export function ReportsTable({ rows, admin = false, showCategory = false }: { rows: Report[]; admin?: boolean; showCategory?: boolean }) {
  const base = admin ? "/admin/reports/" : "/user/reports/";
  return (
    <div className="table-card">
      <div className="table-scroll">
        <table className={`tbl ${showCategory ? "tall" : ""}`}>
          <colgroup>
            <col style={{ width: "15.4%" }} /><col style={{ width: "10.6%" }} /><col style={{ width: "46.6%" }} />
            <col style={{ width: "16%" }} /><col style={{ width: "11.4%" }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Nomor laporan</th><th scope="col">Tanggal</th>
              <th scope="col">{showCategory ? "Ringkasan / Kategori" : "Ringkasan"}</th>
              <th scope="col">Status</th><th scope="col">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td className="id">{x.id}</td>
                <td className="date">{x.date}</td>
                <td>{x.summary}{showCategory && <span className="sub">{x.category}</span>}</td>
                <td><StatusPill status={x.status} /></td>
                <td className="act"><Link href={base + x.id}>Lihat Detail</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pagination({
  page, perPage, total, onPage, noun = "laporan ilustrasi",
}: { page: number; perPage: number; total: number; onPage: (p: number) => void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  // jendela maksimal 3 nomor halaman, mengikuti desain
  const start = Math.min(Math.max(1, page - 1), Math.max(1, pages - 2));
  const nums = Array.from({ length: Math.min(3, pages) }, (_, i) => start + i);
  return (
    <div className="pager">
      <span>Menampilkan {from}–{to} dari {total} {noun}</span>
      <div className="pager-btns">
        <button className="pager-btn" disabled={page === 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
        {nums.map((n) => (
          <button key={n} className={`pager-btn ${n === page ? "active" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>
        ))}
        <button className="pager-btn" disabled={page === pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
      </div>
    </div>
  );
}

/* ---------- Timeline, file chips ---------- */
export function Stepper({ steps }: { steps: { title: string; done: boolean; note: string }[] }) {
  return (
    <ol className="stepper">
      {steps.map((s) => (
        <li key={s.title} className={s.done ? "" : "is-todo"}>
          <span className={`dot ${s.done ? "done" : "todo"}`}>{s.done && <Check strokeWidth={3} />}</span>
          <div><b>{s.title}</b><span>{s.note}</span></div>
        </li>
      ))}
    </ol>
  );
}

export function FileItem({
  name, meta, onRemove, download = false, doc = false,
}: { name: string; meta: string; onRemove?: () => void; download?: boolean; doc?: boolean }) {
  const Ico = doc ? FileText : FileIcon;
  return (
    <div className="file-item">
      <Ico aria-hidden />
      <div className="meta"><b title={name}>{name}</b><span>{meta}</span></div>
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Hapus ${name}`}><X /></button>}
      {download && <button type="button" aria-label={`Unduh ${name}`}><Download /></button>}
    </div>
  );
}

export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
export function fileMeta(f: File, suffix: string) {
  const ext = (f.name.split(".").pop() || "file").toUpperCase();
  return `${ext} • ${formatSize(f.size)} • ${suffix}`;
}

/* ---------- Overlays ---------- */
export function Toast({ message, onClose, ms = 3500 }: { message: string; onClose: () => void; ms?: number }) {
  useEffect(() => {
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [message, ms, onClose]);
  return (
    <div className="toast" role="status" aria-live="polite">
      <CheckCircle2 aria-hidden />
      {message}
    </div>
  );
}

export function Modal({ children, onClose, labelledBy }: { children: React.ReactNode; onClose: () => void; labelledBy: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>{children}</div>
    </div>
  );
}
