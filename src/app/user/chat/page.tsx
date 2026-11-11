import { Suspense } from "react";
import { LiveUserChatPage } from "@/components/live-pages";

export default function Page() {
  return (
    <Suspense fallback={<p className="help">Memuat percakapan…</p>}>
      <LiveUserChatPage />
    </Suspense>
  );
}
