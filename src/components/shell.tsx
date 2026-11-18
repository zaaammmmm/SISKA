"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import {
  Bot, ChevronDown, Copy, FilePlus2, Headset, LayoutGrid, LogOut, Menu, FileText,
  MessagesSquare, SlidersHorizontal, UserRound,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { NotificationCenter } from "@/components/notification-center";
import { QuickExit } from "@/components/quick-exit";
import { auth } from "@/lib/firebase";
import { useCurrentUser } from "@/lib/use-current-user";
import { useUnreadSummary } from "@/lib/use-unread-summary";

type Role = "user" | "admin";

const NAV = {
  user: [
    { href: "/user", label: "Dashboard", icon: LayoutGrid, exact: true },
    { href: "/user/new-report", label: "Buat laporan", icon: FilePlus2 },
    { href: "/user/reports", label: "Riwayat laporan", icon: Copy },
    { href: "/user/chat", label: "Chat dengan Admin", icon: Headset },
    { href: "/user/ai", label: "SISKA AI", icon: Bot },
    { href: "/user/profile", label: "Profil dan pengaturan", icon: SlidersHorizontal },
  ],
  admin: [
    { href: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true },
    { href: "/admin/reports", label: "Kelola laporan", icon: Copy },
    { href: "/admin/chat", label: "Chat pengguna", icon: MessagesSquare },
    { href: "/admin/documents", label: "Dokumen SISKA AI", icon: SlidersHorizontal },
    { href: "/admin/audit", label: "Log audit", icon: FileText },
  ],
};

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  // Badge sidebar memakai sumber yang sama dengan lonceng: laporan unik + pengguna unik.
  const unread = useUnreadSummary();
  const menuRef = useRef<HTMLDivElement>(null);
  const admin = role === "admin";
  const me = useCurrentUser(admin ? "Petugas" : "Pengguna");
  const displayInitial = admin && !me.live ? "PA" : me.initial;

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function logout() {
    // Lepas seluruh listener Firestore sebelum token Auth dicabut oleh signOut().
    window.dispatchEvent(new Event("siska:before-logout"));
    try { if (auth) await signOut(auth); } finally { router.replace("/login"); }
  }

  const isActive = (n: { href: string; exact?: boolean }) =>
    n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/");

  return (
    <div className="shell">
      <div className={`overlay ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Navigasi utama">
        <div className="sidebar-logo"><Logo size={40} /></div>
        <nav className="nav">
          {NAV[role].map((n) => (
            <Link key={n.href} href={n.href} className={isActive(n) ? "active" : ""} aria-current={isActive(n) ? "page" : undefined}>
              <n.icon aria-hidden /> <span>{n.label}</span>
              {(() => {
                const count = n.href.endsWith("/chat") ? unread.chats : n.href.endsWith("/reports") ? unread.reports : 0;
                if (count <= 0) return null;
                const label = n.href.endsWith("/chat") ? `${count} pengguna dengan pesan belum dibaca` : `${count} laporan dengan pembaruan belum dibaca`;
                return <span className="nav-unread-badge" aria-label={label}>{count > 99 ? "99+" : count}</span>;
              })()}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <button className="side-logout" onClick={logout}><LogOut aria-hidden /> Keluar dari akun</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumb">
            <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Buka menu" aria-expanded={open}><Menu aria-hidden /></button>
            <span>{admin ? "Ruang petugas" : "Ruang pengguna"}</span>
          </div>
          <div className="topbar-right">
            {!admin && <QuickExit />}
            <NotificationCenter role={admin ? "admin" : "user"} />
            <span className="topbar-sep" />
            <div className="user-menu" ref={menuRef}>
              <button className="user-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
                <span className="avatar">{displayInitial}</span>
                <span>{me.name}</span>
                <ChevronDown size={16} aria-hidden />
              </button>
              {menu && (
                <div className="menu" role="menu">
                  {!admin && <Link href="/user/profile" role="menuitem"><UserRound aria-hidden /> Profil dan pengaturan</Link>}
                  <button role="menuitem" onClick={logout}><LogOut aria-hidden /> Keluar dari akun</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="isi" className="content">{children}</main>
      </div>
    </div>
  );
}
