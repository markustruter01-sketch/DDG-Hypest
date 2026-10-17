// Draws the AI coach heads as SVG files in public/img (coach-<id>.svg).
// Obviously-AI on purpose: a volt bot head per coach. The shape matches the sport and the eyes give the personality.
// Run: node artifacts/hypest-web/scripts/coach-faces.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INK = "#111111";
const VOLT = "#d4ff3f";
const DARK = "#0e0e0e";

const out = (id) => fileURLToPath(new URL(`../public/img/coach-${id}.svg`, import.meta.url));
const fill = `fill="${VOLT}" stroke="${VOLT}" stroke-linejoin="round"`;
const line = (w = 16) => `fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

const COACHES = {
  // Yoga: round and calm, eyes closed.
  mara: {
    head: `<circle cx="300" cy="330" r="168" ${fill}/>`,
    eyes: `<path d="M228 316 Q250 338 272 316" ${line()}/><path d="M328 316 Q350 338 372 316" ${line()}/>`,
    blink: false,
  },
  // Strength: a solid block, flat focused eyes.
  rex: {
    head: `<rect x="130" y="172" width="340" height="316" rx="58" ${fill}/>`,
    eyes: `<rect x="222" y="306" width="56" height="18" rx="6" fill="${INK}"/><rect x="322" y="306" width="56" height="18" rx="6" fill="${INK}"/>`,
  },
  // Cross training: a hex like a hex dumbbell, happy eyes.
  jade: {
    head: `<polygon points="458,330 379,193 221,193 142,330 221,467 379,467" stroke-width="44" ${fill}/>`,
    eyes: `<path d="M228 326 L250 302 L272 326" ${line()}/><path d="M328 326 L350 302 L372 326" ${line()}/>`,
  },
  // Endurance: leaning forward like it's moving, round eyes.
  kip: {
    head: `<rect x="172" y="146" width="256" height="368" rx="128" transform="rotate(12 300 330)" ${fill}/>`,
    eyes: `<circle cx="262" cy="316" r="22" fill="${INK}"/><circle cx="358" cy="316" r="22" fill="${INK}"/>`,
  },
  // Athletic: a shield, sharp eyes.
  ace: {
    head: `<polygon points="300,166 452,262 418,470 182,470 148,262" stroke-width="44" ${fill}/>`,
    eyes: `<path d="M226 300 L274 322" ${line(18)}/><path d="M374 300 L326 322" ${line(18)}/>`,
  },
  // Pilates: a balanced diamond, tall focused eyes.
  ivy: {
    head: `<rect x="165" y="195" width="270" height="270" rx="60" transform="rotate(45 300 330)" ${fill}/>`,
    eyes: `<rect x="250" y="292" width="20" height="48" rx="10" fill="${INK}"/><rect x="330" y="292" width="20" height="48" rx="10" fill="${INK}"/>`,
  },
};

function svg(id, c) {
  const name = id[0].toUpperCase() + id.slice(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <title>${name}, Hypest AI coach</title>
  <style>
    .eyes { transform-origin: 300px 316px; }
    .ping { transform-origin: 300px 100px; }
    @media (prefers-reduced-motion: no-preference) {
      .blink { animation: blink 5s infinite; }
      .ping { animation: ping 2.4s ease-in-out infinite; }
    }
    @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
    @keyframes ping { 50% { transform: scale(1.4); opacity: 0.6; } }
  </style>
  <rect width="600" height="750" fill="${DARK}"/>
  <path d="M300 160 L300 112" fill="none" stroke="${VOLT}" stroke-width="12" stroke-linecap="round"/>
  <circle class="ping" cx="300" cy="100" r="16" fill="${VOLT}"/>
  ${c.head}
  <g class="${c.blink === false ? "eyes" : "eyes blink"}">${c.eyes}</g>
</svg>
`;
}

for (const [id, c] of Object.entries(COACHES)) writeFileSync(out(id), svg(id, c));
console.log("wrote", Object.keys(COACHES).map((id) => `coach-${id}.svg`).join(", "));
