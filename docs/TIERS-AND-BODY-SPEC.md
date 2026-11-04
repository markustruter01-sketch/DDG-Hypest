# Tiers and body spec (build plan step 3.1)

Written by Opus 5.5 on 5 Nov 2026, standing in for Fable. An independent reviewer agent that had not seen the draft
checked it; its 16 findings are applied here. Fable re-reads this before Phase 3 is called done.

**Markus approves §1 (tiers and prices), §2 (allowances and caps) and the two rule changes in §3 before step 3.2
starts.** Every value here is fixed. A change to any of them is a change to this file, in its own PR.

Builds on Phase 2 (`docs/COACH-AGENT-SPEC.md`): allowances, the ledger, the output filter and the agent.

**Not live in Phase 3 without keys:**
- Real payments: step 3.5.
- AI calls: they run against the fake model in checks, and switch on with `ANTHROPIC_API_KEY`.

Everything else ships and works now.

## 1. Tiers and prices (Markus to approve)

| Tier (`memberships.kind`) | Price (US$) | What it is |
|---|---|---|
| **Free** (no membership) | 0 | One coach, week 1 of their first block, set logging, Progress and Journey, morning check-in, body metrics, one free session before signup. No AI calls at all. |
| **Plans** (`tier1`) | 4.99 / month | Free, plus a new 4-week block every 4 weeks, the coach's notes, 3 chats a day, Today's note, check-ins, and nutrition targets (formula only) |
| **Coaching** (`tier2`) | 12.99 / month | Plans, plus adaptive loads, swaps, 20 chats a day, the Sunday review, meal logging by sentence, and one weekly meal plan with a grocery list |
| **Pro** (`tier3`, new) | 24.99 / month | Coaching, plus 40 chats a day, meal logging by photo, 2 meal-plan rebuilds a week, and progress photos |

**Changes from today:**
- **One-off plans** (`intro_plan` $2.50 and `plan` $4.99) are retired for new purchases. Unused credits keep working:
  the legacy `plan` level gets **Free's allowances**, plus the full block its credit pays for.
- **Logging and Progress** move from Coaching-only to every tier (§4).
- **Prices** live only in `coaching/access.ts` `PRICES`. Checkout supports `tier3` in test mode now. Moving between
  tiers in either direction (Stripe subscription update with proration, the webhook ending the old row) is built in
  step 3.5.
- No real subscribers exist yet, so there is nothing to grandfather.

**Free in detail:**
- The rules build the member's first block **once per account**, but the server sends only **week 1**. Weeks 2 to 4
  are left out of the plan view, and every route refuses them with 402 "Part of Plans".
- **Each week-1 session can be done once** (there are no repeats: set logs are one row per item and set, and Journey
  needs them kept).
- When week 1 is done, Today shows "Week 1 done" with the offer card.
- **Changing coach** is allowed until the first set is logged. After that, it's part of Plans.
- **On upgrade,** the same block opens in full; it is not rebuilt.

**Lapsed subscriber** (the membership ended): they keep their **current block in full**, logging included, until it
ends, because they paid for it. They get no new blocks and fall back to Free's allowances. Access is **computed** from
memberships and the block's start date, never stored on the plan.

## 2. Allowances and caps (Markus to approve)

Rows in `allowances`, as in Phase 2 §5:
- **New kinds:** `meal_log` (Haiku) and `meal_plan` (Sonnet). `tier3` rows are added. The legacy `plan` level uses
  Free's rows (`none`).
- **Weekly limits are enforced in code,** by counting rows per `week_of` (Monday, member's time zone). The allowance
  rows stay as the monthly backstop.

| Kind | Free (and legacy `plan`) | Plans | Coaching | Pro |
|---|---|---|---|---|
| `chat` | 0 | 3 / day, 60 / month | 20 / day, 300 / month | 40 / day, 600 / month |
| `daily_note` | 0 | 1 / day, 31 / month | 1 / day, 31 / month | 1 / day, 31 / month |
| `plan_notes` | **0** (fixed notes from the prompt file instead) | 3 / month | 3 / month | 3 / month |
| `weekly_review` | 0 | 0 | 1 / day, 5 / month | 1 / day, 5 / month |
| `checkin` | 0 | 2 / day, 8 / month | 2 / day, 8 / month | 2 / day, 8 / month |
| `meal_log` | 0 | 0 | 5 / day, 100 / month | 10 / day, 200 / month |
| `meal_plan` | 0 | 0 | **1 a week** (5 / month backstop) | **3 a week** (1 plan + 2 rebuilds; 15 / month backstop) |

**Member caps** go in a new `member_caps` table (`tier`, `cap_micro_usd`, seeded like `allowances`). They replace
Phase 2's single $1.50 constant:

| Free | Plans | Coaching | Pro |
|---|---|---|---|
| $0 | $0.50 | $1.50 | $3.00 |

Pro and Coaching chat tools are the same. Plans keeps Phase 2's three tools.

**Free spend is zero by design,** so throwaway accounts can't drain the global AI budget. Free plan notes come from
fixed per-coach lines, which are added to each coach's prompt file.

## 3. Cost model, and two rule changes (Markus to approve)

The prices are those in Phase 2 §2. A meal photo costs about 1,500 Haiku input tokens. The meal plan is allowed
**4,000** output tokens: 28 meals plus a grocery list don't fit in 3,000, and a reply that is cut off is a counted
failure.

| Kind | Tokens per call, in / out | Cost per call |
|---|---|---|
| Meal log, sentence (Haiku) | 1,200 / 200 | $0.00022 |
| Meal log, photo (Haiku) | 2,700 / 200 | $0.00037 |
| Meal plan and grocery list (Sonnet) | 3,000 / 4,000 | $0.046 |

**Worst case per member per month** (every allowance used):

| Tier | Worst case | AI share of net revenue (after Stripe's 2.9% + $0.30) |
|---|---|---|
| Free | $0 | n/a |
| Plans | $0.22 (Phase 2) | $4.99 nets $4.55, so 5% |
| Coaching | $1.16 + $0.022 meal logs + $0.23 meal plans (5) = **$1.41** | $12.99 nets $12.31, so 11% |
| Pro | $1.38 chat + $0.014 notes + $0.063 plan notes + $0.38 reviews + $0.004 check-ins + $0.074 photo logs + $0.69 meal plans (15) = **$2.61** | $24.99 nets $23.97, so 11% |

**Typical,** worked out the way Phase 2 did:
- **Coaching:** $0.47 (Phase 2 typical) + 30 meal logs ($0.007) + 4 meal plans ($0.18) = **$0.66**.
- **Pro:** $0.47 + 60 more chats ($0.14) + 60 photo logs ($0.022) + 6 meal plans ($0.28) = **$0.91**.

**Rule changes for Markus to approve explicitly:**
1. **Build-plan standing rule 6 (the red line)** becomes per tier. If a tier's average cost per active member over the
   last 30 days passes **50% of that tier's cap** (Plans $0.25, Coaching $0.75, Pro $1.50), that tier's allowances come
   down first. It is read weekly. This replaces the single $1.50.
2. **Phase 2 §7's member cap** (one US$1.50 for every tier) is replaced by the per-tier caps above. Pro's $3.00 is
   above the old red line on purpose: Pro pays $24.99.

## 4. Free logging and the free session (step 3.2)

### 4.1 Two access checks, replacing today's single `canLog`

- **`canLog`** means the member has an open session in the current block: any tier (Free: week 1 only), and
  lapsed-but-paid blocks.
  - It gates set logging, `/complete`, the plan view's logs, and Progress and Journey.
- **`canAdapt`** means `tier2` or `tier3`.
  - It gates `nextLoads` at the next block, "This hurts" swaps, and the agent's swap and load tools.
  - The safety stop on "This hurts" stays on every tier, as now.
- **The offline queue.** When a queued set gets a 402 (for example after a lapse), the player shows "N sets couldn't be
  saved: your plan doesn't include this session", and the set isn't dropped silently.

### 4.2 The free session before signup

1. **Starting it.** On the onboarding result, "Try day 1 now" opens the player on the preview's week 1, day 1 (from
   `POST /coaching/preview`), with no account.
2. **Where the sets go.** They are kept in sessionStorage and in the onboarding draft, in a new column
   `onboarding_drafts.trial` (jsonb, one session at most). They are checked against `LogSetBody` ranges when saved.
3. **The safety stop in the trial.** "This hurts" shows the same stop or swap-not-available text and ends the trial.
   There is no account, so no pain record is stored. The text says to stop and see a professional.
4. **Signup.** The finish card offers "Save this session and get the rest of week 1: sign up free".
   - **At signup only** (not login), the draft is claimed and the Free block is built.
   - Trial sets are written to week 1 day 1 by **position and exercise id**. A position whose exercise changed (the
     answers were edited after the trial) is skipped.
   - The session is marked completed at signup time.
5. **Limits.** One trial per draft cookie. Drafts are limited to 60 per network per 15 minutes, as today.

### 4.3 Conversion events

New table `events`: `id`, `name`, `user_id` (nullable), `draft_hash` (nullable), `props` jsonb, `at`. It has no IP and
no email.

**Allowed names:**
- `onboarding_done`, `trial_started`, `trial_finished`;
- `signup`, `plan_built`, `week1_done`;
- `checkout_started`, `paid`, `cancelled`.

**Allowed `props` keys** (anything else is dropped): `coach_id`, `goal`, `from_trial`, `kind`, `tier`.

The admin summary shows the funnel for the last 7 and 30 days. Events are kept for 400 days. On account delete,
`user_id` is set to null.

## 5. Nutrition-lite (step 3.3)

**"Estimates, not medical advice"** is shown on every nutrition screen and in every AI meal answer.

### 5.1 Who is blocked, permanently

`users.nutrition_blocked` (boolean) is set and **never cleared by the app**: only Markus clears it, in the database,
after a conversation. It is set when:
- the health check is ever answered with `any_yes`, cleared or not (set when the answer is saved, so re-answering
  can't undo it);
- the member says they are pregnant or breastfeeding;
- the age from the birth year is under 18;
- **any member text matches `EATING_FLAGS`**: chat, meal-log sentences, foods-to-avoid, memory edits.
  - `EATING_FLAGS` is a new named export in `chat.ts`: the eating words now inside `WELLBEING_FLAGS` ("not eating",
    "stop eating", "starving myself", "starve myself", "purge", "purging", "make myself sick", "throw up after").
    `WELLBEING_FLAGS` includes it.
  - A one-time backfill at deploy scans stored `coach_messages` (member role).

**A blocked member gets:**
- no targets, meal plans or meal logging;
- only the fixed line "For eating advice, please see a doctor or dietitian.";
- weight shown **without** trend arrows or prompts to weigh in.

**Meal-log text and foods-to-avoid** go through `screenMessage` first: a warning word gives the stop flow; a wellbeing
or eating word gives the help message and sets the block.

### 5.2 Set-up (one screen, Plans and above)

- **Sex for the formula:** female, male, or prefer not to say. Prefer-not uses the midpoint constant (−78) and the
  female floor.
- **Birth year:** stored, not age, so it never goes stale. Age 18 to 90.
- **Height:** 120 to 230 cm.
- **Weight:** 35 to 300 kg; also saved to body metrics.
- **Activity,** from days per week: 2–3 → 1.375; 4–6 → 1.55.
- **Foods to avoid:** at most 10 items, each at most 40 characters, screened as in §5.1. The screen says plainly:
  **"This isn't allergy-safe: always check ingredients yourself."**
- **Pregnant or breastfeeding:** yes or no. Yes sets the block.

### 5.3 Targets (formula, no AI; `coaching/nutrition.ts`, pure)

1. **Weight used:** the 7-day average from body metrics (or the set-up weight until there are 7 days).
2. **BMR (Mifflin–St Jeor):** 10 × kg + 6.25 × cm − 5 × age, then +5 (male), −161 (female) or −78 (not said).
3. **TDEE** = BMR × activity.
4. **BMI guard:** BMI = kg / m². **Under 18.5 → maintenance only** (no deficit, whatever the goal), and Today shows "Your
   coach keeps food at maintenance; talk to a doctor if your weight keeps dropping."
5. **Calories by goal:**
   - fat_loss: TDEE × 0.85 (unless the BMI guard applies);
   - muscle: TDEE × 1.10;
   - everything else: TDEE.
6. **Floor** = the larger of: BMR, rounded **up** to 10 kcal; and 1,500 (male) or 1,200 (female or not said).
   **Ceiling** = TDEE × 1.15. **The floor always wins over the ceiling.**
7. **Calories** = clamp(the step 5 value, floor, max(floor, ceiling)), rounded to the nearest 10 kcal, never below the
   floor.
8. **Protein:**
   - g/kg by goal: strength or muscle 1.6; fat_loss 1.8; everything else 1.2;
   - capped at 2.2 g/kg and 220 g a day (a safety ceiling in case the rates change);
   - rounded to 5 g.
9. **Recalculated** when the 7-day weight, goal or days per week change, at most once a day.

### 5.4 Weekly meal plan and grocery list (Coaching and Pro)

1. **One Sonnet call** (up to 4,000 output tokens) with the targets, foods to avoid and units. It returns JSON:
   - 7 days × (3 meals + 1 snack), each with a name, ingredients (with quantities), kcal and protein;
   - per-day totals;
   - a grocery list grouped by aisle.
2. **Checked in code** (`coaching/meal-plan.ts`):
   - every day's kcal is **at or above the floor** and **at or below the ceiling**, and within ±10% of the target;
   - protein is within ±15%;
   - every day's meals add up to its stated totals, within 5%;
   - no ingredient or meal name matches a foods-to-avoid item (whole word, case-insensitive);
   - **the meal filter profile:** the Phase 2 output filter, except that quantities with units (g, kg, ml, l, cup,
     tbsp, tsp, piece) are allowed in ingredient and grocery fields. It still rejects medicines, supplements, diagnosis
     words, links and warning words, and text over 200 characters per field.
3. **On failure,** nothing is shown except "Your meal plan couldn't be made this time. Try again later." The call
   counts.
4. **Limits:** Coaching 1 a week, Pro 3 a week, counted per `week_of` in code.
5. **Stored** in `meal_plans`: `user_id`, `week_of`, `plan` jsonb, `created_at`.

### 5.5 Meal logging

- **By sentence** (Coaching and Pro), after `screenMessage` (§5.1). One Haiku call returns items with estimated kcal
  and protein.
  - Sanity checks: each item at most 2,500 kcal and 200 g of protein; at most 12 items.
  - The reply is the items only; free text is dropped.
- **By photo** (Pro). The photo is sent to the model once and **never stored or logged**: the request logger records
  the route and status only, and the body is not kept in memory after the call.
- **Stored** in `meal_logs`: `user_id`, `day` (local), `text` (the member's sentence, or "photo"), `items` jsonb,
  `kcal`, `protein_g`, `at`. The member can edit or delete any log.
- **Today** shows the day's totals against the targets as plain numbers, with no colours and no "over / under" words.

## 6. Body metrics (step 3.4)

- **`body_metrics`:** `user_id`, `day`, `weight_kg` (35–300), `waist_cm` (40–200), `at`. One row per member per day;
  a second entry that day replaces the first.
- **Progress:** a 7-day moving average line, with no goal line. Blocked members see the numbers only (§5.1).
- **Progress photos (Pro):**
  - stored in Replit App Storage, in a **private** bucket, under a random id;
  - served only by `GET /me/photos/:id`, which checks the owner and sends `Cache-Control: no-store`,
    `X-Content-Type-Options: nosniff` and the stored content type. There are no public URLs;
  - at most 1 photo a day, 5 MB and 40 megapixels;
  - JPEG or PNG only, re-encoded on upload, which strips EXIF, location and other metadata;
  - **when Pro lapses:** photos stay viewable and deletable, but no new uploads;
  - **account delete:** files are deleted from storage first, with 3 retries; then the rows. A file that still fails
    is listed for Markus's alert;
  - **export:** `GET /me/export/photos` downloads a zip of the member's photos; the JSON export lists them.

## 7. Morning check-in and the readiness rule (step 3.4)

**`morning_checkins`:** `user_id`, `day`, `sleep_half_hours` (an integer, 0–28), `energy` (1–5), `soreness` (1–5), `at`.
One per local day. (Phase 2's `checkins` table holds the coach's scheduled messages, which is why the name differs.
Build plan 3.4 is amended to say so.)

**The readiness rule** (`coaching/readiness.ts`, pure). The day is **low** when:
- sleep is under 6 hours **and** soreness is 4 or more; or
- energy is 1 **and** soreness is 4 or more.

**On a low day:**
- **Which sessions change:** only sessions with **nothing logged yet** when the check-in was saved. A session already
  started stays as it is.
- **What changes** (in the view only, never the stored plan):
  - each item has 1 fewer set, but at least 1;
  - targets are 10% lighter, rounded down to 0.5 kg;
  - a why line: "Lighter today: short sleep and sore. Your plan is unchanged."
- **Marking:** the session gets `plan_sessions.low_day = true` when its first set is logged on a low day. **`nextLoads`
  leaves low-day sessions out**, so one rough day never lowers the next block.
- **The output filter** uses the view's numbers (the lighter ones) in `PlanNumbers`, so the coach can quote them.
- **What the agent sees:** today's check-in and the readiness result are added to context part 2. The daily note may
  mention them, but can't change the rule.
- With no check-in, nothing changes.

## 8. Journey and milestones (step 3.3b)

Derived on read from the permanent records:
- first session date and first logged weight per lift;
- personal bests per lift, with dates (low-day sessions included, since they're real lifts);
- blocks finished;
- session counts (10, 25, 50, 100, 250, 500, 1000);
- longest weekly streak (weeks with at least one session);
- before and now per main lift.

## 9. Share image (step 3.4)

A finished session or a new milestone shows "Share".
- The browser draws a 1080 × 1350 PNG with the coach's colour and the session or milestone.
- The member's first name is included only if they tick it (off by default). Weights are included only if they tick
  that too.
- Shared with the Web Share API, or downloaded where that isn't available. Nothing is uploaded.

## 10. Referral credit (fixed now, built with 3.5)

- **The friend** gets 50% off their first month of any paid tier.
- **The member** gets one free month of **their own current tier**, as a Stripe customer-balance credit equal to that
  month's price.
- **When:** the credit is granted **14 days after** the friend's first payment, and only if it wasn't refunded or
  disputed.
- **Limits:** at most 6 credits per member per 12 months. A free member's link gives the friend the discount only.
- **No self-referral:** the friend's card fingerprint, or email, matching the member's means no credit.
- **Where it's recorded:** in `referrals` (`member_id`, `friend_id`, `status`, `credited_at`), built in 3.5.

## 11. Data, privacy, export, delete

**Schema changes:**
- **New tables:** `events`, `nutrition_profiles`, `nutrition_targets`, `meal_plans`, `meal_logs`, `body_metrics`,
  `progress_photos`, `morning_checkins`, `member_caps` (and `referrals` in 3.5).
- **New columns:**
  - `onboarding_drafts.trial`;
  - `users.nutrition_blocked`;
  - `plan_sessions.low_day`;
  - `ai_ledger_monthly.calls_meal_log` and `calls_meal_plan`.
- **Constraint changes:**
  - `memberships_kind` adds `tier3`;
  - `ai_usage_purpose` adds `meal_log` and `meal_plan`.
- **Code types to update:**
  - `Level` adds `tier3`;
  - `Kind` and `KINDS` add `meal_log` and `meal_plan`;
  - `CHAT_TOOLS.tier3` is the same as tier2;
  - checkout `Kind` adds `tier3`.

**What goes to the AI:**
- **Meal-plan call:** targets, foods to avoid and units only.
- **Meal-log call:** the member's sentence or photo only, after screening.
- **Agent context:** today's check-in and readiness.
- **Chat:** the targets as two numbers, so the coach can talk about them. The meal filter profile is not used in chat,
  so a reply that quotes them in kcal is dropped. The prompt says to say "your target on the Food screen" instead.
- **Never sent to any model:** weight, waist, height, birth year, sex, photos (progress photos never; meal photos only
  for that one call), the pregnancy answer, the BMI.

**Account delete** removes every new table's rows (photos as in §6). Events keep their rows with `user_id` set to null.

**Export** includes every new table, plus the photo zip.

## 12. Checks

Each step brings its own `*.check.ts`:
- **3.2:**
  - a Free member gets only week 1, and weeks 2–4 are refused on every route;
  - each week-1 session can be done once;
  - upgrade opens the block;
  - a lapsed member keeps their paid block;
  - the trial carries over by position at signup and not at login;
  - events keep only the allowed keys;
  - Free makes no AI calls (plan notes are fixed).
- **3.3:**
  - 8 hand-worked formula cases: male, female and not-said, every floor, BMI under 18.5, floor above ceiling, and age
    at 90;
  - blocked members get nothing, including after re-answering the health check;
  - the eating words in a meal sentence block;
  - a meal plan with a day under the floor or with meals that don't add up is dropped;
  - the meal filter allows "1 kg rice" and drops "creatine";
  - the weekly meal-plan limit holds;
  - photos are never stored.
- **3.4:**
  - one weight per day;
  - the readiness rule on 8 cases;
  - low-day views change and stored plans don't;
  - started sessions don't change;
  - `nextLoads` leaves low days out;
  - photos are served only to their owner, with the right headers.
- **3.3b:** milestones from a made-up 3-year history.
