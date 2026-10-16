#!/bin/bash
# Dev-tools check. Run against a LOCAL API started with NODE_ENV=development DEV_AUTO_LOGIN=1, after api-smoke.sh.
B=${1:-http://localhost:8099/api}; V=$(mktemp); O=$(mktemp)
r(){ local jar=$1; shift; local m=$1; shift; local p=$1; shift; printf '%-44s ' "$m $p"; curl -s -o /tmp/body -w '%{http_code} ' -b $jar -c $jar -X $m -H 'content-type: application/json' "$B$p" "$@"; head -c 200 /tmp/body; echo; }
P=$(curl -s "$B/programs?creator=ann_pt" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "== config says dev tools on"
r $O GET /config
echo "== buyer via ann's link -> creator_brought 1000; buyer without link -> hypest_found 2000"
r $V POST /creators/ann_pt/visit
r $V POST /auth/signup -d '{"email":"via-'$RANDOM$RANDOM'@test.com","password":"longenough5","display_name":"Via","adult_confirmed":true}'
r $V POST /programs/$P/test-purchase
r $V POST /programs/$P/test-purchase
r $V GET /library
printf 'buyer sees lessons: '; curl -s -b $V $B/library/$P | grep -o '"lessons":\[{"id"' ; echo
r $O POST /auth/signup -d '{"email":"organic-'$RANDOM$RANDOM'@test.com","password":"longenough6","display_name":"Org","adult_confirmed":true}'
r $O POST /programs/$P/test-purchase
echo "== creator cannot buy own"
A=$(mktemp); r $A POST /auth/login -d '{"email":"ann@test.com","password":"longenough1"}' >/dev/null
r $A POST /programs/$P/test-purchase
