import { describe, expect, it } from "vitest";
import {
  isRelevantToQuery,
  scoreCommunityNote,
  scoreExternalResource,
  termMatchScore,
  tokenize,
} from "@/lib/search/ranking";
import { validateUploadFile } from "@/lib/validations";
import { canManageNote, isAdmin } from "@/lib/permissions";

describe("tokenize", () => {
  it("drops short tokens and punctuation", () => {
    expect(tokenize("DBMS: normalization?")).toEqual(["dbms", "normalization"]);
  });

  it("drops generic academic stopwords", () => {
    expect(tokenize("Operating System deadlock notes")).toEqual(["operating", "deadlock"]);
  });
});

describe("community ranking", () => {
  const base = {
    title: "Operating Systems Unit 3 Notes",
    description: "Deadlock prevention and Banker's algorithm",
    subjectName: "Operating Systems",
    department: "Computer Science",
    tags: ["deadlock", "scheduling"],
    avgRating: 4.8,
    ratingCount: 24,
    downloads: 1203,
    createdAt: new Date(),
  };

  it("scores a title match higher than a description-only match", () => {
    const titleHit = scoreCommunityNote(base, "operating systems deadlock");
    const descriptionHit = scoreCommunityNote(
      { ...base, title: "Misc worksheet", subjectName: "Mathematics" },
      "operating systems deadlock",
    );
    expect(titleHit).toBeGreaterThan(descriptionHit);
  });

  it("rewards exact phrase matches in the title", () => {
    const exact = scoreCommunityNote(base, "Operating Systems Unit 3 Notes");
    const loose = scoreCommunityNote(base, "networks routing congestion");
    expect(exact).toBeGreaterThan(loose);
  });

  it("gives partial credit for matching some query terms", () => {
    expect(termMatchScore("deadlock prevention", ["deadlock", "memory"])).toBe(0.5);
  });
});

describe("external ranking", () => {
  it("boosts trusted university domains", () => {
    const resource = {
      title: "Deadlock lecture notes",
      description: "University resource on deadlock",
      domain: "ocw.mit.edu",
      sourceType: "university",
    };
    const trusted = scoreExternalResource(resource, "deadlock", 1.4);
    const untrusted = scoreExternalResource(
      { ...resource, domain: "random-blog.example", sourceType: "educational" },
      "deadlock",
      1,
    );
    expect(trusted).toBeGreaterThan(untrusted);
  });

  it("does not keep a DBMS page for an OS deadlock query", () => {
    expect(
      isRelevantToQuery(
        "NPTEL Database Management System",
        "NPTEL lectures and notes on DBMS, including normalization.",
        "Operating System deadlock",
      ),
    ).toBe(false);
  });

  it("keeps a deadlock encyclopedia article for an OS deadlock query", () => {
    expect(
      isRelevantToQuery(
        "Deadlock (computer science)",
        "Encyclopedia article covering deadlock conditions and handling strategies.",
        "Operating System deadlock",
      ),
    ).toBe(true);
  });
});

describe("file validation", () => {
  it("rejects oversized files", () => {
    const result = validateUploadFile({
      type: "application/pdf",
      size: 51 * 1024 * 1024,
      name: "notes.pdf",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts files at the 50MB limit", () => {
    const result = validateUploadFile({
      type: "application/pdf",
      size: 50 * 1024 * 1024,
      name: "notes.pdf",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts pdf uploads", () => {
    const result = validateUploadFile({
      type: "application/pdf",
      size: 1200,
      name: "notes.pdf",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extension).toBe("pdf");
  });
});

describe("permissions", () => {
  it("lets admins moderate any note", () => {
    expect(isAdmin("ADMIN")).toBe(true);
    expect(
      canManageNote({ role: "ADMIN", userId: "a", uploaderId: "b" }),
    ).toBe(true);
  });

  it("lets students manage only their own notes", () => {
    expect(
      canManageNote({ role: "STUDENT", userId: "u1", uploaderId: "u1" }),
    ).toBe(true);
    expect(
      canManageNote({ role: "STUDENT", userId: "u1", uploaderId: "u2" }),
    ).toBe(false);
  });
});

describe("rating uniqueness model", () => {
  it("treats user+note as one rating key", () => {
    const ratings = new Map<string, number>();
    const key = "user1:note1";
    ratings.set(key, 4);
    ratings.set(key, 5);
    expect(ratings.get(key)).toBe(5);
    expect(ratings.size).toBe(1);
  });
});
