import { prisma } from "@/lib/db";
import { extractDomain } from "@/lib/utils";
import {
  isLikelyEducationalDomain,
  isRelevantToQuery,
  scoreExternalResource,
} from "@/lib/search/ranking";

export type NormalizedResource = {
  id?: string;
  title: string;
  description: string;
  url: string;
  domain: string;
  source: string;
  sourceType: string;
  thumbnail?: string | null;
  relevance: number;
};

type Trusted = { domain: string; boost: number };

function classifySource(domain: string): string {
  if (isLikelyEducationalDomain(domain)) return "university";
  if (
    domain.includes("wikipedia.org") ||
    domain.includes("khanacademy.org") ||
    domain.includes("nptel.ac.in") ||
    domain.includes("ocw.mit.edu")
  ) {
    return "oer";
  }
  if (
    domain.includes("docs.") ||
    domain.includes("developer.") ||
    domain.includes("learn.microsoft.com")
  ) {
    return "documentation";
  }
  return "educational";
}

function boostFor(domain: string, trusted: Trusted[]): number {
  const host = domain.toLowerCase();
  const exact = trusted.find((item) => host === item.domain || host.endsWith(`.${item.domain}`));
  if (exact) return exact.boost;
  if (isLikelyEducationalDomain(host)) return 1.2;
  return 1;
}

async function searchCatalog(
  query: string,
  trusted: Trusted[],
): Promise<NormalizedResource[]> {
  const catalog = await prisma.externalResource.findMany();
  return catalog
    .map((item) => {
      const relevance = scoreExternalResource(
        {
          title: item.title,
          description: item.description,
          domain: item.domain,
          sourceType: item.sourceType,
        },
        query,
        boostFor(item.domain, trusted),
      );
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        url: item.url,
        domain: item.domain,
        source: item.domain,
        sourceType: item.sourceType,
        thumbnail: item.thumbnail,
        relevance,
      };
    })
    .filter(
      (item) =>
        isRelevantToQuery(item.title, item.description, query) && item.relevance >= 0.2,
    );
}

async function searchWikipedia(query: string, trusted: Trusted[]): Promise<NormalizedResource[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=5`;
  const response = await fetch(url, {
    headers: { "User-Agent": "StudySphere/1.0 (academic resource discovery)" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    query?: { search?: Array<{ title: string; snippet: string; pageid: number }> };
  };
  return (data.query?.search ?? []).map((item) => {
    const domain = "en.wikipedia.org";
    const description = item.snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
    return {
      title: item.title,
      description,
      url: pageUrl,
      domain,
      source: "Wikipedia",
      sourceType: "oer",
      relevance: scoreExternalResource(
        { title: item.title, description, domain, sourceType: "oer" },
        query,
        boostFor(domain, trusted),
      ),
    };
  });
}

async function searchOpenLibrary(query: string, trusted: Trusted[]): Promise<NormalizedResource[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=4`;
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    docs?: Array<{ title: string; author_name?: string[]; key: string; first_publish_year?: number }>;
  };
  return (data.docs ?? []).map((doc) => {
    const domain = "openlibrary.org";
    const description = [doc.author_name?.[0], doc.first_publish_year]
      .filter(Boolean)
      .join(" · ");
    const pageUrl = `https://openlibrary.org${doc.key}`;
    return {
      title: doc.title,
      description: description || "Open Library educational text",
      url: pageUrl,
      domain,
      source: "Open Library",
      sourceType: "oer",
      relevance: scoreExternalResource(
        { title: doc.title, description, domain, sourceType: "oer" },
        query,
        boostFor(domain, trusted),
      ),
    };
  });
}

async function searchBrave(query: string, trusted: Trusted[]): Promise<NormalizedResource[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
    {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key,
      },
    },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as {
    web?: { results?: Array<{ title: string; url: string; description?: string }> };
  };
  return (data.web?.results ?? []).map((item) => {
    const domain = extractDomain(item.url);
    const sourceType = classifySource(domain);
    return {
      title: item.title,
      description: item.description ?? "",
      url: item.url,
      domain,
      source: domain,
      sourceType,
      relevance: scoreExternalResource(
        {
          title: item.title,
          description: item.description ?? "",
          domain,
          sourceType,
        },
        query,
        boostFor(domain, trusted),
      ),
    };
  });
}

export async function searchExternalResources(
  query: string,
): Promise<NormalizedResource[]> {
  const trustedRows = await prisma.trustedDomain.findMany({
    where: { enabled: true },
  });
  const trusted = trustedRows.map((row) => ({ domain: row.domain, boost: row.boost }));

  const settled = await Promise.allSettled([
    searchCatalog(query, trusted),
    searchWikipedia(query, trusted),
    searchOpenLibrary(query, trusted),
    searchBrave(query, trusted),
  ]);

  const combined: NormalizedResource[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") combined.push(...result.value);
  }

  const seen = new Set<string>();
  const unique = combined.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  unique.sort((a, b) => b.relevance - a.relevance);
  return unique
    .filter(
      (item) =>
        isRelevantToQuery(item.title, item.description, query) && item.relevance >= 0.25,
    )
    .slice(0, 12);
}
