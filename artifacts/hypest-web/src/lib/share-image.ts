/**
 * The share image (docs/TIERS-AND-BODY-SPEC.md §9): drawn in the browser as a 1080 × 1350 PNG and handed to the share
 * sheet, or downloaded where sharing a file isn't available. Nothing is uploaded.
 */
export const COACH_COLOR: Record<string, string> = {
  rex: "#ff6b3d", jade: "#2fbf8f", mara: "#7a5cff", kip: "#ffb020", ivy: "#ff4f9a", ace: "#2f8fff",
};
const W = 1080, H = 1350;

export type ShareCard = { coachId: string; coachName: string; kicker: string; title: string; lines: string[]; firstName?: string | null };

export async function drawShareImage(c: ShareCard): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const accent = COACH_COLOR[c.coachId] ?? "#d4ff3f";
  g.fillStyle = "#111111";
  g.fillRect(0, 0, W, H);
  g.fillStyle = accent;
  g.fillRect(0, 0, W, 24);
  g.fillRect(80, 360, 160, 12);
  g.fillStyle = "#ffffff";
  g.font = "600 40px system-ui, sans-serif";
  g.fillText(c.kicker.toUpperCase(), 80, 300);
  g.font = "800 150px system-ui, sans-serif";
  const words = c.title.split(" ");
  let y = 560, line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > W - 160 && line) { g.fillText(line, 80, y); y += 160; line = w; } else line = test;
  }
  g.fillText(line, 80, y);
  g.font = "500 52px system-ui, sans-serif";
  g.fillStyle = "#e8e8e8";
  y += 140;
  for (const l of c.lines.slice(0, 5)) { g.fillText(l, 80, y); y += 76; }
  g.fillStyle = accent;
  g.font = "700 46px system-ui, sans-serif";
  g.fillText(c.firstName ? `${c.firstName} · with ${c.coachName}` : `with ${c.coachName}`, 80, H - 170);
  g.fillStyle = "#ffffff";
  g.font = "800 56px system-ui, sans-serif";
  g.fillText("HYPEST", 80, H - 90);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}

/** Share sheet with the file where the browser can, else a download. Returns what happened. */
export async function shareImage(blob: Blob, name = "hypest.png"): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Hypest" });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
