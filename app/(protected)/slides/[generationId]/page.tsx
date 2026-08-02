import { SlideEditor } from "@/components/slide-editor";

export default async function PresentationEditorPage({ params }: { params: Promise<{ generationId: string }> }) {
  const { generationId } = await params;
  return <SlideEditor generationId={generationId} />;
}
