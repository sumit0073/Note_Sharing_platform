import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findUniqueMock, protectedRead, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findUniqueMock: vi.fn(),
  protectedRead: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: findUniqueMock, findMany: protectedRead, count: protectedRead },
    note: { findMany: protectedRead, count: protectedRead },
    report: { findMany: protectedRead, count: protectedRead },
    searchEvent: { count: protectedRead },
    subject: { findMany: protectedRead },
    trustedDomain: { findMany: protectedRead },
  },
}));
vi.mock("@/lib/analytics", () => ({ getAdminAnalytics: protectedRead }));

import Overview from "@/app/admin/page";
import Users from "@/app/admin/users/page";
import Notes from "@/app/admin/notes/page";
import Reports from "@/app/admin/reports/page";
import Subjects from "@/app/admin/subjects/page";
import Sources from "@/app/admin/sources/page";
import Analytics from "@/app/admin/analytics/page";

const pages = [
  ["/admin", Overview],
  ["/admin/users", Users],
  ["/admin/notes", Notes],
  ["/admin/reports", Reports],
  ["/admin/subjects", Subjects],
  ["/admin/sources", Sources],
  ["/admin/analytics", Analytics],
] as const;

// Invoke pages directly: no layout or proxy runs to supply authorization.
describe.each(pages)("%s independent authorization", (path, page) => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMock.mockResolvedValue({ user: { id: "a1", role: "ADMIN", status: "ACTIVE" } });
    redirectMock.mockImplementation((url: string) => { throw new Error(`redirect:${url}`); });
    protectedRead.mockRejectedValue(new Error("protected read reached"));
  });

  it.each([
    ["demoted", { role: "STUDENT", status: "ACTIVE" }, "/dashboard"],
    ["suspended", { role: "ADMIN", status: "SUSPENDED" }, null],
    ["pending verification", { role: "ADMIN", status: "PENDING_VERIFICATION" }, null],
    ["deleted", null, null],
  ])("blocks a stale admin JWT when %s before any protected read", async (_, record, destination) => {
    findUniqueMock.mockResolvedValue(record && { id: "a1", ...record });
    await expect(page()).rejects.toThrow("redirect:");
    expect(redirectMock).toHaveBeenCalledWith(destination ?? `/login?next=${encodeURIComponent(path)}`);
    expect(findUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1" } }));
    expect(protectedRead).not.toHaveBeenCalled();
  });

  it("blocks an unauthenticated caller before any protected read", async () => {
    authMock.mockResolvedValue(null);
    await expect(page()).rejects.toThrow("redirect:");
    expect(redirectMock).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(path)}`);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(protectedRead).not.toHaveBeenCalled();
  });

  it("allows a current active administrator to reach the protected read", async () => {
    findUniqueMock.mockResolvedValue({ id: "a1", role: "ADMIN", status: "ACTIVE" });
    await expect(page()).rejects.toThrow("protected read reached");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(protectedRead).toHaveBeenCalled();
  });
});
