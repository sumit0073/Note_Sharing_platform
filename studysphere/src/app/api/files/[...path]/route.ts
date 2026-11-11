import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { loginUrl, wantsHtml } from "@/lib/app-origin";
import { requireActiveUser } from "@/lib/session";
import { openStoredFile } from "@/lib/storage";
import { ensureNoteFile } from "@/lib/note-files";
import { NextResponse } from "next/server";

function fileMissingResponse(request: Request) {
  if (wantsHtml(request) || request.headers.get("sec-fetch-dest") === "iframe") {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#1c1915;background:#fffaf2">This file is currently unavailable.</body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  return jsonError("File not found", 404);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const gate = await requireActiveUser("Sign in to preview notes");
  if (!gate.ok) {
    if (wantsHtml(request)) {
      const next = new URL(request.url).pathname;
      return NextResponse.redirect(loginUrl(request, next));
    }
    return gate.response;
  }

  const { path: segments } = await context.params;
  const relative = segments.join("/");
  const noteId = segments[0];
  const note = await prisma.note.findFirst({
    where: { id: noteId, status: "PUBLISHED" },
  });
  if (!note) return fileMissingResponse(request);

  // Reject unrelated paths before any storage work.
  if (relative !== note.fileUrl) return fileMissingResponse(request);

  const ensured = await ensureNoteFile(note);

  if (!ensured.available) return fileMissingResponse(request);
  const file = await openStoredFile(ensured.relativePath);
  if (!file) return fileMissingResponse(request);

  try {
    return new Response(file.stream, {
      headers: {
        "Content-Type":
          file.contentType ??
          (note.fileType === "pdf" ? "application/pdf" : "application/octet-stream"),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    await file.stream.cancel().catch(() => {});
    throw error;
  }
}
