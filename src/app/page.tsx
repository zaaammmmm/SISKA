"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-chrome";
import { auth } from "@/lib/firebase";

const facts = [
  "Hanya kategori dan kronologi yang wajib diisi",
  "Belum terkirim sampai kamu menekan Kirim",
  "Status bisa dipantau kapan saja",
];

const previewSteps = [
  { label: "Menunggu tinjauan", state: "done" },
  { label: "Dalam peninjauan", state: "now" },
  { label: "Dalam proses", state: "" },
  { label: "Selesai", state: "" },
];

const statuses = [
  { label: "Menunggu tinjauan", tone: "amber", body: "Laporanmu sudah masuk dan belum dibuka petugas." },
  { label: "Dalam peninjauan", tone: "blue", body: "Petugas membaca dan memeriksa isi laporan." },
  { label: "Dalam proses", tone: "teal", body: "Tindak lanjut sedang dijalankan." },
  { label: "Selesai", tone: "green", body: "Proses selesai. Catatan akhir ada di riwayat laporan." },
];

export default function Home() {
  const router = useRouter();

  const handleCreateReport = () => {
    if (!auth?.currentUser) {
      router.push("/login?status=login-required");
      return;
    }

    router.push("/user/new-report");
  };

  return (
    <>
      <PublicHeader active="home" />
      <main id="isi">
        <div className="pub-wrap">
          <section className="hero" aria-labelledby="judul">
            <div>
              <h1 id="judul">Kamu berhak didengar. Mulai sesuai kenyamananmu.</h1>
              <p className="lead">
                Sampaikan laporan, pahami pilihan layanan, dan cari dukungan. Kamu tidak perlu menceritakan lebih dari yang siap kamu bagikan.
              </p>
              <div className="hero-actions">
                <button type="button" className="btn btn-primary" onClick={handleCreateReport}>Buat laporan</button>
                <Link href="/education" className="btn btn-outline">Baca dulu</Link>
              </div>
              <ul className="hero-facts">
                {facts.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>

            <aside className="preview" aria-label="Contoh tampilan status laporan">
              <span className="preview-tag">Contoh tampilan</span>
              <div className="preview-head">
                <div>
                  <b>SK-2611-0042</b>
                  <small>Status laporan</small>
                </div>
                <span className="pill blue">Dalam peninjauan</span>
              </div>
              <ol className="mini-steps">
                {previewSteps.map((s) => (
                  <li key={s.label} className={s.state}>{s.label}</li>
                ))}
              </ol>
              <div className="preview-msg">
                <b>Pesan dari petugas</b>
                Laporanmu sedang kami baca. Kamu bisa membalas di sini kapan pun siap.
              </div>
            </aside>
          </section>

          <div className="note note-warn" role="note">
            <TriangleAlert aria-hidden />
            <div>
              <b>SISKA bukan layanan darurat.</b>
              Jika kamu dalam bahaya sekarang, menjauhlah ke tempat aman dan hubungi layanan darurat setempat.
            </div>
          </div>

          <section className="bento" aria-label="Cara memakai SISKA">
            <article className="tile tile-dark w7">
              <h3>Melapor dengan caramu</h3>
              <p>Tulis laporan lewat formulir yang jelas. Kamu menentukan seberapa banyak yang ingin dibagikan; bukti pendukung boleh ditambahkan nanti.</p>
              <button type="button" className="btn btn-primary" onClick={handleCreateReport}>Buat laporan</button>
            </article>
            <article className="tile w5">
              <h3>Bertanya dulu</h3>
              <p>Tanyakan alur layanan ke SISKA AI, atau kirim pesan ke petugas setelah masuk. SISKA AI bukan pengganti pendamping profesional.</p>
              <Link href="/user/ai" className="link-teal">Tanya SISKA AI</Link>
            </article>
            <article className="tile tile-tint w5">
              <h3>Memahami hakmu</h3>
              <p>Baca materi tentang bentuk kekerasan, batas pribadi, dan pilihan dukungan profesional.</p>
              <Link href="/education" className="link-teal">Buka materi edukasi</Link>
            </article>
            <article className="tile w7">
              <h3>Bagikan seperlunya</h3>
              <p>Hindari menuliskan kata sandi atau data pihak lain yang tidak diperlukan. Kebijakan akses dan penyimpanan data mengikuti ketentuan institusi.</p>
              <Link href="/register/terms" className="link-teal">Baca syarat dan ketentuan</Link>
            </article>
          </section>

          <section className="steps-section" aria-labelledby="setelah">
            <h2 id="setelah" className="section-title">Setelah laporan dikirim</h2>
            <p className="section-sub">Kamu bisa melihat status laporan kapan saja. Setiap perubahan tercatat di riwayat, beserta catatan petugas bila ada.</p>
            <ol className="flow">
              {statuses.map((s) => (
                <li key={s.label}>
                  <span className={`pill ${s.tone}`}>{s.label}</span>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="cta-band" aria-label="Mulai">
            <div>
              <h2>Mulai kapan pun kamu siap.</h2>
              <p>Membuat akun tidak mengharuskanmu langsung melapor. Kamu bisa masuk, melihat-lihat, dan melanjutkan nanti.</p>
            </div>
            <div className="row">
              <Link href="/register" className="btn btn-primary">Buat akun</Link>
              <Link href="/login" className="btn btn-outline">Masuk</Link>
            </div>
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
