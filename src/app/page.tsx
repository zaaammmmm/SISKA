import Link from "next/link";
import { ArrowRight, Bot, FilePlus2, HeartHandshake, ShieldCheck, FileText } from "lucide-react";
import { Logo } from "@/components/logo";

const features = [
  { icon: FileText, title: "Pelaporan yang terarah", body: "Susun laporan dengan panduan yang jelas. Detail tambahan dapat dibagikan saat kamu siap.", cta: "Mulai Buat Laporan", href: "/user/new-report" },
  { icon: HeartHandshake, title: "Pendampingan psikologis", body: "Kenali pilihan dukungan profesional. Hubungi petugas untuk informasi layanan yang tersedia.", cta: "Pelajari Pendampingan", href: "/user/education" },
  { icon: Bot, title: "Butuh Informasi Awal?", body: "Tanyakan alur layanan dan penggunaan SISKA. AI bukan pengganti pendamping profesional.", cta: "Tanya SISKA AI", href: "/user/ai" },
];

const steps = [
  { t: "Siapkan akun", d: "Daftar dan masuk ke ruang pengguna." },
  { t: "Tulis informasi awal", d: "Isi yang kamu ingat; simpan draft bila perlu." },
  { t: "Pantau tindak lanjut", d: "Lihat status dan hubungi petugas." },
];

export default function Home() {
  return (
    <>
      <header className="pub-header">
        <div className="pub-header-in">
          <div><Logo size={38} /></div>
          <nav className="pub-nav" aria-label="Menu utama">
            <Link href="/" className="active">Beranda</Link>
            <Link href="#layanan">Layanan</Link>
            <Link href="/user/education">Edukasi</Link>
            <Link href="/register/terms">Tentang</Link>
          </nav>
          <div className="pub-cta">
            <Link href="/login" className="login">Login</Link>
            <Link href="/register" className="btn btn-primary" style={{ height: 35 }}>Register</Link>
          </div>
        </div>
      </header>

      <main className="landing">
        <div className="pub-wrap">
          <section className="hero">
            <div style={{ paddingTop: 3.5 }}>
              <div className="eyebrow">SISKA • Sistem Informasi Pengaduan Kekerasan Seksual</div>
              <h1>Kamu berhak didengar.<br />Mulai sesuai kenyamananmu.</h1>
              <p className="lead">Sampaikan laporan, pahami pilihan layanan, dan temukan dukungan. Tidak perlu menceritakan lebih dari yang kamu siap bagikan.</p>
              <div className="hero-actions">
                <Link href="/user/new-report" className="btn btn-primary"><FilePlus2 aria-hidden /> Buat Laporan</Link>
                <Link href="#layanan" className="btn btn-outline">Pelajari Layanan</Link>
              </div>
            </div>
            <aside className="hero-card">
              <HeartHandshake className="big" aria-hidden />
              <h3>Satu langkah, satu pilihan.</h3>
              <p>Kamu menentukan kapan memulai dan informasi apa yang ingin dibagikan.</p>
              <span className="chip">Demo • data ilustrasi</span>
            </aside>
          </section>

          <section id="layanan" className="feature-cards" aria-label="Layanan">
            {features.map((f) => (
              <article className="feature" key={f.title}>
                <div className="feature-head"><f.icon aria-hidden /><h3>{f.title}</h3></div>
                <p>{f.body}</p>
                <Link href={f.href} className="link-arrow"><ArrowRight aria-hidden /> {f.cta}</Link>
              </article>
            ))}
          </section>

          <div className="steps-head">
            <h2>Cara memulai laporan</h2>
            <span>Ikuti langkahnya sesuai kesiapanmu.</span>
          </div>
          <ol className="steps" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {steps.map((s, i) => (
              <li className="step" key={s.t}>
                <span className="step-no">{i + 1}</span>
                <div><b>{s.t}</b><span>{s.d}</span></div>
              </li>
            ))}
          </ol>
          <div className="privacy">
            <ShieldCheck aria-hidden />
            <div>
              <b>Privasi dimulai dari pilihanmu.</b>
              <span>Bagikan hanya data yang diperlukan. Kebijakan akses dan penyimpanan perlu ditinjau institusi sebelum layanan digunakan.</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="pub-footer">
        <div className="pub-wrap pub-footer-in">
          <div><Logo size={19} /><small>Demo layanan • bukan layanan darurat.</small></div>
          <div>
            <h4>Kontak &amp; bantuan</h4>
            <p>Chat dengan Admin setelah login • Kontak resmi akan ditambahkan oleh institusi.</p>
          </div>
          <nav aria-label="Tautan footer">
            <Link href="/user/education">Panduan layanan</Link>
            <Link href="/register/terms">Syarat dan Ketentuan</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
