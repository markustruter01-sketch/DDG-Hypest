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
      beep(); // iPhones ignore vibrate: a short tone they can hear (build plan 1.5)
      setEndsAt(null);
    }
  }, [endsAt, left]);

  return {
    left,
    start: (seconds: number) => {
      unlockAudio(); // the tap that starts rest is the user gesture iOS needs before it plays sound
      setNow(Date.now());
      setEndsAt(seconds > 0 ? Date.now() + seconds * 1000 : null);
    },
    stop: () => setEndsAt(null),
  };
}

let audio: AudioContext | null = null;

/** Create (or resume) the audio context inside a tap, so the end-of-rest beep may play later. */
export function unlockAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // No audio: the vibration (where supported) and the on-screen timer still work.
  }
}

/** Two short tones: rest is over. Silent if audio was never unlocked or the phone is muted. */
export function beep(): void {
  if (!audio) return;
  try {
    const t = audio.currentTime;
    for (const [at, freq] of [[0, 880], [0.25, 1175]] as const) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.3, t + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + at);
      osc.stop(t + at + 0.2);
    }
  } catch {
    // ignore: sound is a nicety
  }
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
