// Data ilustrasi untuk seluruh halaman demo SISKA.
// Ganti dengan data Firestore saat integrasi backend dikerjakan.

export type Status = "Menunggu verifikasi" | "Diproses" | "Selesai";

export const statusClass: Record<Status, string> = {
  "Menunggu verifikasi": "pill-amber",
  Diproses: "pill-teal",
  Selesai: "pill-gray",
};

export type Report = { id: string; date: string; summary: string; category: string; status: Status };

const r = (id: string, date: string, summary: string, category: string, status: Status): Report => ({
  id: `SIS-2026-${id}`, date, summary, category, status,
});

const head: Report[] = [
  r("0142", "12 Okt 2026", "Permohonan tindak lanjut pesan tidak nyaman", "Pelecehan melalui pesan", "Menunggu verifikasi"),
  r("0138", "08 Okt 2026", "Permintaan informasi pendampingan", "Informasi dan dukungan", "Diproses"),
  r("0124", "01 Okt 2026", "Konsultasi pilihan tindak lanjut", "Informasi dan dukungan", "Selesai"),
  r("0117", "26 Sep 2026", "Informasi dukungan layanan", "Informasi dan dukungan", "Selesai"),
  r("0109", "20 Sep 2026", "Permintaan panduan pelaporan", "Informasi dan dukungan", "Selesai"),
];

/** 12 laporan milik pengguna demo (1 menunggu · 1 diproses · 10 selesai). */
export const userReports: Report[] = [
  ...head,
  r("0101", "15 Sep 2026", "Klarifikasi alur pelaporan", "Informasi dan dukungan", "Selesai"),
  r("0096", "09 Sep 2026", "Permintaan jadwal pendampingan", "Informasi dan dukungan", "Selesai"),
  r("0088", "02 Sep 2026", "Informasi akses layanan konseling", "Informasi dan dukungan", "Selesai"),
  r("0079", "27 Agu 2026", "Konsultasi privasi lampiran", "Informasi dan dukungan", "Selesai"),
  r("0071", "21 Agu 2026", "Permintaan salinan ringkasan", "Informasi dan dukungan", "Selesai"),
  r("0064", "14 Agu 2026", "Pertanyaan tahapan verifikasi", "Informasi dan dukungan", "Selesai"),
  r("0052", "06 Agu 2026", "Permintaan informasi awal layanan", "Informasi dan dukungan", "Selesai"),
];

/** 24 laporan untuk admin (6 menunggu · 8 diproses · 10 selesai). */
export const adminReports: Report[] = [
  ...head,
  r("0141", "11 Okt 2026", "Permintaan peninjauan lampiran", "Pelecehan melalui pesan", "Menunggu verifikasi"),
  r("0140", "11 Okt 2026", "Konsultasi pilihan pendampingan", "Informasi dan dukungan", "Menunggu verifikasi"),
  r("0139", "10 Okt 2026", "Permohonan informasi tindak lanjut", "Informasi dan dukungan", "Menunggu verifikasi"),
  r("0137", "08 Okt 2026", "Klarifikasi tahapan verifikasi", "Informasi dan dukungan", "Menunggu verifikasi"),
  r("0136", "07 Okt 2026", "Permintaan jadwal bertemu petugas", "Informasi dan dukungan", "Menunggu verifikasi"),
  r("0135", "07 Okt 2026", "Informasi layanan pendampingan", "Informasi dan dukungan", "Diproses"),
  r("0133", "06 Okt 2026", "Tindak lanjut laporan komunitas daring", "Pelecehan melalui pesan", "Diproses"),
  r("0131", "05 Okt 2026", "Permintaan koordinasi dengan petugas", "Informasi dan dukungan", "Diproses"),
  r("0129", "04 Okt 2026", "Konsultasi alur pelaporan lanjutan", "Informasi dan dukungan", "Diproses"),
  r("0127", "03 Okt 2026", "Pendampingan tahap awal", "Informasi dan dukungan", "Diproses"),
  r("0126", "02 Okt 2026", "Permintaan informasi layanan", "Informasi dan dukungan", "Diproses"),
  r("0125", "02 Okt 2026", "Peninjauan catatan tindak lanjut", "Informasi dan dukungan", "Diproses"),
  r("0101", "15 Sep 2026", "Klarifikasi alur pelaporan", "Informasi dan dukungan", "Selesai"),
  r("0096", "09 Sep 2026", "Permintaan jadwal pendampingan", "Informasi dan dukungan", "Selesai"),
  r("0088", "02 Sep 2026", "Informasi akses layanan konseling", "Informasi dan dukungan", "Selesai"),
  r("0079", "27 Agu 2026", "Konsultasi privasi lampiran", "Informasi dan dukungan", "Selesai"),
  r("0071", "21 Agu 2026", "Permintaan salinan ringkasan", "Informasi dan dukungan", "Selesai"),
  r("0064", "14 Agu 2026", "Pertanyaan tahapan verifikasi", "Informasi dan dukungan", "Selesai"),
  r("0052", "06 Agu 2026", "Permintaan informasi awal layanan", "Informasi dan dukungan", "Selesai"),
];

export function findReport(id: string): Report {
  return [...adminReports, ...userReports].find((x) => x.id === id) ?? head[0];
}

export const statusSteps: Status[] = ["Menunggu verifikasi", "Diproses", "Selesai"];

/** Tahapan laporan: dibuat → menunggu verifikasi → diproses → selesai. */
export function timeline(status: Status, createdDate = "12 Okt 2026", updated?: string) {
  const reached = statusSteps.indexOf(status) + 1; // jumlah tahap status yang sudah tercapai
  const steps = [
    { title: "Laporan dibuat", done: true, note: `${createdDate} • 09.15` },
    { title: "Menunggu verifikasi", done: reached >= 1, note: reached >= 1 ? `${createdDate} • 09.15` : "Belum dimulai" },
    { title: "Diproses", done: reached >= 2, note: reached >= 2 ? updated ?? `${createdDate} • 10.30` : "Belum dimulai" },
    { title: "Selesai", done: reached >= 3, note: reached >= 3 ? updated ?? `${createdDate} • 10.30` : "Belum dimulai" },
  ];
  return steps;
}

export const DEMO_NOW = "15 Oktober 2026, 10.30";
export const DEMO_NOW_SHORT = "15 Okt 2026 • 10.30";

export type Conversation = {
  id: string; title: string; time: string; line1: string; line2: string; badge?: string; kind: "direct" | "ai";
};

export const userConversations: Conversation[] = [
  { id: "c1", title: "SIS-2026-0142", time: "10.24", line1: "Petugas SISKA • A", line2: "Pilihan dukungan tersedia", kind: "direct" },
  { id: "c2", title: "Informasi layanan", time: "10.24", line1: "Chat langsung", line2: "Panduan layanan", kind: "direct" },
];

export const adminConversations: Conversation[] = [
  { id: "a1", title: "SIS-2026-0142", time: "10.24", line1: "Dialihkan dari SISKA AI", line2: "Pilihan dukungan tersedia", badge: "2 baru", kind: "ai" },
  { id: "a2", title: "Informasi layanan", time: "10.24", line1: "Chat langsung", line2: "Panduan layanan", badge: "1 baru", kind: "direct" },
];

export const eduItems = [
  { id: "e1", icon: "heart", tag: "Persetujuan", title: "Memahami persetujuan", body: "Persetujuan harus bebas, jelas, dan dapat ditarik kembali. Diam atau tekanan bukan persetujuan.", meta: "4 menit baca • materi ilustrasi", guide: false },
  { id: "e2", icon: "alert", tag: "Mengenali dampak", title: "Saat sesuatu terasa tidak nyaman", body: "Pesan, komentar, atau perilaku yang tidak diinginkan dapat melanggar batas. Perasaanmu layak didengar.", meta: "5 menit baca • materi ilustrasi", guide: false },
  { id: "e3", icon: "users", tag: "Dukungan", title: "Mencari pendampingan", body: "Pertimbangkan orang tepercaya dan petugas layanan. Kamu dapat bertanya tentang pilihan dukungan sebelum memutuskan.", meta: "4 menit baca • materi ilustrasi", guide: true },
  { id: "e4", icon: "shield", tag: "Privasi", title: "Menjaga informasi pribadi", body: "Bagikan seperlunya. Hindari mengunggah identitas pihak lain atau password; periksa lampiran sebelum dibagikan.", meta: "3 menit baca • materi ilustrasi", guide: true },
] as const;

export const SAMPLE_FILES = [
  { name: "bukti-pesan-demo.pdf", meta: "PDF • 248 KB • data ilustrasi" },
  { name: "catatan-demo.txt", meta: "TXT • 2 KB • data ilustrasi" },
];
