#!/bin/bash
# AI-coach flow check. Run against a LOCAL API started with NODE_ENV=development DEV_AUTO_LOGIN=1 on a fresh database.
B=${1:-http://localhost:8099/api}; J=$(mktemp)
FAIL=0; BODY=$(mktemp)
# r EXPECTED METHOD PATH [curl args]: prints the result; a different status code fails the run.
r(){ local want=$1; shift; local m=$1; shift; local p=$1; shift; local got
  got=$(curl -s -o $BODY -w '%{http_code}' -b $J -c $J -X $m -H 'content-type: application/json' "$B$p" "$@")
  printf '%-4s %-40s %s ' "$([ "$got" = "$want" ] && echo ok || echo FAIL)" "$m $p" "$got"; head -c 150 $BODY; echo
  [ "$got" = "$want" ] || FAIL=1; }
# Health check: one "no" per question the server publishes in /config (coaching/screening.ts is the source).
NO=$(curl -s $B/config | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).screening.questions.map(()=>false))))')
A='{"coach_id":"rex","goal":"muscle","experience":"beginner","days_per_week":3,"minutes":45,"equipment":["dumbbells"],"avoid_areas":[],"health_accepted":true,"screening":{"answers":'$NO',"cleared":false}}'
echo "== public"
r 200 GET /coaches
r 200 POST /coaching/preview -d "$A"
r 400 POST /coaching/preview -d '{"coach_id":"mara","goal":"strength","experience":"beginner","days_per_week":3,"minutes":45,"equipment":[],"avoid_areas":[],"health_accepted":true}'
echo "== member (dev auto-login), Free: first block, week 1 open (spec 3.1 §1)"
r 200 GET /me/training
r 200 PUT /me/training/profile -d "$A"
r 201 POST /me/plans
r 201 POST /me/plans
ITEM=$(curl -s -b $J $B/me/training | grep -o '"items":\[{"id":[0-9]*' | head -1 | grep -o '[0-9]*$')
SESS=$(curl -s -b $J $B/me/training | grep -o '"sessions":\[{"id":[0-9]*' | head -1 | grep -o '[0-9]*$')
curl -s -b $J $B/me/training | grep -q '"access":"week1"' || { echo "FAIL Free plan should be week1"; FAIL=1; }
r 200 PUT /me/items/$ITEM/sets/1 -d '{"reps":10,"seconds":null,"load_kg":20}'
r 402 POST /me/plans
r 402 POST /me/plans/next
r 200 POST /me/items/$ITEM/hurts -d '{"text":"my knee aches a bit"}'
echo "== safety stop on any tier, then resume"
r 200 POST /me/items/$ITEM/hurts -d '{"text":"sharp pain in my knee"}'
r 400 POST /me/plans/resume -d '{"acknowledged":false,"note":"x"}'
r 400 POST /me/plans/resume
r 200 POST /me/plans/resume -d '{"acknowledged":true,"note":"Physio cleared me"}'
echo "== training talk does not pause (word boundaries, exercise names)"
r 200 POST /me/items/$ITEM/hurts -d '{"text":"chest press felt great, popular gym"}'
r 409 POST /me/plans/resume -d '{"acknowledged":true,"note":"not paused"}'
echo "== tier 2: logging, swap, complete, progress, next block with loads"
r 200 POST /dev/unlock -d '{"kind":"tier2"}'
r 200 PUT /me/items/$ITEM/sets/1 -d '{"reps":10,"seconds":null,"load_kg":20}'
r 400 PUT /me/items/$ITEM/sets/9 -d '{"reps":10,"seconds":null,"load_kg":20}'
r 200 POST /me/items/$ITEM/hurts -d '{"text":"knee feels sore","area":"knee"}'
r 200 POST /me/sessions/$SESS/complete
r 200 GET /me/progress
r 201 POST /me/plans/next
echo "== units: lb shown, kg stored"
r 200 PUT /me/training/units -d '{"units":"lb"}'
r 400 PUT /me/training/units -d '{"units":"stone"}'
r 200 PUT /me/training/units -d '{"units":"kg"}'
echo "== past blocks: block 1 listed after moving to block 2"
r 200 GET /me/plans/history
grep -q '"block":1,' $BODY && ! grep -q '"block":2,' $BODY || { echo "FAIL history should list block 1 only"; FAIL=1; }
[ $FAIL = 0 ] && echo "coach smoke: all as expected" || { echo "coach smoke: FAILED"; exit 1; }
