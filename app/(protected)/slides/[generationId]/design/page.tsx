import { DesignEditor } from "@/components/design-editor";

export default async function PresentationDesignPage({ params }: { params: Promise<{ generationId: string }> }) {
  const { generationId } = await params;
  return <DesignEditor generationId={generationId} />;
}
