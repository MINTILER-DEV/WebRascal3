export async function getSiteDirective(meta: URL, referrerURL: URL | null): Promise<string> {
  if (!referrerURL) {
    return "none";
  }
  if (meta.origin === referrerURL.origin) {
    return "same-origin";
  }
  if (await isSameSite(meta, referrerURL)) {
    return "same-site";
  }
  return "cross-site";
}

export async function isSameSite(url1: URL, url2: URL): Promise<boolean> {
  const d1 = getRegistrableDomain(url1.hostname);
  const d2 = getRegistrableDomain(url2.hostname);
  return d1 === d2;
}

function getRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  if (parts.length <= 2) {
    return hostname.toLowerCase();
  }
  return parts.slice(-2).join(".");
}