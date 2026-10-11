const MESSAGE = "media_ref must be an https URL on youtube.com or youtu.be";

function isYoutubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".youtu.be")
  );
}

/** When media_source is youtube, media_ref must be an https URL on youtube.com or youtu.be. */
export function youtubeUrlError(
  mediaSource: string | null | undefined,
  mediaRef: string | null | undefined,
): string | null {
  if (mediaSource == null) {
    return null;
  }
  if (mediaSource !== "youtube" || mediaRef == null || mediaRef === "") {
    return MESSAGE;
  }

  let url: URL;
  try {
    url = new URL(mediaRef);
  } catch {
    return MESSAGE;
  }

  if (url.protocol !== "https:" || !isYoutubeHost(url.hostname)) {
    return MESSAGE;
  }

  return null;
}
