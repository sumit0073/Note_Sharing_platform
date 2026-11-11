-- Existing notes are not eligible reservations: PENDING may be an admin restriction.
ALTER TABLE "Note" ADD COLUMN "uploadPending" BOOLEAN NOT NULL DEFAULT false;
