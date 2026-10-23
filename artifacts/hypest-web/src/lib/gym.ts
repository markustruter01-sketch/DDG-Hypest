import { useEffect, useState } from "react";

/**
 * Rest timer that keeps true time: it counts to a fixed end moment, so it stays right after the
 * phone locks or the app is switched (plain 1-second timers pause in the background).
 * Buzzes the phone (where supported) when rest is over.
 */
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!endsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt && left === 0) {
      navigator.vibrate?.([200, 100, 200]);
      setEndsAt(null);
    }
  }, [endsAt, left]);

  return {
    left,
    start: (seconds: number) => {
      setNow(Date.now());
      setEndsAt(seconds > 0 ? Date.now() + seconds * 1000 : null);
    },
    stop: () => setEndsAt(null),
  };
}

/** Keeps the screen on during a session (where the browser allows it); re-asks when the app comes back. */
export function useScreenAwake() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const ask = async () => {
      try {
        const next = await navigator.wakeLock?.request("screen");
        if (gone) void next?.release();
        else lock = next ?? null;
      } catch {
        // Not allowed (low battery, unsupported): the screen just sleeps as normal.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void ask();
    };
    void ask();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}
