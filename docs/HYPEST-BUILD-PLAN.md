# Hypest build plan: from today's build to the coach in your pocket

Written by Fable 5.1, Tue 3 Nov 2026, from the audit "Hypest audit: business,
product and software". Owner: Markus. This file is the single plan; every
session (Fable or Opus) reads it first and ticks its step when done.

## How the two models split the work

| Who | Does | Never does |
|---|---|---|
| **Fable** | Writes each step's spec before it is built; reviews every PR that touches money, safety, AI prompts or the data model; makes product calls Markus delegates; runs the checks against the spec | Builds the feature it will review |
| **Opus** | Builds one step at a time on a branch with tests; opens the PR; fixes what Fable's review finds | Changes prices, safety rules or prompts without a spec; merges |
| **Markus** | Merges PRs, Replit Pull, `db push`, secrets, Stripe keys, publishes, decides prices | Hand-edits code |

Rules carried over from the trading platform: branch per step, tests in the
PR, Fable review before merge of anything in the "review" column, Markus
publishes, nothing is "done" until it runs on the published app.

Each step below has: **Who**, **Spec** (what "done" means), **Review**, and a
**Prompt** to paste into the right model. Steps inside a phase can run in
parallel on separate branches unless marked "after".

---

## Phase 1: Fix (target: 2 weeks) — gate: no P1 defects, CI covers cross-user access

### 1.1 Adaptive loads that survive exercise rotation
- **Who:** Opus. **Review:** Fable.
- **Spec:** target loads carry by exercise id, not slot. The next block keeps an exercise the member has logged loads for when the pattern allows; when it rotates, the new exercise starts from the library's swap relation with the same load if the swap is load-compatible, else none. `engine.check.ts` gains a case: build block 1, log loads on 3 exercises, build block 2, assert the loads appear.
- **Prompt (Opus):** "Read docs/HYPEST-BUILD-PLAN.md step 1.1. In artifacts/api-server/src/coaching/engine.ts and routes/coaching.ts, make target loads carry by exercise id across blocks as the spec says. Add the engine check. Branch `fix/loads-by-exercise`, PR for Fable review."

### 1.2 Safety words with word boundaries, resume with acknowledgement
- **Who:** Opus. **Review:** Fable (safety).
- **Spec:** `safety.ts` matches whole words or declared phrases, with an allow-list of exercise names ("chest press", "hip thrust"). Resume requires `{acknowledged: true, note}` and writes a `pain_events` row (member, area, note, exercise, created, resolved_at). Checks: "chest press felt great" does not pause; "chest pain" does; resume without acknowledgement is 400.
- **Prompt (Opus):** "Step 1.2 of docs/HYPEST-BUILD-PLAN.md: rewrite red-flag matching with word boundaries and an exercise-name allow-list, add pain_events, require acknowledgement on resume, add screening.check cases. Branch `fix/safety-words`."

### 1.3 Time zone per member
- **Who:** Opus. **Spec:** `users.timezone` (IANA, from the browser at signup, editable on Me). Greeting, daily line, chat day cap and reminders use it. No `+10` anywhere in the code (grep-tested).

### 1.4 Signup lands on the plan
- **Who:** Opus. **Spec:** pending answers go to the server before signup (anonymous draft keyed by a cookie), `?then=plan` honoured, new member lands on Today with the plan built or the offer card. Works in a new tab.

### 1.5 Player controls for the gym floor
- **Who:** Opus. **Review:** Fable (UX). **Spec:** 44 px steppers, tap the number for a keypad, plate math under the weight (bar 20 kg, plates 25/20/15/10/5/2.5/1.25 per side; configurable), audible beep at rest end, "End session?" confirmation.

### 1.6 Offline logging
- **Who:** Opus. **Spec:** a service worker (Workbox) caches the app shell; set logs go to an IndexedDB queue and sync when online; the UI shows "saved on this phone" vs "synced". `apple-mobile-web-app-capable` and `viewport-fit=cover` in index.html. Install prompt appears on Android Chrome.

### 1.7 Fail-closed dev login and rate limits
- **Who:** Opus. **Review:** Fable (security). **Spec:** the server refuses to start if `DEV_AUTO_LOGIN=1` and the host is not localhost; IP-based limits on login, signup and reset (e.g. 30/15 min); signup limited per IP per day; lockout by email needs IP agreement so a victim cannot be locked out by a stranger.

### 1.8 Delete the creator marketplace
- **Who:** Opus. **Review:** Fable. **Spec:** remove programs, lessons, purchases, commission routes, the eight web pages, `keepCents`, the Bio field; keep the tables (no destructive migration) but drop the code and tests; typecheck and `check-all.sh` green. One PR, nothing else in it.

### 1.9 Test gaps
- **Who:** Opus. **Spec:** cross-user attempts on `/me/items/*` and `/me/sessions/*` in `*.check.ts`; 4- and 6-day and 30-minute plans in `engine.check`; `validatePlan` rejecting a bad plan; credit consumption on `/me/plans/next`.

### 1.10 Markus
- Merge 1.1–1.9 as they pass review (1.1–1.3 merged as #29–#31; 1.4–1.9 are PR #32, reviewed and approved 4 Nov); Replit Pull; `pnpm --filter @workspace/db run push` (adds `users.timezone`, `pain_events`, `onboarding_drafts`, `auth_attempts`, `auth_failures.ip`); publish. Done 4 Nov (1.11 merged as #33). The phone test moved to the end-of-development checklist below (Markus, 4 Nov).

### 1.11 Hardening left over from Fable's review of #32
- **Who:** Opus. **Review:** Fable (security). **Spec:** (a) `PUT /onboarding/draft` goes through `allowIp` as a fourth kind, 60 per network per 15 min, with a check in `draft.check.ts`; (b) `outcomeOf(401)` is `retry`, not `drop`, with a case in `offline-queue.check.ts`; (c) a global per-email backstop in `login-rate-limit.ts`: 100 failures in 15 min across all networks → 429 for everyone and one `alert()`; the per-network 10 stays; `ip-limit.check.ts` covers it; (d) delete the dead marketplace CSS from App.css. One branch `phase-1b`, one PR.
- **Prompt (Opus):** "Do step 1.11 of docs/HYPEST-BUILD-PLAN.md on branch `phase-1b`, tests for each part, one PR. Then stop and tell me it's ready for Fable."

---

## Phase 2: The coach (target: 6 weeks) — gate: chat on, AI cost under US$1 per active member per month, allowances enforced

### 2.1 Spec: the coach agent, memory and allowances
- **Status (4 Nov):** written by Opus while Fable was out of usage, checked by an independent reviewer agent; Fable re-reads it before Phase 2 is called done. Markus approves §5 and §9.
- **Who:** Fable. Writes `docs/COACH-AGENT-SPEC.md`: the agent loop (one call per member action, tools, max 3 tool steps), the standing context and what is cached, `coach_memory` table and its lifecycle, the allowance table per tier, the per-member ledger and what happens at the limit (coach says so in voice; plan actions still work), the safety order (rules before model, output filter after), prompt files per coach, the eval set (30 scripted member situations with expected tool calls), and the cost model. Markus approves the allowances and prices.
- **Prompt (Fable):** "Read docs/HYPEST-BUILD-PLAN.md phase 2 and the audit. Write docs/COACH-AGENT-SPEC.md as step 2.1 describes, with every value fixed. Commit it to main."

### 2.2 Data model and ledger
- **Who:** Opus. **Review:** Fable. **Spec:** tables `coach_memory`, `allowances` (tier, kind, per_day, per_month), `ai_ledger_monthly` (member, month, cost, calls by kind), `pain_events` if not yet; `ai_usage` gets `kind` and `member_id` index; atomic budget check (one `UPDATE … WHERE spent + est <= cap RETURNING`). Account delete and export cover all of them.

### 2.3 The agent
- **Who:** Opus. **Review:** Fable (prompts, safety, cost). **Spec:** `coaching/agent.ts`: tools `build_block`, `swap_exercise`, `set_target_load`, `write_memory`, `schedule_checkin`; prompt caching on the standing context; the output filter from ai-notes applied to chat; retries with backoff; async for plan builds (job + poll) so a build never blocks 30 s. Eval set from 2.1 runs in `agent.check.ts` against a recorded fake model and, with a key, against the real one in a manual script.

### 2.4 Chat and Today on the agent
- **Who:** Opus. **Spec:** the Coach tab becomes a full-screen chat; "N of M today" shown; daily note on Today written by the agent from the record; the "why" line under a changed plan.

### 2.5 Weekly review
- **Who:** Opus. **Spec:** Sunday job per active member: one Sonnet call over the week's logs, pain events, check-ins; writes a memory summary and a message; adapts next week's targets through `set_target_load`; email until push exists.

### 2.6 Markus
- Add `ANTHROPIC_API_KEY` and `AI_MONTHLY_BUDGET_USD` secrets (start at $50); merge; `db push`; publish; use the coach for a week as a member. Fable reads the ledger and reports cost per member.

---

## Phase 3: The body (target: 4 weeks) — gate: free-to-paid conversion measured; day-30 retention over 10%

### 3.1 Spec: tiers, free logging, nutrition-lite, check-ins
- **Status (5 Nov):** `docs/TIERS-AND-BODY-SPEC.md` written by Opus while Fable was out, checked by an independent reviewer agent (16 findings applied). Markus approves §1–§3 by merging. Tiers set by Markus 5 Nov: Free (first week), Starter $4.99, Coaching $12.99 ("Best value", the one we push), Pro $19.99; yearly $34.99 / $79.99 / $119.99; AUD prices GST-inclusive.
- **Who:** Fable. `docs/TIERS-AND-BODY-SPEC.md`: free tier (one coach, logging, one free session before signup), Plans US$4.99, Coaching $12.99, Pro $19.99 with their allowances; nutrition-lite (targets from profile and goal with declared formulas, weekly meal plan and grocery list, meal logging by sentence or photo with Haiku estimates, explicit "estimates, not medical advice"); body metrics (weight, waist, optional photos stored private); morning check-in (sleep hours, energy, soreness); share image; referral credit. Markus approves prices.

### 3.2 Free logging and the free session
- **Who:** Opus. **Review:** Fable. **Spec:** logging and progress on every tier; anonymous visitor can finish one session in the player, then the finish card offers signup; conversion events recorded.

### 3.3 Nutrition-lite
- **Who:** Opus. **Review:** Fable (prompts, safety: no diets for screened conditions, no numbers below declared floors). Tables `nutrition_targets`, `meal_plans`, `meal_logs`.

### 3.3b Milestones and the long journey (Markus, 5 Nov 2026)
- **Who:** Opus. **Review:** Fable. **Spec:** a Journey view on Progress, built from the permanent records (set logs, plans, sessions; nothing is ever summarised away): first session and first weights, personal bests per lift (with dates), blocks finished, session counts (10, 50, 100, 250…), longest streak, and before/now per main lift. Derived on read, with a `milestones` cache table only if it gets slow. The coach's context keeps its fixed-size lifetime line (`coaching/block.ts` lifetimeSummary: started, best, recent best) so long-term members cost the same per message.

### 3.4 Body metrics and check-ins
- **Who:** Opus. Tables `body_metrics`, `morning_checkins` (Phase 2's `checkins` is the coach's scheduled messages); the agent reads them; readiness rule declared in the spec (poor sleep + high soreness lowers the day's dose, with the why).

### 3.5 Stripe live, new prices
- **Who:** Markus (keys), Opus (price table), Fable (review of the live checklist). Set `STRIPE_LIVE_APPROVED=yes` only after the checklist in PR #10 passes on test mode with the new prices.

### 3.6 Markus
- Merge, `db push`, publish, invite 20 real testers, read the weekly cost and retention report Fable prepares.

---

## Phase 4: The watch (target: quarter 2) — gate: store approval

### 4.1 Strava and Fitbit
- **Who:** Opus. **Spec:** OAuth connect on Me; nightly import of steps, resting HR, sleep, workouts into `health_samples` (member, source, kind, start, end, value, unit); the agent reads the last 7 days. Fable writes the field list first (only what the coach uses).

### 4.2 Native wrapper
- **Who:** Opus. **Review:** Fable. **Spec:** Capacitor around the existing web app; HealthKit and Health Connect read permissions for the same fields; push notifications for session reminders and the weekly review; store listings. Markus: Apple and Google developer accounts, review submissions.

### 4.3 Readiness and the coach on the watch data
- **Who:** Opus. **Spec:** the readiness rule from 3.4 extended with HR and sleep from devices; the Monday message mentions it.

---

## End-of-development checklist (Markus, on real devices, before launch)
Run these once Phases 2 and 3 are built. Each is a few minutes. Nothing is "launched" until all pass on the published app.
1. **Offline logging (from 1.10):** install the app on an Android phone (Chrome → "Install app"), and on an iPhone (Safari → Share → "Add to Home Screen"). Start a session, turn Wi-Fi and mobile data off, tick a set: it says "on phone". Turn data back on: within 30 s the label goes and the set is on the Progress page.
2. **Shared phone (from 1.11):** log a set offline as member A, log out, log in as member B: B doesn't see A's set. Log back in as A: it syncs.
3. **Network limits (from 1.7):** log in from your phone on mobile data and on home Wi-Fi: no "Too many tries" message. (If there is, set `TRUST_PROXY_HOPS=2`.)
4. **Rest beep (from 1.5):** on an iPhone with the ringer on, finish a set: the beep plays when rest ends.
5. Phase 2 and 3 items are added here as they are built.

**Emulated run, 12 Nov 2026 (Claude: local build, test database, Chromium phone emulation at 360 and 412 px):**
- Found and fixed: on 360–412 px phones the weight and reps steppers pushed the "Set done" tick off the card, so a set could not be ticked. Each set now stacks the two steppers with the tick beside them (`App.css` `.set`).
- 1 Offline logging: pass. Offline tick shows "on phone" and "1 set saved on this phone"; back online it synced well inside 30 s. Service worker registers. Not covered by the checklist: reopening a session with no signal shows no session (only the app shell is cached).
- 2 Shared phone: pass. A's offline set was never sent or shown while B was logged in; after A logged back in it uploaded and the label cleared.
- 4 Rest beep: pass in emulation (the two tones start when rest ends). Whether an iPhone plays it with the ringer on still needs the real phone.
- Still real-device only: install on Android and iPhone, network limits on mobile data vs Wi-Fi (item 3), iPhone beep.

## Standing rules for every step
1. Opus builds on a branch, with tests, and opens a PR that ends with what it checked and what it could not.
2. Fable reviews before merge anything touching money, safety, prompts, the schema, or auth.
3. Markus merges, pulls, pushes the schema, publishes, and holds every secret.
4. No feature is "done" until it has run on the published app with a real member account.
5. Every AI prompt lives in one file per coach, versioned, with its eval cases; prices and allowances live in one table, never in prose.
6. Cost per active member is read from the ledger weekly during phases 2 and 3; above US$1.50, the allowances come down before anything else is built.
