# Tiers and body spec (build plan step 3.1)

Written by Opus 5.5 on 5 Nov 2026, standing in for Fable. An independent reviewer agent checks it before Markus
approves. Fable re-reads it before Phase 3 is called done. **Markus approves §1 (tiers and prices) and §2 (allowances)
before step 3.2 starts.** Every value here is fixed. A change to any of them is a change to this file, in its own PR.

Builds on Phase 2 (`docs/COACH-AGENT-SPEC.md`): allowances, the ledger, the output filter and the agent.

**Not built in Phase 3 without keys:**
- Real payments: Stripe live is step 3.5.
- AI calls: they run against the fake model in checks, and switch on with `ANTHROPIC_API_KEY`.

Everything else ships and works now.

## 1. Tiers and prices (Markus to approve)

| Tier (`memberships.kind`) | Price (US$) | What it is |
|---|---|---|
| **Free** (no membership) | 0 | One coach, the first week of their plan, set logging, Progress and Journey, the morning check-in, body metrics, one free session before signup |
| **Plans** (`tier1`) | 4.99 / month | Everything in Free, plus a new 4-week block every 4 weeks, the coach's notes, 3 chats a day, Today's note, check-ins, and nutrition targets (formula only) |
| **Coaching** (`tier2`) | 12.99 / month | Everything in Plans, plus adaptive loads, swaps, 20 chats a day, the Sunday review, meal logging by sentence, and a weekly meal plan with a grocery list |
| **Pro** (`tier3`, new) | 24.99 / month | Everything in Coaching, plus 40 chats a day, meal logging by photo, 2 extra meal-plan rebuilds a week, and progress photos |

**Changes from today:**
- One-off plans (`intro_plan` $2.50 and `plan` $4.99) are **retired for new purchases**. Unused credits keep working, and
  the code paths stay for them.
- Logging and Progress move from Coaching-only to **every tier, Free included** (build plan 3.2).
- Prices live only in `coaching/access.ts` `PRICES`, as today. Stripe test-mode prices are created by step 3.5; until
  then checkout keeps working in test mode with the new amounts.
- No real subscribers exist yet (Stripe is not live), so there is nothing to grandfather.

**What Free can build:** the rules build the member's whole first block, but only **week 1 is open**. Weeks 2 to 4 show
locked, with the offer card. Free members can log, finish and repeat week 1 sessions as often as they like.

## 2. Allowances (Markus to approve)

These are rows in the `allowances` table, with the same rules as Phase 2 §5. New kinds are `meal_log` (Haiku) and
`meal_plan` (Sonnet). `tier3` rows are added. The **member cap is now per tier**, in a new `allowances` kind
`cap_micro_usd` whose `per_month` column holds micro-US$. It replaces the single $1.50 constant.

| Kind | Free | Plans | Coaching | Pro |
|---|---|---|---|---|
| `chat` | 0 | 3 / day, 60 / month | 20 / day, 300 / month | 40 / day, 600 / month |
| `daily_note` | 0 | 1 / day, 31 / month | 1 / day, 31 / month | 1 / day, 31 / month |
| `plan_notes` | 1 / month | 3 / month | 3 / month | 3 / month |
| `weekly_review` | 0 | 0 | 1 / day, 5 / month | 1 / day, 5 / month |
| `checkin` | 0 | 2 / day, 8 / month | 2 / day, 8 / month | 2 / day, 8 / month |
| `meal_log` | 0 | 0 | 5 / day, 100 / month | 10 / day, 200 / month |
| `meal_plan` | 0 | 0 | 1 / day, 5 / month | 3 / day, 15 / month |
| **member cap** | $0.10 | $0.50 | $1.50 | $3.00 |

Pro chat tools are the same as Coaching's.

## 3. Cost model (Markus to approve the caps)

Prices are as in Phase 2 §2. Haiku vision: a meal photo is about 1,500 input tokens.

| Kind | Tokens per call, in / out | Cost per call |
|---|---|---|
| Meal log, sentence (Haiku) | 1,200 / 200 | $0.00022 |
| Meal log, photo (Haiku) | 2,700 / 200 | $0.00037 |
| Meal plan and grocery list (Sonnet, one call) | 3,000 / 3,000 | $0.036 |

**Worst case per member per month** (every allowance used to the limit):

| Tier | Worst case | Margin after Stripe's fee |
|---|---|---|
| Free | $0.02 | n/a |
| Plans | $0.22 | $4.99 nets $4.55, so AI is 5% |
| Coaching | $1.16 (Phase 2) + $0.02 meal logs + $0.18 meal plans = **$1.36** | $12.99 nets $12.31, so AI is 11% |
| Pro | $1.38 chat + $0.014 notes + $0.063 plan notes + $0.38 reviews + $0.004 check-ins + $0.07 photo logs + $0.54 meal plans (15) = **$2.45** | $24.99 nets $23.97, so AI is 10% |

**Typical:** Coaching about $0.55, Pro about $0.90.

The build plan's red line (cut allowances when the weekly cost per active member passes $1.50) is now **per tier**:
50% of the tier's cap.

## 4. Free logging and the free session (step 3.2)

- **Logging for every tier.** `canLog` becomes "has a plan". Progress becomes free.
  - Adaptive loads at the next block stay Coaching (`nextLoads` runs only for tier2/tier3).
  - "This hurts" swaps stay Coaching. The safety stop stays on every tier.
- **Free week 1.**
  - A Free member's `POST /me/plans` builds block 1 without a credit, at most once per account. The plan gets
    `access: "week1"`.
  - Sessions in weeks 2 to 4 refuse to open or log for Free members (402 "Part of Plans"), and the plan view shows them
    locked.
  - **Upgrading:** when a Free member pays, the same block opens in full; it is not rebuilt.
- **The free session before signup.**
  - On the onboarding result, a visitor can tap "Try day 1 now". The player runs the preview's week 1, day 1, from the
    `POST /coaching/preview` data, with no account.
  - Sets are kept in the browser (sessionStorage) and in the onboarding draft (`onboarding_drafts.trial`: the logged
    sets, at most 1 session).
  - The finish card says "Save this session and get the rest of week 1: sign up free".
  - **At signup:** the draft is claimed, the Free plan is built, and the trial session's sets are written to week 1
    day 1 as logged, completed at signup time.
  - **Limit:** one trial per draft cookie. The draft is limited to 60 per network per 15 minutes (as today).
- **Conversion events.** New table `events`: `id`, `name`, `user_id` (nullable), `draft_hash` (nullable), `props`
  jsonb, `at`. It has no IP and no email. Recorded events:
  - `onboarding_done`, `trial_started`, `trial_finished`;
  - `signup` (with `from_trial`);
  - `plan_built`, `week1_done`;
  - `checkout_started`, `paid` (with kind);
  - `cancelled`.
  
  An admin summary card shows the funnel for the last 7 and 30 days. Events are kept for 400 days.

## 5. Nutrition-lite (step 3.3)

**"Estimates, not medical advice"** is shown on every nutrition screen and in every AI meal answer.

### 5.1 Who gets nothing

No targets, meal plans or meal logging, only the fixed line "For eating advice, please see a doctor or dietitian.",
when **any** of these is true:
- the health check has `any_yes` (even if cleared);
- the member's memory or chat has ever matched the wellbeing words for eating (`not eating`, `purging` and the rest of
  that list in `chat.ts`). The flag `users.nutrition_blocked` is set and only Markus can clear it in the database;
- the member says they are pregnant or breastfeeding (a question in the nutrition set-up);
- they are under 18 (not possible today: signup needs an adult confirmation).

### 5.2 Set-up (one screen, Plans and above)

- sex for the formula (female, male, or prefer not to say, which uses the female formula: lower targets, the safer
  side);
- age, from 18 to 90;
- height, from 120 to 230 cm;
- weight, from 35 to 300 kg (this also goes into body metrics);
- activity, auto-filled from days per week: 2 → 1.375, 3–4 → 1.55, 5–6 → 1.725;
- foods to avoid: free text, at most 10 items, each at most 40 characters, passed through the output filter;
- pregnant or breastfeeding: yes or no (yes blocks, see §5.1).

### 5.3 Targets (formula, no AI; `coaching/nutrition.ts`, pure)

- **BMR (Mifflin–St Jeor):** 10 × kg + 6.25 × cm − 5 × age, then +5 (male) or −161 (female or not said).
- **TDEE** = BMR × activity.
- **Calories by goal:**
  - fat_loss: TDEE × 0.85;
  - muscle: TDEE × 1.10;
  - everything else: TDEE.
- **Floors**, never crossed: calories never below BMR, and never below 1,500 (male) or 1,200 (female or not said).
- **Ceilings:** calories never above TDEE × 1.15.
- **Protein**, in g per kg of body weight:
  - strength or muscle: 1.6;
  - fat_loss: 1.8;
  - everything else: 1.2.
  
  The result is capped at 2.2 g/kg and 220 g a day.
- Rounded to the nearest 10 kcal and the nearest 5 g.
- **Recalculated** when weight, goal or days per week change, and at most once a day.

### 5.4 Weekly meal plan and grocery list (Coaching and Pro)

- **One Sonnet call** with the targets, foods to avoid, and the member's units. It returns JSON:
  - 7 days × 3 meals plus 1 snack, each with a name, plain ingredients, kcal and protein;
  - a grocery list grouped by aisle.
- **Checked in code before anyone sees it:**
  - every day's kcal is within ±10% of the target and its protein within ±15%;
  - no meal contains a foods-to-avoid word;
  - every text passes the output filter, with the dose rule switched off only for the kcal and protein fields, which are
    numbers in their own fields;
  - no meal names a supplement or medicine.
- **On failure:** the plan is dropped and the member gets "Your meal plan couldn't be made this week. Try again
  tomorrow.", which counts the call.
- **Rebuilds:** Pro may rebuild up to 2 more times a week; Coaching gets one plan a week.
- Stored in `meal_plans`: `user_id`, `week_of`, `plan` jsonb, `created_at`.

### 5.5 Meal logging

- **By sentence** ("chicken wrap and a flat white"), Coaching and Pro. One Haiku call returns items with estimated kcal
  and protein. Sanity checks: each item at most 2,500 kcal and 200 g protein, at most 12 items.
- **By photo**, Pro only. The photo is sent to the model once and **never stored**.
- **Stored** in `meal_logs`: `user_id`, `day` (local), `text` (the member's sentence, or "photo"), `items` jsonb, `kcal`,
  `protein_g`, `at`. The member can edit or delete any log.
- **Today** shows the day's total against the target as plain numbers, with no colours or "over / under" judgement
  words.

## 6. Body metrics (step 3.4)

- **`body_metrics`:** `id`, `user_id`, `day`, `weight_kg` (35–300), `waist_cm` (40–200), `at`. At most one row per day per
  member; a second entry that day replaces the first.
- **The weekly trend:** a 7-day moving average, shown as a line on Progress. No goal weight and no "ideal" line.
- **Progress photos (Pro):**
  - stored in Replit App Storage, in a **private** bucket, keyed by a random id;
  - served only through `GET /me/photos/:id`, which checks the owner and streams the file. There are no public URLs;
  - at most 1 photo a day and 5 MB per photo;
  - JPEG or PNG only, re-encoded on upload to strip location and other metadata;
  - account delete removes them;
  - export lists them by date (the files themselves through the photo route).

## 7. Morning check-in and the readiness rule (step 3.4)

- **`morning_checkins`:** `user_id`, `day`, `sleep_hours` (0–14, in half hours), `energy` (1–5), `soreness` (1–5), `at`.
  One per local day. (Phase 2's `checkins` table is the coach's scheduled messages, which is why the name differs.)
- **Readiness rule** (`coaching/readiness.ts`, pure). The day is **low** when either:
  - sleep is under 6 hours **and** soreness is 4 or more; or
  - energy is 1 **and** soreness is 4 or more.
- **On a low day,** that day's session view (not the stored plan) shows:
  - each item with 1 fewer set (at least 1);
  - targets 10% lighter (rounded down to 0.5 kg);
  - a why line: "Lighter today: short sleep and sore. Your plan is unchanged."
  
  Logged sets are the real ones, so `nextLoads` sees what was done.
- **What the agent sees:** today's check-in and readiness are added to the agent's context part 2 (spec Phase 2 §8).
  The daily note can mention them; it can't change the rule.
- **Gate:** the check-in is optional. With no check-in, there are no changes.

## 8. Journey and milestones (step 3.3b, already in the plan)

Derived on read from the permanent records:
- first session date and first logged weight per lift;
- personal bests per lift, with dates;
- blocks finished;
- session counts (10, 25, 50, 100, 250, 500, 1000);
- longest weekly streak (weeks with at least one session);
- before and now per main lift.

## 9. Share image (step 3.4)

A finished session or a new milestone shows "Share". The browser draws a 1080 × 1350 PNG card with the coach's colour,
the session or milestone and the member's first name only if they tick it (default off). It has no weights unless the
member ticks it. It uses the Web Share API, or a download where that isn't available. Nothing is uploaded.

## 10. Referral credit (moved to after 3.5)

A member's invite link gives the friend 50% off their first month. When the friend pays their first month, the member
gets a free month (Stripe customer-balance credit). This needs live Stripe and webhooks, so it is specced and built in
3.5, not before.

## 11. Data, export, delete

- **New tables:** `events`, `nutrition_profiles`, `nutrition_targets`, `meal_plans`, `meal_logs`, `body_metrics`,
  `progress_photos`, `morning_checkins`.
- **New columns:** `onboarding_drafts.trial`, `plans.access` and `users.nutrition_blocked`.
- **Account delete** removes all of these. Events are kept with `user_id` set to null.
- **Export** includes all of them.
- **Health data** (weight, waist, photos, nutrition set-up) is never sent to the AI except the targets, the
  foods-to-avoid list and the day's meal totals. Weight is sent only as the rounded protein target's basis, never as
  "your weight is".

## 12. Checks

Each step brings its own `*.check.ts`:
- **3.2:** a Free member logs week 1 and is refused week 2; the trial carries over at signup; events are recorded.
- **3.3:** the formula against 6 hand-worked cases, including every floor; blocked members get nothing; meal plans out
  of range are dropped; logs are sanity-checked; the photo is never stored.
- **3.4:** one weight per day; the readiness rule on 8 cases; low-day views change and stored plans don't; photos are
  served only to their owner.
- **3.3b:** milestones from a made-up 3-year history.
