# StudySphere → Vercel migration notes

Implementation status: **code-ready**. Do **not** deploy until Neon + Blob + env vars are configured manually.

## Architecture changes

| Area | Local | Production (Vercel) |
| --- | --- | --- |
| Database | PostgreSQL via `DATABASE_URL` / `DIRECT_URL` | Neon PostgreSQL |
| Files | `UPLOAD_DIR` filesystem (`./uploads`) | Private Vercel Blob |
| Auth | Auth.js Credentials + JWT + Turnstile | Same |
| Bot protection | Cloudflare Turnstile (Siteverify server-side) | Same |
| Email | Link returned in response (no send) | Resend (`RESEND_API_KEY` + `EMAIL_FROM`) |
| Rate limits | In-memory Map | Same (best-effort on serverless) |

## Database

- Prisma provider: `postgresql`
- Initial migration: `prisma/migrations/20260309120000_init/migration.sql`
- Apply separately (not in the Vercel build):

```bash
npx prisma migrate deploy
```

Do **not** run `npx prisma db seed` against production: it deletes every row before
inserting demo data, and it is gated to refuse when `NODE_ENV=production`. Bootstrap the
first admin with the non-destructive script instead:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run db:create-admin
```

- `prisma/dev.db` (old SQLite) is intentionally left in place as a backup. Do not delete it; do not point Prisma at it.

## File storage

- `src/lib/storage.ts` selects Blob when `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` is set; otherwise uses `UPLOAD_DIR`.
- DB stores only the pathname/key in `Note.fileUrl` (e.g. `{noteId}/{filename}`).
- **Production uploads (Blob enabled):** browser → authenticated `POST /api/notes/prepare` (metadata only) → direct private Blob upload via `upload()` + `POST /api/blob/upload` token route → `POST /api/notes/[id]/finalize`. PDF bytes do **not** pass through the Vercel function body. Max file size: **50 MB** (`MAX_FILE_SIZE`), with multipart client uploads for large files.
- **Local uploads:** browser FormData → `POST /api/notes` → filesystem under `UPLOAD_DIR`.
- Preview: `GET /api/files/[...path]` (auth required) streams via Blob `get(..., { access: "private" })` or local FS.
- Download: `GET /api/notes/[id]/download` (auth required) same path.
- Delete removes the Blob/object when a note is removed.
- Permanent public Blob URLs are never returned to clients.

## Build

```json
"postinstall": "prisma generate",
"build": "prisma generate && next build"
```

`prisma migrate deploy` is **not** part of the Vercel build.

Root layout uses `dynamic = "force-dynamic"` so pages that query Prisma are not statically prerendered at build time without a database.

## Environment variables

See `.env.example` for the full list.

Required for production:

- `DATABASE_URL` (Neon pooled)
- `DIRECT_URL` (Neon direct / non-pooler)
- `AUTH_SECRET`
- `AUTH_URL` (`https://www.studysphere.space` — never `http://localhost:3000`)
- `BLOB_READ_WRITE_TOKEN` and/or connected Blob store (`BLOB_STORE_ID`)
- `RESEND_API_KEY`
- `EMAIL_FROM` (address on a domain verified in Resend)
- Also ensure `AUTH_URL` is the real production origin — verification and reset
  emails embed links built from it.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile
  on login / register / forgot / reset; allow hostnames `localhost`,
  `studysphere.space`, `www.studysphere.space`)

Optional: `BRAVE_SEARCH_API_KEY`, `UPLOAD_DIR` (local only).

## What you configure in Neon

1. Create a Neon project + database.
2. Copy the **pooled** connection string → `DATABASE_URL`.
3. Copy the **direct** connection string → `DIRECT_URL`.
4. From your machine: `npx prisma migrate deploy`, then `npm run db:create-admin` with
   `ADMIN_EMAIL` / `ADMIN_PASSWORD` set for that single run. Do not seed production.

## What you configure in Vercel

1. Import the GitHub repo; set Root Directory to `studysphere` if needed.
2. Add env vars from `.env.example`.
3. Create a **Private** Blob store and connect it to the project.
4. Deploy when ready (not done by this migration PR/work).

## Remaining blockers

1. ~~**Email provider**~~ — done: Resend via `RESEND_API_KEY` + `EMAIL_FROM`. Both must be set in Vercel, and the `EMAIL_FROM` domain must be verified in Resend, or verification / reset links will not be delivered.
2. **In-memory rate limiter** — not shared across serverless instances.
3. **Manual Neon + Blob + migrate deploy** — required before first production deploy.
4. **Local Postgres** — local `npm run dev` / seed now need PostgreSQL; SQLite is backup-only.
5. **Abandoned PENDING notes** — if a user starts a Blob upload and never finishes, a `PENDING` note reservation may remain until cleaned up (admin can remove).

## Auth

Unchanged: Credentials provider, JWT sessions, bcryptjs, STUDENT/ADMIN roles, existing authorization checks.
