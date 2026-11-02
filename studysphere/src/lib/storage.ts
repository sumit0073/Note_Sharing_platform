import { randomBytes } from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { del, get, head, put } from "@vercel/blob";

const uploadRoot = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.UPLOAD_DIR ?? "uploads",
);

/**
 * Prefer Vercel Blob when Blob credentials/store are configured.
 * Local development keeps using UPLOAD_DIR / filesystem when Blob is unavailable.
 */
export function isBlobStorageEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export function getUploadRoot(): string {
  return uploadRoot;
}

export function buildNoteRelativePath(options: {
  noteId: string;
  originalName: string;
  extension: string;
}): string {
  const safeName = options.originalName.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const filename = `${Date.now()}-${randomBytes(6).toString("hex")}-${safeName || `notes.${options.extension}`}`;
  return `${options.noteId}/${filename}`;
}

function sanitizeRelativePath(relativePath: string): string | null {
  const normalized = path.posix
    .normalize(relativePath.replace(/\\/g, "/"))
    .replace(/^(\.\.(\/|$))+/, "");
  if (!normalized || normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

function resolveLocalAbsolute(relativePath: string): string | null {
  const safe = sanitizeRelativePath(relativePath);
  if (!safe) return null;
  const absolute = path.resolve(/* turbopackIgnore: true */ uploadRoot, safe);
  if (!absolute.startsWith(uploadRoot)) return null;
  return absolute;
}

/** @deprecated Prefer openStoredFile for Blob-compatible reads. */
export function resolveStoredFile(relativePath: string): string | null {
  return resolveLocalAbsolute(relativePath);
}

export async function saveNoteFile(options: {
  noteId: string;
  originalName: string;
  buffer: Buffer;
  extension: string;
}): Promise<{ relativePath: string }> {
  const relativePath = buildNoteRelativePath(options);
  const contentType =
    options.extension === "pdf"
      ? "application/pdf"
      : "application/octet-stream";

  return writeStoredFile(relativePath, options.buffer, contentType);
}

/** Write bytes at an exact relative path (Blob or local disk). */
export async function writeStoredFile(
  relativePath: string,
  buffer: Buffer,
  contentType = "application/pdf",
): Promise<{ relativePath: string }> {
  const safe = sanitizeRelativePath(relativePath);
  if (!safe) throw new Error("Invalid storage path");

  if (isBlobStorageEnabled()) {
    await put(safe, buffer, {
      access: "private",
      contentType,
      addRandomSuffix: false,
    });
    return { relativePath: safe };
  }

  const absolute = resolveLocalAbsolute(safe);
  if (!absolute) throw new Error("Invalid storage path");
  await mkdir(/* turbopackIgnore: true */ path.dirname(absolute), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ absolute, buffer);
  return { relativePath: safe };
}

export async function verifyStoredObject(
  relativePath: string,
): Promise<{ size: number; contentType?: string } | null> {
  const safe = sanitizeRelativePath(relativePath);
  if (!safe) return null;

  if (isBlobStorageEnabled()) {
    try {
      const meta = await head(safe);
      return { size: meta.size, contentType: meta.contentType };
    } catch {
      return null;
    }
  }

  const absolute = resolveLocalAbsolute(safe);
  if (!absolute) return null;
  try {
    const info = await stat(/* turbopackIgnore: true */ absolute);
    return { size: info.size };
  } catch {
    return null;
  }
}

export async function openStoredFile(
  relativePath: string,
): Promise<{ stream: ReadableStream; contentType?: string } | null> {
  const safe = sanitizeRelativePath(relativePath);
  if (!safe) return null;

  if (isBlobStorageEnabled()) {
    const result = await get(safe, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    return {
      stream: result.stream,
      contentType: result.blob.contentType,
    };
  }

  const absolute = resolveLocalAbsolute(safe);
  if (!absolute) return null;

  try {
    await stat(/* turbopackIgnore: true */ absolute);
  } catch {
    return null;
  }

  const nodeStream = createReadStream(/* turbopackIgnore: true */ absolute);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
  return { stream: webStream };
}

export async function deleteStoredFile(relativePath: string): Promise<void> {
  const safe = sanitizeRelativePath(relativePath);
  if (!safe) return;

  if (isBlobStorageEnabled()) {
    try {
      await del(safe);
    } catch {
      // Blob may already be gone
    }
    return;
  }

  const absolute = resolveLocalAbsolute(safe);
  if (!absolute) return;
  try {
    await unlink(/* turbopackIgnore: true */ absolute);
  } catch {
    // File may already be gone
  }
}
