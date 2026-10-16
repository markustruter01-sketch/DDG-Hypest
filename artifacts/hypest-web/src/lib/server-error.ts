export function serverErrorText(err: unknown): string {
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
