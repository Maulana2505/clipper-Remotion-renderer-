import StudioClient from "@/components/StudioClient";

export default async function StudioPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <StudioClient jobId={jobId} />;
}
