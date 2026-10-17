// Draws the five AI coach heads as SVG files in public/img (coach-<id>.svg).
// One shared head; each coach differs by hair/headwear, eyes, brows and mouth.
// Run: node artifacts/hypest-web/scripts/coach-faces.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INK = "#111111";
const VOLT = "#d4ff3f";
const DARK = "#0e0e0e";
const FACE = "#f4f4f2";
const SHADE = "#e3e3de";
const SHIRT = "#1f1f1f";

const out = (id) => fileURLToPath(new URL(`../public/img/coach-${id}.svg`, import.meta.url));

// Open eyes that blink. Narrow = more focused look.
const eyes = (h = 34, y = 305) => `
  <g class="eyes">
    <rect x="245" y="${y}" width="26" height="${h}" rx="13" fill="${INK}"/>
    <rect x="329" y="${y}" width="26" height="${h}" rx="13" fill="${INK}"/>
    <circle cx="263" cy="${y + 9}" r="5" fill="${VOLT}"/>
    <circle cx="347" cy="${y + 9}" r="5" fill="${VOLT}"/>
  </g>`;
const line = (d, w = 7) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const COACHES = {
  // Yoga: top bun with a volt band, calm closed eyes, soft smile.
  mara: {
    back: `<path d="M192 300 C178 400 186 480 214 500 L386 500 C414 480 422 400 408 300 Z" fill="${INK}"/>`,
    hair: `<circle cx="300" cy="160" r="44" fill="${INK}"/>
      <path d="M192 318 C188 222 238 184 300 184 C362 184 412 222 408 318 C386 256 346 236 300 240 C254 236 214 256 192 318 Z" fill="${INK}"/>
      <rect x="268" y="190" width="64" height="12" rx="6" fill="${VOLT}"/>`,
    face: `${line("M243 322 Q258 336 273 322")}${line("M327 322 Q342 336 357 322")}
      ${line("M244 290 Q258 282 272 288", 6)}${line("M328 288 Q342 282 356 290", 6)}
      ${line("M278 390 Q300 406 322 390", 6)}`,
  },
  // Strength: flat-top crew cut, short beard, heavy straight brows, flat mouth.
  rex: {
    wide: true,
    hair: `<path d="M186 302 L188 226 C196 192 238 178 300 178 C362 178 404 192 412 226 L414 302 C400 262 380 248 300 246 C220 248 200 262 186 302 Z" fill="${INK}"/>
      <path d="M190 352 C194 432 246 456 300 456 C354 456 406 432 410 352 C392 404 352 420 300 420 C248 420 208 404 190 352 Z" fill="${INK}"/>`,
    face: `${eyes(26, 310)}
      <rect x="236" y="284" width="44" height="12" rx="4" fill="${INK}"/>
      <rect x="320" y="284" width="44" height="12" rx="4" fill="${INK}"/>
      ${line("M280 394 L320 394")}`,
  },
  // Cross training: high ponytail with a volt tie, raised brows, big open grin.
  jade: {
    hair: `<path d="M326 196 C392 112 486 140 476 246 C470 306 438 336 424 372 C442 296 430 212 356 214 Z" fill="${INK}"/>
      <path d="M192 304 C188 214 240 182 300 182 C360 182 412 214 408 304 C394 250 350 228 300 228 C250 228 206 250 192 304 Z" fill="${INK}"/>
      <ellipse cx="338" cy="196" rx="18" ry="13" fill="${VOLT}" stroke="${INK}" stroke-width="4"/>`,
    face: `${eyes()}
      ${line("M242 288 Q258 274 274 284", 6)}${line("M326 284 Q342 274 358 288", 6)}
      <path d="M270 382 Q300 426 330 382 Z" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`,
  },
  // Endurance: running cap with a volt brim, easy smile.
  kip: {
    hair: `<path d="M192 300 L192 334 L206 324 L206 296 Z" fill="${INK}"/><path d="M408 300 L408 334 L394 324 L394 296 Z" fill="${INK}"/>
      <path d="M188 290 C186 204 238 172 300 172 C362 172 414 204 412 290 Z" fill="${INK}"/>
      <path d="M232 214 C262 196 338 196 368 214" fill="none" stroke="${VOLT}" stroke-width="8" stroke-linecap="round"/>
      <path d="M186 286 C246 266 372 266 476 300 C446 314 366 306 300 302 C252 300 216 302 186 304 Z" fill="${VOLT}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
    face: `${eyes(32, 318)}
      ${line("M276 392 Q300 410 324 392", 6)}`,
  },
  // Athletic: short fade with a volt sweatband, angled brows, smirk.
  ace: {
    hair: `<path d="M192 296 C190 208 240 178 300 178 C360 178 410 208 408 296 Z" fill="${INK}"/>
      <path d="M196 252 C260 238 340 238 404 252 L408 284 C340 270 260 270 192 284 Z" fill="${VOLT}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
    face: `${eyes(28, 312)}
      <path d="M234 294 L280 282 L281 293 L236 304 Z" fill="${INK}"/>
      <path d="M366 294 L320 282 L319 293 L364 304 Z" fill="${INK}"/>
      ${line("M280 396 Q306 404 324 386", 6)}`,
  },
};

function svg(id, c) {
  const rx = c.wide ? 116 : 108;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <title>${id[0].toUpperCase() + id.slice(1)}, Hypest AI coach</title>
  <style>
    .eyes { transform-origin: 300px 322px; }
    .bud { transform-origin: 412px 338px; }
    @media (prefers-reduced-motion: no-preference) {
      .eyes { animation: blink 5s infinite; }
      .bud { animation: glow 2.4s ease-in-out infinite; }
    }
    @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
    @keyframes glow { 50% { transform: scale(1.35); opacity: 0.7; } }
  </style>
  <rect width="600" height="750" fill="${DARK}"/>
  <circle cx="300" cy="330" r="228" fill="${VOLT}"/>
  ${c.back ?? ""}
  <path d="M56 750 C66 590 160 506 300 500 C440 506 534 590 544 750 Z" fill="${SHIRT}"/>
  <path d="M${300 - (c.wide ? 58 : 46)} 400 L${300 - (c.wide ? 58 : 46)} 492 Q300 532 ${300 + (c.wide ? 58 : 46)} 492 L${300 + (c.wide ? 58 : 46)} 400 Z" fill="${SHADE}"/>
  ${line("M240 508 Q300 556 360 508", 8).replace(INK, VOLT)}
  <ellipse cx="${300 - rx + 6}" cy="332" rx="16" ry="26" fill="${SHADE}"/>
  <ellipse cx="${300 + rx - 6}" cy="332" rx="16" ry="26" fill="${SHADE}"/>
  <ellipse cx="300" cy="320" rx="${rx}" ry="130" fill="${FACE}"/>
  <path d="M300 190 A${rx} 130 0 0 1 300 450 A${rx - 22} 130 0 0 0 300 190 Z" fill="${SHADE}" opacity="0.7"/>
  ${c.hair}
  ${line("M300 322 Q290 350 302 358", 5).replace(INK, "#c4c4be")}
  ${c.face}
  <circle class="bud" cx="${300 + rx + 2}" cy="338" r="10" fill="${VOLT}" stroke="${INK}" stroke-width="4"/>
</svg>
`;
}

for (const [id, c] of Object.entries(COACHES)) writeFileSync(out(id), svg(id, c));
console.log("wrote", Object.keys(COACHES).map((id) => `coach-${id}.svg`).join(", "));
