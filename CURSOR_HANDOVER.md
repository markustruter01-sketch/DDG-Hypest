# CURSOR_HANDOVER

Branch: `cursor/hypest-foundations`  
No pull request was opened. `main` was not pushed, merged, or rebased.

## Starting main commit

`445c16a` HYP-1: remove unused template code and packages

`git pull origin main` reported already up to date.

## Baseline typecheck

Command: `pnpm run typecheck`  
Result: exit 0, before any task edits.

```
> workspace@0.0.0 typecheck /workspace
> pnpm run typecheck:libs && pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck

> workspace@0.0.0 typecheck:libs /workspace
> tsc --build

Scope: 4 of 9 workspace projects
artifacts/api-server typecheck$ tsc -p tsconfig.json --noEmit
artifacts/hypest-web typecheck$ tsc -p tsconfig.json --noEmit
artifacts/mockup-sandbox typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/hypest-web typecheck: Done
artifacts/mockup-sandbox typecheck: Done
```

## Tool versions

FACTS:

- First `node --version` in this VM printed `v22.14.0` and resolved to `/exec-daemon/node`.
- `nvm ls` showed `v22.22.2` installed and `lts/krypton -> v24.15.0 (-> N/A)`.
- `nvm install 24` installed `v24.21.0`. Later commands used `PATH="/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH"`. After that, `node --version` printed `v24.21.0`.
- `pnpm --version` printed `10.33.3`. The `pnpm` binary stayed on the Node 22 nvm path. It ran the installs and scripts.
- `pnpm install --frozen-lockfile` completed (`Done in 3.5s using pnpm v10.33.3`).

UNKNOWN: whether Claude's environment already has Node 24 on the default PATH. This VM's default `node` is still 22 unless that PATH prefix is set.

## HYP-F1 — done

Commit: `1a42cafc2cdb56130e2cbfdf8a6ed3a5540e500f`  
Message: `HYP-F1: core tables`  
Typecheck after the change: exit 0. Build was not required for this task.

Files:

- `lib/db/src/schema/users.ts`
- `lib/db/src/schema/sessions.ts`
- `lib/db/src/schema/commission-rates.ts`
- `lib/db/src/schema/programs.ts`
- `lib/db/src/schema/lessons.ts`
- `lib/db/src/schema/index.ts`
- `artifacts/api-server/src/lib/seed-commission-rates.ts`
- `artifacts/api-server/src/index.ts`

Outside the schema files: the seed is called from API startup because the task says to insert the two commission rows only when the table is empty, at API startup. Importing `@workspace/db` throws if `DATABASE_URL` is missing, so the API process now requires `DATABASE_URL` before it listens. The seed does not run during `pnpm run build`.

## HYP-F2 — done

Commit: `1b25d8465edb61701dda518f7f488900abd75c21`  
Message: `HYP-F2: email sign-up and login`  
`pnpm run typecheck` exit 0. `PORT=5173 BASE_PATH=/ pnpm run build` exit 0.

Files:

- `lib/api-spec/openapi.yaml`
- generated `lib/api-zod/src/generated/**` and `lib/api-client-react/src/generated/**` via `pnpm --filter @workspace/api-spec run codegen`
- `lib/api-client-react/tsconfig.json` (`lib` now includes `dom.iterable`)
- `artifacts/api-server/src/app.ts` (cookie-parser)
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/lib/passwords.ts`
- `artifacts/api-server/src/lib/session.ts`
- `artifacts/api-server/src/lib/login-rate-limit.ts`
- `artifacts/api-server/src/middleware/require-user.ts`

`dom.iterable` is there because Orval 8.30 emits `Headers.entries()` for JSON mutations, and this repo's TypeScript DOM lib only declares `entries()` when `dom.iterable` is included. Without it, codegen's `tsc --build` failed.

## HYP-F3 — done

Commit: `6118714e3eadafbed083936795b2c552180a9d39`  
Message: `HYP-F3: account screens`  
`pnpm run typecheck` exit 0. `PORT=5173 BASE_PATH=/ pnpm run build` exit 0.

Files:

- `lib/api-spec/openapi.yaml` (`PATCH /auth/me`)
- generated client and zod files from codegen
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/hypest-web/package.json`
- `pnpm-lock.yaml` (importer links only; see below)
- `artifacts/hypest-web/src/main.tsx`
- `artifacts/hypest-web/src/App.tsx`
- `artifacts/hypest-web/src/App.css`
- `artifacts/hypest-web/src/lib/server-error.ts`
- `artifacts/hypest-web/src/pages/signup-page.tsx`
- `artifacts/hypest-web/src/pages/login-page.tsx`
- `artifacts/hypest-web/src/pages/profile-page.tsx`

`@workspace/api-client-react` (`workspace:*`) and `@tanstack/react-query` (`catalog:`) were added as direct dependencies of `@workspace/hypest-web`. Both were already in the workspace. `pnpm install` changed only the `artifacts/hypest-web` importer in `pnpm-lock.yaml` (6 lines). No package version was upgraded. This was required so the web app can call the generated hooks. pnpm does not allow that import otherwise.

## HYP-F4 — done

Commit: `b86bfde7090de09c227ff4d580aecc8ec1c3cf78`  
Message: `HYP-F4: draft programs`  
`pnpm run typecheck` exit 0. `PORT=5173 BASE_PATH=/ pnpm run build` exit 0.

Files:

- `lib/api-spec/openapi.yaml`
- generated client and zod files from codegen
- `artifacts/api-server/src/routes/programs.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/lib/youtube-url.ts`
- `artifacts/hypest-web/src/App.tsx`
- `artifacts/hypest-web/src/App.css`
- `artifacts/hypest-web/src/lib/money.ts`
- `artifacts/hypest-web/src/pages/create-page.tsx`
- `artifacts/hypest-web/src/pages/explore-page.tsx`
- `artifacts/hypest-web/src/pages/explore-detail-page.tsx`

Creator routes (all `requireUser`, missing or not owned → 404 `{ "message": "not found" }`):

- `POST /programs` create draft
- `GET /programs/mine` list mine
- `GET /programs/mine/{id}` program plus lessons
- `PATCH /programs/mine/{id}` update title, description, price_cents
- `POST /programs/mine/{id}/lessons` add lesson (position starts at 1, then max+1)
- `PATCH /programs/mine/{id}/lessons/{lessonId}`
- `DELETE /programs/mine/{id}/lessons/{lessonId}` → 204
- `POST /programs/mine/{id}/lessons/reorder` body `{ "lesson_ids": number[] }` must be each lesson id once
- `POST /programs/mine/{id}/publish`
- `POST /programs/mine/{id}/unpublish`

Public routes, no auth:

- `GET /programs` published only
- `GET /programs/{id}` published only, otherwise 404

Public JSON keys only: `id`, `title`, `description`, `price_cents`, `creator_display_name`, `lesson_count`. The public handlers select those columns (plus a `count(*)` on lessons) and parse with the generated public zod schema. They also throw if a forbidden key such as `lessons`, `body`, `sets`, `reps`, `media_ref`, or `media_source` is about to be sent.

Logged-out `GET /programs/{id}` was not executed. There is no local PostgreSQL, so the API cannot start. See Test evidence.

## Test evidence

Build needs `PORT` and `BASE_PATH` because `artifacts/hypest-web/vite.config.ts` and `artifacts/mockup-sandbox/vite.config.ts` throw if they are missing. That was already true on main. I did not change those files. Successful builds used `PORT=5173 BASE_PATH=/` and ended with the api-server esbuild "Done", hypest-web "built", and mockup-sandbox "built". `pnpm run build` without those variables fails with `PORT environment variable is required but was not provided.`

`psql`, `postgres`, `initdb`, `pg_isready`, and `docker` were not on PATH. `DATABASE_URL` was unset. No schema push and no API curl. Curl results: not run. Reason: no local PostgreSQL, and the brief says not to install system software and not to hit a remote database.

YouTube URL helper, run with `node --experimental-strip-types` against `artifacts/api-server/src/lib/youtube-url.ts`:

```
{"source":"youtube","ref":"https://www.youtube.com/watch?v=abc","error":null}
{"source":"youtube","ref":"https://youtu.be/abc","error":null}
{"source":"youtube","ref":"https://m.youtube.com/watch?v=abc","error":null}
{"source":"youtube","ref":"http://www.youtube.com/watch?v=abc","error":"media_ref must be an https URL on youtube.com or youtu.be"}
{"source":"youtube","ref":"https://evil.example/youtube.com","error":"media_ref must be an https URL on youtube.com or youtu.be"}
{"source":"youtube","ref":"https://youtube.com.evil.com/watch","error":"media_ref must be an https URL on youtube.com or youtu.be"}
{"source":"youtube","ref":null,"error":"media_ref must be an https URL on youtube.com or youtu.be"}
{"source":null,"ref":"https://www.youtube.com/watch?v=abc","error":null}
```

Browser: `artifacts/hypest-web` dev server was started with `PORT=5173 BASE_PATH=/`. Headless Chrome rendered:

- `/signup`: Email, Password, Display name, checkbox text `I confirm I am 18 or older`, Sign up, link Log in, bottom nav.
- `/login`: Email, Password, Log in, link Sign up, bottom nav.
- `/`: Home plus bottom nav.
- `/explore`, `/explore/1`, `/create`, `/profile`: title plus `Request failed`.

`Request failed` is because this dev server does not serve `/api`. `curl -D - http://127.0.0.1:5173/api/auth/me` returned `200` `Content-Type: text/html` (the Vite index document), not the API. I did not edit `artifacts/hypest-web/server/index.ts` (forbidden). Signup/login/profile/create/explore against a real API were not exercised.

## Questions / guesses

These were not specified. I chose them and did not invent extra business rules beyond what is listed.

- Email is lowercased with `String.prototype.toLowerCase()` before it is stored or looked up. The users check constraint is `email = lower(email)`. I did not trim email. No max email length.
- Signup and login success bodies are the current user `{id, email, display_name, bio}`. Signup is HTTP 201. Login is 200. Logout is 204 even when there is no session. `GET /auth/me` and `requireUser` failures use 401 `{ "message": "unauthorized" }`.
- Login password has max length 200 and no minimum, so a wrong short password is 401 `invalid email or password`. A body that fails zod is 400 and the message is the first zod issue. Only that first issue is returned.
- `adult_confirmed` is OpenAPI `const: true`, generated as `z.literal(true)`. `adult_confirmed_at` is set to `new Date()` at signup.
- Password storage is `scrypt:<16-byte salt hex>:<64-byte hash hex>`. scrypt options are Node's defaults `N=16384`, `r=8`, `p=1`. Unknown emails still run scrypt against a fixed dummy hash, then return the same 401 message.
- Cookie value is base64url of the raw 32 bytes (43 characters). `sessions.token_hash` is hex SHA-256 of those raw bytes, not of the cookie string. Cookie name `hypest_session`, httpOnly, sameSite `lax`, path `/`, secure only when `NODE_ENV=production`, expires in 30 days. Multiple sessions per user are kept. An expired or orphaned session row is deleted when it is seen.
- Login rate limit: 10 failures per lowercased email per 15 minutes, in memory. The 11th attempt in the window is 429 `{ "message": "too many attempts" }` and does not check the password. A successful login clears that email's failures. Entries for emails that never come back stay until process restart. The whole map is empty after restart.
- OpenAPI component names are `SignupRequest`, `LoginRequest`, and `UpdateProfileRequest` so they do not collide with generated zod consts `SignupBody` and `LoginBody`. JSON field names are the ones in the brief.
- `PATCH /auth/me` treats omitted fields as unchanged. `bio: null` or a blank profile textarea is stored as null. `display_name` is not trimmed.
- Commission seed runs only when the table has zero rows. It does not repair a partial table. There is no transaction around signup's user insert and session insert.
- Timestamps are Drizzle `timestamp` without time zone. `programs.updated_at` is set in the API on program update, lesson add/update/delete/reorder, publish, and unpublish. There is no database trigger. Foreign keys have no `ON DELETE` action.
- Check constraints use `char_length` for the text limits in the brief, and `email = lower(email)`.
- Program `status` is not accepted on create or update. Create always inserts `draft`. Publish and unpublish are the only status changes. Publishing an already published program is allowed if it still has at least one lesson and `price_cents >= 500`. Unpublish of a draft is allowed. If both publish rules fail, the response is 400 `publish needs at least one lesson` (the lesson check is first).
- Empty program description from the form is stored as null. Price in the editor is a US dollar string with at most two decimal places, converted to integer cents without floating point (`5.00` → `500`). Explore shows `Intl.NumberFormat` `en-US` currency USD (`500` → `$5.00`).
- Lesson positions start at 1. Reorder writes temporary negative positions inside a transaction, then 1..n. Delete does not renumber the remaining lessons. The form's YouTube URL field sends `media_source: "youtube"` only when the field is non-empty. `www.youtube.com` and `m.youtube.com` are accepted because the host equals `youtube.com` or ends with `.youtube.com` (same for `youtu.be`). A `media_ref` with `media_source` null is stored and is not returned by the public endpoints.
- Creator list/detail responses include `status` and, on the detail, full lesson rows. Public responses use `creator_display_name` and `lesson_count`. List order is `id` descending for public and `updated_at` descending for mine.
- Logged-out Create shows Log in / Sign up only when `GET /programs/mine` is 401. Explore detail route is `/explore/:programId`. The bottom nav treats a path as active when it equals the tab or starts with that tab plus `/`, so `/explore/1` highlights Explore.
- UI strings that were not specified: `Loading`, `Request failed`, `Save`, `Cancel`, `New program`, `Create draft`, `Save program`, `Publish`, `Unpublish`, `Add lesson`, `Save lesson`, `Edit`, `Delete`, `Move up`, `Move down`, `All programs`, `No programs yet`, `No published programs`, `Price must be at least $5.00`, `Price (US$)`. The buy button text is exactly `Buy — coming soon` and it is disabled.
- Fetch calls pass `credentials: "include"`. Same-origin `/api` cookies work with the default fetch behavior. I did not change CORS. The existing `cors()` call does not set `credentials: true`.

## Problems noticed but not fixed

- `pnpm run build` fails unless `PORT` and `BASE_PATH` are set. Pre-existing vite configs.
- `artifacts/hypest-web/server/index.ts` does not proxy `/api`. Left untouched because the brief forbids editing it. Account and program screens therefore cannot reach the API when only the web dev server is running.
- API startup now requires `DATABASE_URL` and a migrated database, because the commission seed queries on boot. If the tables are missing, the process logs the error and exits.
- Login rate limit is in-memory and resets on restart.
- `artifacts/hypest-web/index.html` still has the Replit template description and a Google Fonts stylesheet. Not part of these tasks.
- Public `GET /programs/{id}` was not called against a running API. The handler never selects lesson title, body, sets, reps, or media fields, but that was not proven with curl.

## FACTS

Only things run or read in this VM:

- Repo remote is `markustruter01-sketch/DDG-Hypest`. Starting `main` commit is `445c16a`.
- Branch `cursor/hypest-foundations` did not exist on the remote before this work. It was created from that main commit and pushed.
- Baseline typecheck exited 0.
- Node default was 22.14.0. Work ran on Node 24.21.0 after `nvm install 24`. pnpm is 10.33.3.
- `pnpm install --frozen-lockfile` succeeded. Later `pnpm install` after the hypest-web dependency edit only added those two importer entries.
- `pnpm run typecheck` and `PORT=5173 BASE_PATH=/ pnpm run build` exited 0 on the F2, F3, and F4 trees.
- Codegen command used: `pnpm --filter @workspace/api-spec run codegen`.
- No PostgreSQL client or server was found. `DATABASE_URL` was unset. No curl against the API. No `pnpm --filter @workspace/db run push`.
- The YouTube helper output above was produced by running that file.
- The page text above was read from headless Chrome against the hypest-web dev server on port 5173.
- `curl` to `http://127.0.0.1:5173/api/auth/me` returned HTML 200.

## UNKNOWN

- Whether a gateway in Claude's environment already routes `/api` to the API server.
- Whether `lower()` in their Postgres locale matches JavaScript `toLowerCase()` for non-ASCII emails.
- Whether the public program response stays free of lesson content once a real database is connected. The code path is written that way; it was not executed.
- End-to-end signup, login, cookie, profile edit, draft create, publish, and explore against a database. Not run.
