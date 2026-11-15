import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { QuickExit } from "@/components/quick-exit";

export type PublicNavKey = "home" | "layanan" | "education" | "about";

const NAV: { key: PublicNavKey; href: string; label: string }[] = [
  { key: "home", href: "/", label: "Beranda" },
  { key: "layanan", href: "/layanan", label: "Layanan" },
  { key: "education", href: "/education", label: "Edukasi" },
  { key: "about", href: "/about", label: "Tentang" },
];

export function PublicHeader({ active }: { active?: PublicNavKey }) {
  return (
    <header className="pub-header">
      <div className="pub-header-in">
        <Logo size={40} />
        <nav className="pub-nav" aria-label="Menu utama">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="pub-cta">
          <QuickExit />
          <Link href="/login" className="login">Masuk</Link>
          <Link href="/register" className="btn btn-primary btn-sm">Daftar</Link>
          <details className="pub-menu">
            <summary aria-label="Buka menu"><Menu aria-hidden /><span>Menu</span></summary>
            <div className="pub-menu-panel">
              {NAV.map((n) => (
                <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}>{n.label}</Link>
              ))}
              <hr />
              <Link href="/login">Masuk</Link>
              <Link href="/register">Daftar</Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="pub-footer">
      <div className="pub-wrap pub-footer-in">
        <div>
          <Logo size={36} tone="white" />
          <small>SISKA bukan layanan darurat. Jika kamu dalam bahaya sekarang, hubungi layanan darurat setempat.</small>
        </div>
        <div>
          <h4>Kontak dan bantuan</h4>
          <p>Setelah masuk, kamu bisa mengirim pesan ke petugas lewat Chat dengan Admin. Kontak resmi akan ditambahkan oleh institusi.</p>
        </div>
        <nav aria-label="Tautan footer">
          <Link href="/layanan">Layanan</Link>
          <Link href="/education">Edukasi</Link>
          <Link href="/about">Tentang SISKA</Link>
          <Link href="/register/terms">Syarat dan ketentuan</Link>
        </nav>
      </div>
    </footer>
  );
}
