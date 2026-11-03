import { appIcon } from "@/lib/app-icon";
import { isManifestIconFile, MANIFEST_ICONS } from "@/lib/manifest";

/** The manifest's PNG icons, drawn at build time. */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams(): { file: string }[] {
  return Object.keys(MANIFEST_ICONS).map((file) => ({ file }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  if (!isManifestIconFile(file)) return new Response("Not found", { status: 404 });
  return appIcon(MANIFEST_ICONS[file].size, { maskable: MANIFEST_ICONS[file].maskable });
}
