import type { ExtractErrorKind, Result } from "../types.ts";

export const fail = <T>(kind: ExtractErrorKind, message: string): Result<T> => ({ ok: false, error: { kind, message } });
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const UA = "CustomerJourneyBot/0.1 (+store-to-3d preview; respects robots.txt)";

/** Fetch with timeout + classification of the common failure modes. */
export async function fetchClassified(
  fetcher: Fetcher,
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Result<Response>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "application/json,text/html;q=0.9", ...(init.headers ?? {}) },
      redirect: "follow",
    });
    if (res.status === 401) return fail("auth_required", `${url} requires authorization`);
    if (res.status === 403 || res.status === 429) return fail("blocked", `${url} refused access (${res.status})`);
    if (res.status === 404) return fail("not_found", `${url} not found`);
    if (!res.ok) return fail("network", `${url} responded ${res.status}`);
    return ok(res);
  } catch (e) {
    return fail("network", `${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

/** Minimal robots.txt check for the `*` user-agent group. Returns true when the path is allowed. */
export async function robotsAllows(fetcher: Fetcher, origin: string, path: string): Promise<boolean> {
  const r = await fetchClassified(fetcher, `${origin}/robots.txt`, {}, 4000);
  if (!r.ok) return true; // no robots.txt → allowed by convention
  const text = await r.value.text();
  let applies = false;
  const disallow: string[] = [];
  const allow: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") applies = val === "*" || /customerjourney/i.test(val);
    else if (applies && key === "disallow" && val) disallow.push(val);
    else if (applies && key === "allow" && val) allow.push(val);
  }
  const longest = (rules: string[]) => Math.max(-1, ...rules.filter((r) => path.startsWith(r.replace(/\*.*$/, ""))).map((r) => r.length));
  return longest(allow) >= longest(disallow);
}

export function parseStoreUrl(input: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (!u.hostname.includes(".")) return null;
    // Refuse private/loopback targets so the server can't be used to probe internal networks.
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/i.test(u.hostname)) return null;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}
