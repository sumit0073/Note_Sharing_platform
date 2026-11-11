import { isLikelyEducationalDomain } from "@/lib/search/ranking";

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Source identity always comes from the destination, including for legacy rows. */
export function externalSource(url: string) {
  try {
    const destination = new URL(url);
    if (!["http:", "https:"].includes(destination.protocol) || !destination.hostname) {
      return null;
    }
    const domain = destination.hostname.toLowerCase().replace(/\.$/, "");
    let sourceType = "educational";
    if (isLikelyEducationalDomain(domain)) {
      sourceType = "university";
    } else if (["wikipedia.org", "khanacademy.org", "nptel.ac.in", "ocw.mit.edu", "openlibrary.org"]
      .some((trusted) => matchesDomain(domain, trusted))) {
      sourceType = "oer";
    } else if (domain.startsWith("docs.") || domain.startsWith("developer.") ||
      matchesDomain(domain, "learn.microsoft.com")) {
      sourceType = "documentation";
    }
    return { domain, sourceType };
  } catch {
    return null;
  }
}

export function normalizeExternalResource<T extends { url: string }>(resource: T) {
  const source = externalSource(resource.url);
  return source ? { ...resource, ...source } : null;
}
