import { LiveAdminReportDetail } from "@/components/live-pages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <LiveAdminReportDetail id={id} />; }
