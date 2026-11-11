import { Suspense } from "react";
import { LiveHistoryPage } from "@/components/live-pages";

export default function Page() {
  return (
    <Suspense fallback={<p className="help">Memuat laporan…</p>}>
      <LiveHistoryPage admin />
    </Suspense>
  );
}
