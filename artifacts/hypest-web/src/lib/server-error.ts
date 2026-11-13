/** Said when a request never reached the server (no signal in the gym, or the server is unreachable). */
export const NO_SIGNAL_TEXT = "No connection. Try again when you have signal.";

/** True when the request failed before any answer came back: fetch rejects with a TypeError, or the phone is offline. */
export function isNoSignal(err: unknown): boolean {
  if (errorStatus(err) !== undefined) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError && !err.message.startsWith("customFetch");
}

export function serverErrorText(err: unknown): string {
  if (isNoSignal(err)) return NO_SIGNAL_TEXT;
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim() !== "") {
        return message;
      }
    }
  }

  if (err instanceof Error && err.message.trim() !== "") {
    return err.message;
  }

  return "Request failed";
}

export function errorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
  }
  return undefined;
}
