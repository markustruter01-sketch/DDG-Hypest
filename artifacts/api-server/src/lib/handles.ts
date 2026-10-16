/** Link names nobody can claim, so no creator can pose as Hypest staff. */
const RESERVED = new Set(["hypest", "admin", "support", "help", "official", "team", "staff", "api"]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED.has(handle);
}
