import { ShieldCheck } from "lucide-react";
import { FileItem, Note } from "@/components/ui";
import { SAMPLE_FILES, type Report } from "@/lib/demo-data";

const MONTHS: Record<string, string> = { Okt: "Oktober", Sep: "September", Agu: "Agustus" };
export function longDate(short: string) {
  const [d, m, y] = short.split(" ");
  return `${d.replace(/^0/, "")} ${MONTHS[m] ?? m} ${y}`;
}

/** Kartu "Informasi kejadian" — dipakai pada detail laporan pengguna dan admin. */
export function IncidentCard({ report }: { report: Report }) {
  const main = report.id === "SIS-2026-0142";
  return (
    <section className="card">
      <h2 className="card-title">Informasi kejadian</h2>
      <div className="kv-grid" style={{ marginTop: 17 }}>
        <div className="kv"><div className="k">Kategori</div><div className="v">{report.category}</div></div>
        <div className="kv"><div className="k">Tanggal &amp; waktu kejadian</div><div className="v">{main ? "11 Oktober 2026 • ±19.30" : `${longDate(report.date)} • ±19.30`}</div></div>
      </div>
      <hr className="divider" style={{ margin: "17px 0" }} />
      <div className="kv"><div className="k">Lokasi / media</div><div className="v">Ruang percakapan daring komunitas</div></div>
      <div className="sec-title" style={{ marginTop: 16 }}>Kronologi yang dibagikan</div>
      <p className="prose">Saya menerima pesan yang membuat saya tidak nyaman dalam kegiatan komunitas. Saya ingin mengetahui pilihan tindak lanjut dan pendampingan. Rincian tambahan akan saya sampaikan saat siap.</p>
      <hr className="divider" style={{ margin: "17px 0" }} />
      <div className="sec-title" style={{ margin: 0 }}>Bukti pendukung • 2 file ilustrasi</div>
      <div className="files-2">
        {SAMPLE_FILES.map((f) => <FileItem key={f.name} name={f.name} meta={f.meta} download doc />)}
      </div>
    </section>
  );
}

export function PrivacyNote({ title, children }: { title: string; children: React.ReactNode }) {
  return <Note title={title} icon={ShieldCheck}>{children}</Note>;
}
