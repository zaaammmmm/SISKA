import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SISKA — Sistem Informasi Pengaduan Kekerasan Seksual",
  description: "Sarana pengaduan yang terstruktur dan menjaga kerahasiaan informasi.",
  icons: {
    // Aplikasi berjalan pada basePath /siska; URL ikon harus menyertakan prefix tersebut.
    icon: [{ url: "/siska/siska.png", type: "image/png" }],
    shortcut: [{ url: "/siska/siska.png", type: "image/png" }],
    apple: [{ url: "/siska/siska.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
