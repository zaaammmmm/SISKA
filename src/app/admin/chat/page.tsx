import { Suspense } from "react";
import { LiveAdminChatPage } from "@/components/live-pages";

export default function Page() {
  return (
    <Suspense fallback={<p className="help">Memuat percakapan…</p>}>
      <LiveAdminChatPage />
    </Suspense>
  );
}
