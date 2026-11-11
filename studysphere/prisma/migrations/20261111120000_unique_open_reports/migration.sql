BEGIN;

-- Prevent writes between reconciling existing duplicates and adding the index.
LOCK TABLE "Report" IN SHARE ROW EXCLUSIVE MODE;

-- Preserve every report, keeping the oldest open report for each account/note.
WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "userId", "noteId" ORDER BY "createdAt", "id"
    ) AS position
    FROM "Report"
    WHERE "status" = 'OPEN'
)
UPDATE "Report"
SET "status" = 'REJECTED', "reviewedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE "Report"."id" = ranked."id" AND ranked.position > 1;

CREATE UNIQUE INDEX "Report_userId_noteId_open_key"
ON "Report" ("userId", "noteId") WHERE "status" = 'OPEN';

COMMIT;
