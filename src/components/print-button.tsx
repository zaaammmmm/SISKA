"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button className="btn btn-outline" onClick={() => window.print()}>
      <Printer aria-hidden /> Cetak Dokumen
    </button>
  );
}
