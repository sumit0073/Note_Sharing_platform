import { clamp } from "@/lib/utils";

export const COMMUNITY_WEIGHTS = {
  title: 0.4,
  subject: 0.2,
  tags: 0.15,
  description: 0.1,
  rating: 0.05,
  downloads: 0.05,
  recency: 0.05,
} as const;

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "of",
  "in",
  "to",
  "a",
  "an",
  "on",
  "vs",
  "system",
  "systems",
  "notes",
  "note",
  "unit",
  "lecture",
  "introduction",
  "course",
  "paper",
  "pdf",
]);

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function termMatchScore(text: string, terms: string[]): number {
  if (!text || terms.length === 0) return 0;
  const hits = terms.filter((term) => containsTerm(text, term)).length;
  return hits / terms.length;
}

export function phraseBonus(text: string, query: string): number {
  if (!text || !query.trim()) return 0;
  return text.toLowerCase().includes(query.toLowerCase().trim()) ? 0.15 : 0;
}

const WEAK_TERMS = new Set([
  "operating",
  "computer",
  "software",
  "science",
  "management",
  "data",
  "real",
  "time",
  "distributed",
  "modern",
  "principles",
  "parallel",
  "computing",
  "call",
  "unix",
  "engineering",
]);

/** Prefer specific tokens (deadlock) over generic ones (operating). */
export function distinctiveTerms(query: string): string[] {
  const terms = tokenize(query);
  const strong = terms.filter((term) => !WEAK_TERMS.has(term));
  return strong.length > 0 ? strong : terms;
}

/** How many distinctive query terms must appear for an external hit to be kept. */
export function minTermHits(terms: string[]): number {
  if (terms.length <= 2) return Math.min(1, terms.length);
  return Math.ceil(terms.length * 0.5);
}

export function termHitCount(text: string, terms: string[]): number {
  if (!text || terms.length === 0) return 0;
  return terms.filter((term) => containsTerm(text, term)).length;
}

/** Drop catalog/web hits that only share a generic word with the query. */
export function isRelevantToQuery(title: string, description: string, query: string): boolean {
  const terms = distinctiveTerms(query);
  if (terms.length === 0) return false;
  const haystack = `${title} ${description}`;
  if (phraseBonus(haystack, query) > 0) return true;
  return termHitCount(haystack, terms) >= minTermHits(terms);
}

export type CommunityNoteSignals = {
  title: string;
  description: string;
  subjectName: string;
  department?: string;
  tags: string[];
  avgRating: number;
  ratingCount: number;
  downloads: number;
  createdAt: Date;
};

export function scoreCommunityNote(
  note: CommunityNoteSignals,
  query: string,
  now: Date = new Date(),
): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;

  const title = termMatchScore(note.title, terms) + phraseBonus(note.title, query);
  const subject =
    termMatchScore(note.subjectName, terms) +
    termMatchScore(note.department ?? "", terms);
  const tags = termMatchScore(note.tags.join(" "), terms);
  const description = termMatchScore(note.description, terms);
  const rating =
    note.ratingCount === 0 ? 0.4 : clamp(note.avgRating / 5, 0, 1);
  const downloads = clamp(Math.log10(note.downloads + 1) / 4, 0, 1);
  const ageDays = (now.getTime() - note.createdAt.getTime()) / 86_400_000;
  const recency = clamp(1 - ageDays / 365, 0, 1);

  return (
    clamp(title, 0, 1) * COMMUNITY_WEIGHTS.title +
    clamp(subject, 0, 1) * COMMUNITY_WEIGHTS.subject +
    tags * COMMUNITY_WEIGHTS.tags +
    description * COMMUNITY_WEIGHTS.description +
    rating * COMMUNITY_WEIGHTS.rating +
    downloads * COMMUNITY_WEIGHTS.downloads +
    recency * COMMUNITY_WEIGHTS.recency
  );
}

export type ExternalSignals = {
  title: string;
  description: string;
  domain: string;
  sourceType: string;
};

export function scoreExternalResource(
  resource: ExternalSignals,
  query: string,
  trustedBoost = 1,
): number {
  const terms = tokenize(query);
  const keyword =
    termMatchScore(resource.title, terms) * 0.7 +
    termMatchScore(resource.description, terms) * 0.3 +
    phraseBonus(resource.title, query);

  if (keyword <= 0) return 0;

  const typeBoost =
    resource.sourceType === "university"
      ? 0.12
      : resource.sourceType === "documentation"
        ? 0.1
        : resource.sourceType === "oer"
          ? 0.08
          : 0.04;

  return clamp(keyword, 0, 1) * trustedBoost + typeBoost;
}

export function isLikelyEducationalDomain(domain: string): boolean {
  const host = domain.toLowerCase();
  return (
    host.endsWith(".edu") ||
    host.endsWith(".ac.in") ||
    host.endsWith(".ac.uk")
  );
}
