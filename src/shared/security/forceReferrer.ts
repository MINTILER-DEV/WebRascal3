const TRACKER_TTL_MS = 60 * 60 * 1000;

type Tracker = {
  original: string;
  latest: string;
  site: string;
  policy: string;
  expiresAt: number;
};

const trackers = new Map<string, Tracker>();

export async function initializeTracker(url: string, _referrer: string, initialSite: string): Promise<void> {
  const key = normalize(url);
  trackers.set(key, {
    original: key,
    latest: key,
    site: initialSite,
    policy: "strict-origin-when-cross-origin",
    expiresAt: Date.now() + TRACKER_TTL_MS
  });
}

export async function updateTracker(originalUrl: string, redirectUrl: string, newReferrerPolicy: string): Promise<void> {
  const key = normalize(originalUrl);
  const tracker = trackers.get(key);
  if (!tracker) {
    return;
  }
  tracker.latest = normalize(redirectUrl);
  tracker.policy = newReferrerPolicy || tracker.policy;
  tracker.expiresAt = Date.now() + TRACKER_TTL_MS;
}

export async function getMostRestrictiveSite(url: string, currentSite: string): Promise<string> {
  const tracker = trackers.get(normalize(url));
  if (!tracker) {
    return currentSite;
  }
  return rankSite(tracker.site) > rankSite(currentSite) ? tracker.site : currentSite;
}

export async function storeReferrerPolicy(url: string, policy: string, _referrer: string): Promise<void> {
  const key = normalize(url);
  const tracker = trackers.get(key) || {
    original: key,
    latest: key,
    site: "cross-site",
    policy,
    expiresAt: Date.now() + TRACKER_TTL_MS
  };
  tracker.policy = policy;
  tracker.expiresAt = Date.now() + TRACKER_TTL_MS;
  trackers.set(key, tracker);
}

export async function cleanExpiredTrackers(): Promise<void> {
  const now = Date.now();
  for (const [key, tracker] of trackers.entries()) {
    if (tracker.expiresAt < now) {
      trackers.delete(key);
    }
  }
}

function normalize(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

function rankSite(site: string): number {
  switch (site) {
    case "none":
      return 3;
    case "same-origin":
      return 2;
    case "same-site":
      return 1;
    default:
      return 0;
  }
}