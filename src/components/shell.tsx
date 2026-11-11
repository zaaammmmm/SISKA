"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  BookOpen, Bot, ChevronDown, Copy, FilePlus2, Headset, HeartHandshake, LayoutGrid, LogOut, Menu, FileText,
  MessagesSquare, SlidersHorizontal, UserRound,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { NotificationCenter } from "@/components/notification-center";
import { fetchUnreadNotificationCount } from "@/lib/api-client";
import { auth } from "@/lib/firebase";
import { useCurrentUser } from "@/lib/use-current-user";

type Role = "user" | "admin";

const NAV = {
  user: [
    { href: "/user", label: "Dashboard", icon: LayoutGrid, exact: true },
    { href: "/user/new-report", label: "Buat Laporan", icon: FilePlus2 },
    { href: "/user/reports", label: "Riwayat Laporan", icon: Copy },
    { href: "/user/chat", label: "Chat dengan Admin", icon: Headset },
    { href: "/user/ai", label: "Chatbot AI", icon: Bot },
    { href: "/education", label: "Edukasi", icon: BookOpen },
    { href: "/user/profile", label: "Profil dan Pengaturan", icon: SlidersHorizontal },
  ],
  admin: [
    { href: "/admin", label: "Dashboard Admin", icon: LayoutGrid, exact: true },
    { href: "/admin/reports", label: "Kelola Laporan", icon: Copy },
    { href: "/admin/chat", label: "Chat Pengguna", icon: MessagesSquare },
    { href: "/admin/documents", label: "Knowledge Base AI", icon: SlidersHorizontal },
    { href: "/admin/audit", label: "Audit Log", icon: FileText },
  ],
};

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [navUnread, setNavUnread] = useState({ reports: 0, chats: 0 });
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

  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) {
      setNavUnread({ reports: 0, chats: 0 });
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    // Gunakan endpoint yang sama dengan badge notifikasi agar kegagalan API
    // daftar percakapan tidak ikut menghilangkan badge laporan maupun chat.
    const refresh = async (requestedUid: string) => {
      if (!active || firebaseAuth.currentUser?.uid !== requestedUid) return;
      try {
        const result = await fetchUnreadNotificationCount();
        // Abaikan respons lama jika sesi berubah saat request berlangsung.
        if (!active || firebaseAuth.currentUser?.uid !== requestedUid) return;
        setNavUnread({
          reports: result.unreadReportCount ?? 0,
          chats: result.unreadConversationCount ?? 0,
        });
      } catch {
        // Pertahankan count terakhir saat API sementara gagal.
      }
    };

    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
      if (timer) clearInterval(timer);
      timer = undefined;

      if (!user) {
        setNavUnread({ reports: 0, chats: 0 });
        return;
      }

      void refresh(user.uid);
      timer = setInterval(() => void refresh(user.uid), 15_000);
    });

    const handleFocus = () => {
      const uid = firebaseAuth.currentUser?.uid;
      if (uid) void refresh(uid);
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      unsubscribeAuth();
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
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
        <div className="sidebar-logo"><Logo size={24} /></div>
        <div className="side-label">{admin ? "Admin Pages / Ruang Petugas" : "User Pages / Ruang Pengguna"}</div>
        <nav className="nav">
          {NAV[role].map((n) => (
            <Link key={n.href} href={n.href} className={isActive(n) ? "active" : ""} aria-current={isActive(n) ? "page" : undefined}>
              <n.icon aria-hidden /> <span>{n.label}</span>
              {((n.href.endsWith("/reports") && navUnread.reports > 0) ||
                (n.href.endsWith("/chat") && navUnread.chats > 0)) && (
                <span className="nav-unread-badge" aria-label={`${n.href.endsWith("/chat") ? navUnread.chats : navUnread.reports} belum dibaca`}>
                  {(n.href.endsWith("/chat") ? navUnread.chats : navUnread.reports) > 99
                    ? "99+"
                    : n.href.endsWith("/chat") ? navUnread.chats : navUnread.reports}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="side-info">
          <HeartHandshake aria-hidden />
          <b>Kamu memegang kendali.</b>
          <span>Bagikan hanya informasi yang nyaman untukmu.</span>
        </div>
        <button className="side-logout" onClick={logout}><LogOut aria-hidden /> Logout</button>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumb">
            <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu /></button>
            <span>SISKA / {admin ? "Administrasi layanan" : "Layanan dan pendampingan"}</span>
          </div>
          <div className="topbar-right">
            <NotificationCenter role={admin ? "admin" : "user"} />
            <span className="topbar-sep" />
            <div className="user-menu" ref={menuRef}>
              <button className="user-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
                <span className="avatar">{displayInitial}</span>
                <span>{me.name}</span>
                <ChevronDown size={14} color="#51656b" aria-hidden />
              </button>
              {menu && (
                <div className="menu" role="menu">
                  {!admin && <Link href="/user/profile" role="menuitem"><UserRound aria-hidden /> Profil dan Pengaturan</Link>}
                  <button role="menuitem" onClick={logout}><LogOut aria-hidden /> Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
