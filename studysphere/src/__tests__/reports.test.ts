import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  active: vi.fn(), admin: vi.fn(), note: vi.fn(), existing: vi.fn(),
  create: vi.fn(), find: vi.fn(), update: vi.fn(), remove: vi.fn(), suspend: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireActiveUser: mocks.active, requireAdminUser: mocks.admin }));
vi.mock("@/lib/db", () => ({ prisma: {
  note: { findUnique: mocks.note },
  report: { findFirst: mocks.existing, create: mocks.create, findUnique: mocks.find },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({
    report: { update: mocks.update }, note: { update: mocks.remove }, user: { update: mocks.suspend },
  }),
} }));
import { POST } from "@/app/api/notes/[id]/report/route";
import { PATCH } from "@/app/api/admin/reports/route";
import { REPORT_REASONS } from "@/lib/constants";

const conflict = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
  code: "P2002", clientVersion: "6.19.3", meta: { target: ["userId", "noteId"] },
});
const submit = () => POST(new Request("http://localhost/api/notes/n/report", {
  method: "POST", body: JSON.stringify({ reason: REPORT_REASONS[0] }),
}), { params: Promise.resolve({ id: "n" }) });
const moderate = () => PATCH(new Request("http://localhost/api/admin/reports", {
  method: "PATCH", body: JSON.stringify({ id: "r", status: "OPEN", removeNote: true, suspendUser: true }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.active.mockResolvedValue({ ok: true, user: { id: "u" } });
  mocks.admin.mockResolvedValue({ ok: true, user: { id: "admin" } });
  mocks.note.mockResolvedValue({ id: "n", status: "PUBLISHED" });
  mocks.existing.mockResolvedValue(null);
  mocks.find.mockResolvedValue({ id: "r", noteId: "n", note: { uploaderId: "author" } });
});

describe("report uniqueness conflicts", () => {
  it("handles a losing insert after the duplicate lookup passed", async () => {
    mocks.create.mockRejectedValue(conflict());
    const response = await submit();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "You already have an open report for this note" });
  });
  it("still creates a report normally", async () => {
    mocks.create.mockResolvedValue({ id: "new" });
    expect((await submit()).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: { noteId: "n", userId: "u", reason: REPORT_REASONS[0], details: undefined } });
  });
  it("keeps the existing duplicate response", async () => {
    mocks.existing.mockResolvedValue({ id: "open" });
    expect((await submit()).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects conflicting reopenings before moderation side effects", async () => {
    mocks.update.mockRejectedValue(conflict());
    const response = await moderate();
    expect(response.status).toBe(409);
    expect((await response.json()).ok).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.suspend).not.toHaveBeenCalled();
  });
  it("preserves successful moderation", async () => {
    mocks.update.mockResolvedValue({ id: "r", status: "OPEN" });
    expect((await moderate()).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.suspend).toHaveBeenCalled();
  });
  it("propagates unrelated database failures", async () => {
    const failure = new Error("Database unavailable");
    mocks.create.mockRejectedValue(failure);
    await expect(submit()).rejects.toBe(failure);
    mocks.update.mockRejectedValue(failure);
    await expect(moderate()).rejects.toBe(failure);
  });
});
