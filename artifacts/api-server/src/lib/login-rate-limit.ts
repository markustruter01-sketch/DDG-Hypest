const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const failures = new Map<string, number[]>();

function recentFailures(email: string): number[] {
  const now = Date.now();
  const kept = (failures.get(email) ?? []).filter((at) => now - at < WINDOW_MS);
  if (kept.length === 0) {
    failures.delete(email);
  } else {
    failures.set(email, kept);
  }
  return kept;
}

export function isLoginRateLimited(email: string): boolean {
  return recentFailures(email).length >= MAX_FAILURES;
}

export function recordLoginFailure(email: string): void {
  const kept = recentFailures(email);
  kept.push(Date.now());
  failures.set(email, kept);
}

export function clearLoginFailures(email: string): void {
  failures.delete(email);
}
