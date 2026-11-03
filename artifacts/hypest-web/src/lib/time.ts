/** The member's own clock (build plan 1.3). The phone's time zone is the member's; nothing here assumes Brisbane. */

/** The browser's IANA time zone, e.g. "America/New_York". */
export function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Calendar day number (days since 1970-01-01) on this device's clock: changes at the member's midnight. */
export function localDayNumber(now = new Date()): number {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** Every time zone this browser knows, for the picker on Me. */
export function allTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}
