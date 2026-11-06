import { EducationDetailPage } from "@/components/public-pages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EducationDetailPage id={id} />;
}
