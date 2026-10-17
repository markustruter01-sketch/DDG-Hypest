#!/bin/bash
# AI-coach flow check. Run against a LOCAL API started with NODE_ENV=development DEV_AUTO_LOGIN=1 on a fresh database.
B=${1:-http://localhost:8099/api}; J=$(mktemp)
r(){ local m=$1; shift; local p=$1; shift; printf '%-40s ' "$m $p"; curl -s -o /tmp/cbody -w '%{http_code} ' -b $J -c $J -X $m -H 'content-type: application/json' "$B$p" "$@"; head -c 170 /tmp/cbody; echo; }
A='{"coach_id":"rex","goal":"muscle","experience":"beginner","days_per_week":3,"minutes":45,"equipment":["dumbbells"],"avoid_areas":[],"health_accepted":true}'
echo "== public"
r GET /coaches
r POST /coaching/preview -d "$A"
r POST /coaching/preview -d '{"coach_id":"mara","goal":"strength","experience":"beginner","days_per_week":3,"minutes":45,"equipment":[],"avoid_areas":[],"health_accepted":true}'
echo "== member (dev auto-login), no purchase -> 402"
r GET /me/training
r PUT /me/training/profile -d "$A"
r POST /me/plans
echo "== intro plan unlock -> plan; logging needs tier 2"
r POST /dev/unlock -d '{"kind":"intro_plan"}'
r POST /dev/unlock -d '{"kind":"intro_plan"}'
r POST /me/plans
r POST /me/plans
ITEM=$(curl -s -b $J $B/me/training | grep -o '"items":\[{"id":[0-9]*' | head -1 | grep -o '[0-9]*$')
SESS=$(curl -s -b $J $B/me/training | grep -o '"sessions":\[{"id":[0-9]*' | head -1 | grep -o '[0-9]*$')
r PUT /me/items/$ITEM/sets/1 -d '{"reps":10,"seconds":null,"load_kg":20}'
r POST /me/items/$ITEM/hurts -d '{"text":"my knee aches a bit"}'
echo "== safety stop on any tier, then resume"
r POST /me/items/$ITEM/hurts -d '{"text":"sharp pain in my knee"}'
r POST /me/plans/resume
echo "== tier 2: logging, swap, complete, progress, next block with loads"
r POST /dev/unlock -d '{"kind":"tier2"}'
r PUT /me/items/$ITEM/sets/1 -d '{"reps":10,"seconds":null,"load_kg":20}'
r PUT /me/items/$ITEM/sets/9 -d '{"reps":10,"seconds":null,"load_kg":20}'
r POST /me/items/$ITEM/hurts -d '{"text":"knee feels sore","area":"knee"}'
r POST /me/sessions/$SESS/complete
r GET /me/progress
r POST /me/plans/next
