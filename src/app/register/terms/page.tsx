import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { Logo } from "@/components/logo";
import { PrintButton } from "@/components/print-button";
import { QuickExit } from "@/components/quick-exit";

const sections = [
  { id: "tujuan", n: "01", t: "Tujuan layanan", p: "SISKA dirancang untuk memudahkan penyampaian laporan dan akses informasi dukungan. Layanan ini bukan pengganti layanan darurat. Lingkup layanan dan kewenangan petugas perlu disahkan oleh institusi." },
  { id: "kendali", n: "02", t: "Kendali pengguna", p: "Kamu dapat memilih informasi yang dibagikan sesuai kesiapanmu. Tidak perlu menuliskan rincian yang membuatmu tidak nyaman. Dalam rancangan ini, laporan dapat disimpan sebagai draft sebelum dilanjutkan." },
  { id: "privasi", n: "03", t: "Informasi dan privasi", p: "Hindari membagikan password dan data pihak lain yang tidak diperlukan. Hak akses, masa penyimpanan, permintaan koreksi atau penghapusan, serta penanggung jawab data harus dijelaskan dalam kebijakan resmi." },
  { id: "ai", n: "04", t: "Batasan SISKA AI", p: "AI hanya memberi informasi awal tentang penggunaan layanan. Jawabannya bukan nasihat medis atau hukum dan bukan pengganti pendamping profesional. Pengalihan ringkasan ke admin memerlukan persetujuan pengguna." },
  { id: "bantuan", n: "05", t: "Bantuan dan peninjauan", p: "Gunakan Chat dengan Admin untuk pertanyaan layanan. Institusi perlu melengkapi kontak resmi, mekanisme pengaduan terkait layanan, dan tanggal berlaku sebelum dokumen digunakan." },
];

export default function TermsPage() {
  return (
    <div className="terms-page">
      <header className="pub-header">
        <div className="pub-header-in">
          <Logo size={40} />
          <div className="pub-cta">
            <QuickExit />
            <Link href="/register" className="link-teal"><ArrowLeft size={16} aria-hidden style={{ display: "inline", verticalAlign: "-3px" }} /> Kembali ke pendaftaran</Link>
          </div>
        </div>
      </header>
      <main id="isi" className="terms-body">
        <div className="terms-head">
          <div>
            <h1>Syarat dan ketentuan</h1>
            <p>Panduan penggunaan SISKA. Versi ilustrasi, Oktober 2026.</p>
          </div>
          <PrintButton />
        </div>
        <div className="note note-warn" role="note">
          <Info aria-hidden />
          <div>
            <b>Draf ilustratif, perlu ditinjau institusi</b>
            Dokumen ini contoh isi untuk desain, bukan kebijakan resmi atau persetujuan hukum. Ketentuan, dasar pemrosesan data, dan kontak penanggung jawab harus ditetapkan institusi sebelum dipublikasikan.
          </div>
        </div>
        <div className="terms-grid">
          <nav className="toc" aria-label="Daftar isi">
            <h3>Daftar isi</h3>
            {sections.map((s) => <a key={s.id} href={`#${s.id}`}>{s.n.replace(/^0/, "")}. {s.t}</a>)}
          </nav>
          <article className="terms-card">
            {sections.map((s) => (
              <section key={s.id} id={s.id}>
                <h2>{s.n.replace(/^0/, "")}. {s.t}</h2>
                <p>{s.p}</p>
              </section>
            ))}
          </article>
        </div>
      </main>
    </div>
  );
}
