import Link from "next/link";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-chrome";

const lessons = [
  { id: "1", title: "Fisik", subtitle: "Apa itu kekerasan fisik?", short: "Kontak atau tindakan fisik yang menyakiti atau melanggar batas tubuh.", icon: "01", intro: "Kekerasan fisik adalah tindakan yang menggunakan kekuatan atau kontak tubuh secara tidak diinginkan dan dapat menimbulkan rasa sakit, cedera, atau ketakutan.", examples: ["Memukul, menendang, mendorong, atau mencubit.", "Menahan seseorang agar tidak pergi atau bergerak.", "Menyentuh tubuh tanpa persetujuan."], impact: "Dampaknya dapat berupa cedera, rasa takut, kehilangan rasa aman, atau kesulitan menjalani aktivitas sehari-hari. Setiap orang dapat merespons pengalaman secara berbeda.", action: "Utamakan keselamatan. Jika memungkinkan, menjauh ke tempat aman dan hubungi orang tepercaya atau petugas yang dapat mendampingi." },
  { id: "2", title: "Verbal", subtitle: "Apa itu kekerasan verbal?", short: "Ucapan yang merendahkan, mengancam, melecehkan, atau memaksa.", icon: "02", intro: "Kekerasan verbal mencakup kata-kata atau komunikasi lisan yang digunakan untuk merendahkan, mengintimidasi, mengancam, atau melanggar batas seseorang.", examples: ["Komentar seksual atau tubuh yang tidak diinginkan.", "Ancaman, hinaan, atau mempermalukan seseorang.", "Memaksa seseorang menjawab atau melakukan sesuatu melalui ucapan."], impact: "Ucapan dapat menimbulkan rasa malu, cemas, takut, atau menurunkan kepercayaan diri. Dampaknya tetap berarti meskipun tidak meninggalkan luka fisik.", action: "Kamu tidak wajib menanggapi atau membuktikan bahwa ucapan tersebut menyakitkan. Catat konteks bila aman dan cari dukungan dari orang tepercaya." },
  { id: "3", title: "Digital", subtitle: "Apa itu kekerasan digital?", short: "Perilaku melalui teknologi yang mengganggu, mengancam, atau melanggar privasi.", icon: "03", intro: "Kekerasan digital terjadi melalui perangkat, platform, atau komunikasi online, termasuk penyalahgunaan informasi dan konten pribadi.", examples: ["Mengirim pesan atau konten seksual yang tidak diminta.", "Menyebarkan foto, video, atau informasi pribadi tanpa izin.", "Mengancam, menguntit, atau mengontrol seseorang melalui akun digital."], impact: "Konten digital dapat menyebar luas dan membuat seseorang merasa tidak aman bahkan di ruang pribadi. Dampaknya dapat berlangsung setelah komunikasi dihentikan.", action: "Simpan bukti secara aman jika memungkinkan, periksa pengaturan privasi, blokir atau laporkan akun bila aman, dan jangan menyebarkan ulang konten sensitif." },
  { id: "4", title: "Nonverbal", subtitle: "Apa itu kekerasan nonverbal?", short: "Gestur, tatapan, atau tindakan tanpa kata yang mengintimidasi atau melecehkan.", icon: "04", intro: "Perilaku nonverbal dapat melanggar batas melalui gestur, ekspresi, tatapan, atau tindakan yang bermuatan seksual maupun mengintimidasi.", examples: ["Gestur seksual yang tidak diinginkan.", "Menunjukkan materi seksual tanpa persetujuan.", "Tatapan atau gerakan berulang yang membuat seseorang terintimidasi."], impact: "Perilaku ini dapat menimbulkan ketidaknyamanan, rasa terancam, atau membuat seseorang menghindari ruang dan aktivitas tertentu.", action: "Percayai batas dan rasa amanmu. Kamu dapat berpindah tempat, meminta bantuan, atau menjelaskan batas jika situasinya aman." },
  { id: "5", title: "Pemaksaan dan relasi kuasa", subtitle: "Ketika pilihan tidak benar-benar bebas", short: "Tekanan, ancaman, atau penyalahgunaan posisi untuk memengaruhi keputusan.", icon: "05", intro: "Pemaksaan terjadi ketika seseorang menggunakan tekanan, ancaman, manipulasi, atau posisi yang lebih berkuasa sehingga pilihan orang lain tidak lagi bebas.", examples: ["Mengaitkan nilai, pekerjaan, kesempatan, atau fasilitas dengan permintaan seksual.", "Mengancam konsekuensi jika seseorang menolak.", "Memanfaatkan ketergantungan, jabatan, atau relasi kuasa."], impact: "Relasi kuasa dapat membuat seseorang merasa tidak punya pilihan, takut kehilangan kesempatan, atau sulit menyampaikan penolakan. Persetujuan yang diberikan karena tekanan bukan persetujuan yang bebas.", action: "Kamu berhak meminta penjelasan dan pendampingan. Pertimbangkan berbicara dengan petugas atau pihak independen yang tepercaya." },
];

export function ServicesPage() {
  const services = [
    { title: "Pelaporan yang terarah", desc: "Sampaikan informasi awal secara bertahap. Kamu menentukan detail yang ingin dibagikan.", points: ["Formulir laporan terstruktur", "Lampiran bukti bila diperlukan", "Pantau status dan riwayat tindak lanjut"], href: "/register", cta: "Daftar untuk membuat laporan" },
    { title: "Informasi pendampingan", desc: "Kenali pilihan dukungan dan cari informasi sebelum menentukan langkah berikutnya.", points: ["Materi tentang bentuk kekerasan dan batas pribadi", "Rujukan sesuai ketersediaan layanan institusi", "Pilihan berbicara langsung dengan petugas"], href: "/education", cta: "Buka materi edukasi" },
    { title: "Bantuan informasi awal", desc: "SISKA AI menjelaskan alur dan informasi umum layanan. Ia bukan pengganti pendamping profesional.", points: ["Panduan memakai SISKA", "Jawaban berdasarkan dokumen yang disiapkan petugas", "Tidak untuk menceritakan kronologi atau data pribadi"], href: "/education", cta: "Pelajari batasannya" },
  ];
  return (
    <>
      <PublicHeader active="layanan" />
      <main id="isi" className="pub-wrap">
        <header className="page-top">
          <h1>Bantuan apa yang kamu perlukan?</h1>
          <p>Pilih jalur sesuai kebutuhan dan kesiapanmu. Kamu tidak harus melakukan semuanya sekaligus.</p>
        </header>
        <div className="page-body">
          <div className="svc-grid">
          {services.map((s) => (
            <article className="svc" key={s.title}>
              <h2>{s.title}</h2>
              <div>
                <p>{s.desc}</p>
                <ul>{s.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
                <Link href={s.href} className="link-teal">{s.cta}</Link>
              </div>
            </article>
          ))}
          </div>
          <section className="inline-cta">
            <div>
              <h2>Mulai dengan membaca atau mendaftar.</h2>
              <p>Membuat akun tidak mengharuskanmu langsung melapor. Kamu bisa masuk, melihat-lihat, dan melanjutkan ketika siap.</p>
            </div>
            <Link href="/register" className="btn btn-primary">Buat akun</Link>
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

export function PublicEducationPage() {
  return (
    <>
      <PublicHeader active="education" />
      <main id="isi" className="pub-wrap">
        <header className="page-top">
          <h1>Kenali bentuknya. Pahami batas dan persetujuan.</h1>
          <p>Materi dasar tentang bentuk kekerasan seksual, batas pribadi, dan pilihan dukungan. Isinya bersifat edukatif dan tidak menggantikan pendampingan profesional.</p>
        </header>
        <div className="page-body">
          <div className="topic-list">
            {lessons.map((l) => (
              <Link className="topic" href={`/education/detail/${l.id}`} key={l.id}>
                <h2>{l.title}</h2>
                <p>{l.short}</p>
                <span className="go">Baca materi</span>
              </Link>
            ))}
          </div>
          <div className="note" role="note" style={{ marginTop: 40 }}>
            <Info aria-hidden />
            <div>
              <b>Kamu tidak harus memahami semuanya sendirian.</b>
              Jika membutuhkan dukungan, pertimbangkan orang tepercaya atau petugas layanan. Kamu berhak menentukan langkah dan waktunya.
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

export function EducationDetailPage({ id }: { id: string }) {
  const lesson = lessons.find((x) => x.id === id);
  if (!lesson) {
    return (
      <>
        <PublicHeader active="education" />
        <main id="isi" className="pub-wrap">
          <header className="page-top">
            <h1>Materi tidak ditemukan</h1>
            <p>Topik edukasi yang kamu cari tidak tersedia.</p>
          </header>
          <p style={{ marginTop: 32 }}><Link href="/education" className="btn btn-primary">Kembali ke edukasi</Link></p>
        </main>
        <PublicFooter />
      </>
    );
  }
  const prev = Number(id) === 1 ? 5 : Number(id) - 1;
  const next = Number(id) === 5 ? 1 : Number(id) + 1;
  return (
    <>
      <PublicHeader active="education" />
      <main id="isi" className="pub-wrap">
        <header className="page-top">
          <Link href="/education" className="back"><ArrowLeft size={16} aria-hidden /> Semua materi</Link>
          <h1>{lesson.title}</h1>
          <p>{lesson.subtitle}</p>
        </header>
        <div className="article-layout">
          <article className="article">
            <section>
              <h2>Pengertian</h2>
              <p>{lesson.intro}</p>
            </section>
            <section>
              <h2>Bentuk yang perlu dikenali</h2>
              <p>Contoh berikut membantu mengenali perilaku yang dapat melanggar batas. Situasi setiap orang berbeda.</p>
              <ul>{lesson.examples.map((x) => <li key={x}>{x}</li>)}</ul>
            </section>
            <section>
              <h2>Kemungkinan dampak</h2>
              <p>{lesson.impact}</p>
            </section>
            <section className="callout">
              <h2>Pilihan langkah yang aman</h2>
              <p>{lesson.action}</p>
            </section>
            <div className="note note-warn" role="note" style={{ marginTop: 36 }}>
              <Info aria-hidden />
              <div>Materi ini bukan penilaian hukum, diagnosis, atau pengganti layanan profesional. Jika berada dalam bahaya langsung, cari tempat aman dan hubungi layanan darurat setempat.</div>
            </div>
            <nav className="article-nav" aria-label="Materi lain">
              <Link href={`/education/detail/${prev}`} className="btn btn-outline"><ArrowLeft aria-hidden /> Materi sebelumnya</Link>
              <Link href={`/education/detail/${next}`} className="btn btn-primary">Materi berikutnya <ArrowRight aria-hidden /></Link>
            </nav>
          </article>
          <aside className="article-aside" aria-label="Daftar materi">
            <h2>Semua materi</h2>
            {lessons.map((l) => (
              <Link key={l.id} href={`/education/detail/${l.id}`} aria-current={l.id === id ? "page" : undefined}>{l.title}</Link>
            ))}
          </aside>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

export function AboutPage() {
  return (
    <>
      <PublicHeader active="about" />
      <main id="isi" className="pub-wrap">
        <header className="page-top">
          <h1>Langkah awal yang lebih jelas. Pilihan tetap di tanganmu.</h1>
          <p>SISKA menyediakan ruang informasi dan penyampaian pengaduan yang lebih terarah, dengan perhatian pada privasi, keamanan, dan kendali pengguna. Kamu tidak perlu menceritakan seluruh pengalaman untuk mulai mencari informasi.</p>
        </header>
        <div className="principles">
          <article>
            <h2>Mendengar tanpa menghakimi</h2>
            <p>Pengalaman dan keputusanmu perlu dihormati. Informasi disampaikan dengan bahasa yang jelas dan tidak menyalahkan.</p>
          </article>
          <article>
            <h2>Menghormati pilihanmu</h2>
            <p>Kamu menentukan informasi yang dibagikan dan kapan ingin melanjutkan proses.</p>
          </article>
          <article>
            <h2>Membangun ruang dukungan</h2>
            <p>SISKA menghubungkan informasi layanan dan dukungan sesuai ketersediaan institusi.</p>
          </article>
        </div>

        <section className="band-top" aria-labelledby="pilihan">
          <h2 id="pilihan">Satu pintu masuk, beberapa pilihan</h2>
          <div className="principles" style={{ paddingTop: 24 }}>
            <article>
              <h2 style={{ fontSize: "1.25rem" }}>Belajar</h2>
              <p>Baca materi untuk memahami batas, persetujuan, dan pilihan dukungan.</p>
              <p style={{ marginTop: 12 }}><Link href="/education" className="link-teal">Jelajahi edukasi</Link></p>
            </article>
            <article>
              <h2 style={{ fontSize: "1.25rem" }}>Melapor</h2>
              <p>Sampaikan informasi awal lewat alur pelaporan yang terstruktur.</p>
              <p style={{ marginTop: 12 }}><Link href="/register" className="link-teal">Mulai pelaporan</Link></p>
            </article>
            <article>
              <h2 style={{ fontSize: "1.25rem" }}>Bertanya</h2>
              <p>Pakai informasi awal dari SISKA AI, atau hubungi petugas setelah masuk.</p>
              <p style={{ marginTop: 12 }}><Link href="/layanan" className="link-teal">Lihat layanan</Link></p>
            </article>
          </div>
        </section>

        <div className="note note-warn" role="note" style={{ marginTop: 56 }}>
          <Info aria-hidden />
          <div>
            <b>SISKA bukan saluran layanan darurat.</b>
            SISKA bukan pengganti layanan darurat, tenaga kesehatan, konselor, atau penasihat hukum. Informasi layanan, kontak resmi, dan prosedur institusi perlu diperbarui oleh pengelola. Baca{" "}
            <Link href="/register/terms" className="link-teal">syarat dan ketentuan</Link>.
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
