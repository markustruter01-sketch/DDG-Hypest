// Warning-word checks (build plan 1.2). Pure: no database, no API.
// Run from repo root: pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/coaching/safety.check.ts
import assert from "node:assert/strict";
import { redFlag } from "./safety";

let n = 0;
const stops = (text: string, word: string) => { assert.equal(redFlag(text), word, `"${text}" should stop on "${word}"`); n += 1; };
const passes = (text: string) => { assert.equal(redFlag(text), null, `"${text}" should not stop`); n += 1; };

// Training talk that used to pause a plan
passes("chest press felt great");
passes("Band chest press was easy today");
passes("chest day done, popular gym, sharpened my form");
passes("my heart rate got up nicely");
passes("my back feels tight");
passes("knee aches a bit");
passes("stabilised well on the balance work");

// Symptoms still stop, in their usual forms
stops("sharp pain in my knee", "sharp");
stops("chest pain after chest press", "chest");
stops("my chest feels tight", "chest");
stops("felt my knee pop", "pop");
stops("something popped in my shoulder", "pop");
stops("my fingers went numb", "numb");
stops("numbness down my arm", "numb");
stops("tingling in my hand", "tingl");
stops("I got dizzy on the bike", "dizzy");
stops("nearly fainted", "faint");
stops("I can’t breathe properly", "can't breathe");
stops("my ankle is swelling up", "swelling");
stops("ankle is swollen", "swollen");
stops("my vision went funny", "vision");
stops("bad headache since the session", "headache");
stops("can't bear weight on it", "can't bear weight");

console.log(`safety: ${n} checks passed`);
