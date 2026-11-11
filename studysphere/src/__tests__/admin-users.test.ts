import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), requireAdminUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { update: mocks.update } } }));
vi.mock("@/lib/session", () => ({ requireAdminUser: mocks.requireAdminUser }));

import { PATCH } from "@/app/api/admin/users/route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin user updates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ ok: true });
  });

  it.each([{}, { status: "SUSPENDED" }, { role: "ADMIN" }])(
    "excludes credential material from the response for %j",
    async (changes) => {
      const record = {
        id: "target", name: "Student", email: "student@example.test",
        role: "STUDENT", status: "ACTIVE", department: null, semester: null,
        bio: null, emailVerified: null, createdAt: new Date(0), updatedAt: new Date(0),
        passwordHash: "synthetic-password-verifier",
        ...changes,
      };
      // Model Prisma's scalar projection; an absent select returns every scalar.
      mocks.update.mockImplementation(async ({ select }) => select
        ? Object.fromEntries(Object.entries(record).filter(([key]) => select[key]))
        : record);

      const response = await PATCH(request({ id: "target", ...changes }));
      const body = await response.json();
      expect(response.status).toBe(200);
      const { passwordHash, ...safeRecord } = record;
      expect(body).toEqual({ ok: true, data: JSON.parse(JSON.stringify(safeRecord)) });
      expect(JSON.stringify(body)).not.toContain(passwordHash);
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "target" }, data: changes,
        select: expect.objectContaining({ id: true, role: true, status: true }),
      }));
    },
  );

  it("does not update a user when the admin guard denies access", async () => {
    mocks.requireAdminUser.mockResolvedValue({ ok: false, response: Response.json({ ok: false }, { status: 403 }) });
    expect((await PATCH(request({ id: "target" }))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects invalid updates before accessing the target", async () => {
    expect((await PATCH(request({ id: "target", role: "INVALID" }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
