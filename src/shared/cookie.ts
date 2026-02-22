import * as setCookieParser from "set-cookie-parser";

type CookieRecord = {
  domain: string;
  path: string;
  name: string;
  value: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expires?: number;
};

export class CookieStore {
  private map = new Map<string, CookieRecord>();

  setCookies(strings: string[], url: URL): void {
    const parsed = setCookieParser.parse(strings, { map: false });
    for (const cookie of parsed) {
      const domain = normalizeDomain(cookie.domain || url.hostname);
      const path = cookie.path || "/";
      const name = cookie.name;
      const key = `${domain}@${path}@${name}`;
      this.map.set(key, {
        domain,
        path,
        name,
        value: cookie.value,
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
        sameSite: cookie.sameSite,
        expires: cookie.expires?.getTime()
      });
    }
  }

  getCookies(url: URL, fromJs = false): string {
    const now = Date.now();
    const pairs: string[] = [];

    for (const cookie of this.map.values()) {
      if (cookie.expires && cookie.expires < now) {
        continue;
      }
      if (!domainMatch(url.hostname, cookie.domain)) {
        continue;
      }
      if (!url.pathname.startsWith(cookie.path)) {
        continue;
      }
      if (cookie.secure && url.protocol !== "https:") {
        continue;
      }
      if (fromJs && cookie.httpOnly) {
        continue;
      }
      pairs.push(`${cookie.name}=${cookie.value}`);
    }

    return pairs.join("; ");
  }

  load(jsonString: string): void {
    const arr = JSON.parse(jsonString) as CookieRecord[];
    this.map.clear();
    for (const cookie of arr) {
      this.map.set(`${cookie.domain}@${cookie.path}@${cookie.name}`, cookie);
    }
  }

  dump(): string {
    return JSON.stringify(Array.from(this.map.values()));
  }
}

function normalizeDomain(domain: string): string {
  return domain.replace(/^\./, "").toLowerCase();
}

function domainMatch(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}