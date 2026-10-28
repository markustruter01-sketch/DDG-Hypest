#!/bin/bash
# Every Hypest check in one go. LOCAL, EMPTY database only (it creates users, plans and payments rows).
#   DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/<empty db> bash scripts/check-all.sh
# Used by GitHub Actions on every PR (.github/workflows/checks.yml). Runs: typecheck, builds, schema push,
# coach smoke test, and every *.check.ts file, against two local API servers:
#   :8099 payments off (dev unlock)   :8098 Stripe test mode with a dummy key (nothing reaches Stripe)
#   :8096 AI on, pointed at a fake Claude API that ai.check.ts serves on :8097 (nothing reaches Anthropic)
#   :8095 email on, pointed at a fake mail server that password.check.ts serves on :2525
#   :8094 alerts on (fake Discord webhook from ops.check.ts on :2526) and an admin email
#   :8093 email on (fake mail server from reminders.check.ts on :2527) and a JOBS_TOKEN for the daily job
set -euo pipefail
cd "$(dirname "$0")/.."
case "${DATABASE_URL:-}" in *@127.0.0.1:*|*@localhost:*) ;; *) echo "refusing: DATABASE_URL must be a local database"; exit 1;; esac

LOGS=$(mktemp -d); PIDS=()
cleanup(){ for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
step(){ echo; echo "=== $*"; }

step "typecheck";             pnpm run typecheck
step "database schema";       pnpm --filter @workspace/db run push
step "build api";             pnpm --filter @workspace/api-server run build
step "build web";             PORT=5199 BASE_PATH=/ pnpm --filter @workspace/hypest-web run build

start(){ local port=$1; shift
  if curl -s "http://localhost:$port" >/dev/null; then echo "port $port is already in use: stop that server first"; exit 1; fi
  (cd artifacts/api-server && exec env NODE_ENV=development DEV_AUTO_LOGIN=1 PORT=$port "$@" node ./dist/index.mjs > "$LOGS/api-$port.log" 2>&1) &
  PIDS+=($!)
  for _ in $(seq 1 40); do curl -sf "http://localhost:$port/api/healthz" >/dev/null && return 0; sleep 0.5; done
  echo "API on $port did not start"; cat "$LOGS/api-$port.log"; exit 1; }
step "start APIs"
start 8099
start 8098 STRIPE_SECRET_KEY=sk_test_check_dummy STRIPE_WEBHOOK_SECRET=whsec_check_dummy
start 8096 ANTHROPIC_API_KEY=check-dummy AI_MONTHLY_BUDGET_USD=1 ANTHROPIC_BASE_URL=http://localhost:8097
start 8095 EMAIL_SMTP_URL=smtp://localhost:2525 "EMAIL_FROM=Hypest <support@hypestapp.com>" APP_BASE_URL=http://localhost:5199
start 8094 DISCORD_WEBHOOK_URL=http://localhost:2526/hook ADMIN_EMAILS=owner-check@example.test
start 8093 EMAIL_SMTP_URL=smtp://localhost:2527 "EMAIL_FROM=Hypest <support@hypestapp.com>" APP_BASE_URL=http://localhost:5199 JOBS_TOKEN=check-jobs-token-0123456789abcdef0123 DDG_STATS_KEY=check-ddg-key-0123456789abcdef0123456

step "coach smoke test";      bash scripts/coach-smoke.sh http://localhost:8099/api

export ACCOUNT_CHECK_API=http://localhost:8099/api BILLING_CHECK_API=http://localhost:8098/api BILLING_CHECK_WHSEC=whsec_check_dummy
export AI_CHECK_API=http://localhost:8096/api AI_CHECK_FAKE_PORT=8097
export PASSWORD_CHECK_API=http://localhost:8095/api PASSWORD_CHECK_SMTP_PORT=2525
export OPS_CHECK_API=http://localhost:8094/api OPS_CHECK_HOOK_PORT=2526 OPS_CHECK_ADMIN=owner-check@example.test
export REMINDERS_CHECK_API=http://localhost:8093/api REMINDERS_CHECK_SMTP_PORT=2527 REMINDERS_CHECK_TOKEN=check-jobs-token-0123456789abcdef0123
export DDG_CHECK_API=http://localhost:8093/api DDG_CHECK_KEY=check-ddg-key-0123456789abcdef0123456
for f in $(find artifacts lib -name '*.check.ts' -not -path '*/node_modules/*' | sort); do
  step "$f";                  pnpm --filter @workspace/scripts exec tsx "../$f"
done

if grep -h '"level":50' "$LOGS"/api-*.log; then echo "API logged errors (above)"; exit 1; fi
echo; echo "ALL CHECKS PASSED"
