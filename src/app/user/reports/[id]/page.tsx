import { UserReportDetail } from "@/components/user-pages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserReportDetail id={id} />;
}
