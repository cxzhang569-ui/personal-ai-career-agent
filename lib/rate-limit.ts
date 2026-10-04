const requests = new Map<string, { count: number; reset: number }>();
const WINDOW = 10 * 60 * 1000;

// Best-effort per-process limit; use a shared store for a public high-traffic deployment.
export function allowRequest(key: string, now = Date.now()): boolean {
  for (const [ip, value] of requests) if (value.reset <= now) requests.delete(ip);
  const current = requests.get(key);
  if (current) { if (current.count >= 30) return false; current.count++; return true; }
  if (requests.size >= 1000) return false;
  requests.set(key, { count: 1, reset: now + WINDOW }); return true;
}
