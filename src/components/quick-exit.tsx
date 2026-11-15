"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

const SAFE_URL = "https://www.google.com/";

/** Keluar dari situs seketika, tanpa meninggalkan halaman ini di riwayat tombol "kembali". */
function leave() {
  window.location.replace(SAFE_URL);
}

/**
 * Tombol "Keluar cepat" untuk pengguna yang mungkin sedang tidak aman membuka situs ini.
 * Juga bisa dipicu dengan menekan Esc tiga kali berturut-turut.
 */
export function QuickExit() {
  useEffect(() => {
    let presses = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      presses += 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { presses = 0; }, 1200);
      if (presses >= 3) leave();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <button
      type="button"
      className="quick-exit"
      onClick={leave}
      title="Tutup situs ini dan buka halaman lain. Pintasan: tekan Esc tiga kali."
    >
      <X aria-hidden />
      Keluar cepat
      <kbd aria-hidden>Esc ×3</kbd>
    </button>
  );
}
