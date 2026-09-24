import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest } from "next/server";

import { platformApiUrl } from "@/lib/platform-api";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { accessToken } = await withAuth({ ensureSignedIn: true });
  const { id, documentId } = await params;
  const version = request.nextUrl.searchParams.get("version") === "completed" ? "?version=completed" : "";
  const upstream = await fetch(`${platformApiUrl}/v1/envelopes/${id}/documents/${documentId}/download${version}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return new Response(upstream.status === 404 ? "Document not found" : "Unable to load document", {
      status: upstream.status,
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/pdf");
  const disposition = upstream.headers.get("Content-Disposition");
  if (disposition) {
    headers.set("Content-Disposition", disposition);
  }
  headers.set("Cache-Control", "private, no-store");

  return new Response(upstream.body, { status: 200, headers });
}
