import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { loginUrl, wantsHtml } from "@/lib/app-origin";
import { requireActiveUser } from "@/lib/session";
import { ensureNoteFile } from "@/lib/note-files";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const gate = await requireActiveUser("Sign in to download notes");
  if (!gate.ok) {
    if (wantsHtml(request)) {
      return NextResponse.redirect(loginUrl(request, `/notes/${id}`));
    }
    return gate.response;
  }

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.status !== "PUBLISHED") {
    return jsonError("Note not found", 404);
  }

  const { file } = await ensureNoteFile(note);
  if (!file) {
    if (wantsHtml(request)) {
      return new NextResponse(
        "This file is currently unavailable. Please try again later.",
        { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    return jsonError("File missing", 404);
  }

  await prisma.note.update({
    where: { id },
    data: { downloads: { increment: 1 } },
  });

  const filename = note.title.replace(/[^\w\- ]+/g, "") || "note";

  return new Response(file.stream, {
    headers: {
      "Content-Type":
        file.contentType ??
        (note.fileType === "pdf"
          ? "application/pdf"
          : "application/octet-stream"),
      "Content-Disposition": `attachment; filename="${filename}.${note.fileType}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
