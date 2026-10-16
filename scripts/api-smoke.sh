#!/bin/bash
# API smoke test. Run against a LOCAL or dev API only (it creates users and programs).
# Usage: bash scripts/api-smoke.sh [base-url]   (default http://localhost:8099/api, needs an empty database)
B=${1:-http://localhost:8099/api}; A=$(mktemp); C=$(mktemp)
r(){ local jar=$1; shift; local m=$1; shift; local p=$1; shift; printf '%-44s ' "$m $p"; curl -s -o /tmp/body -w '%{http_code} ' -b $jar -c $jar -X $m -H 'content-type: application/json' "$B$p" "$@"; head -c 220 /tmp/body; echo; }
echo "== auth"
r $A POST /auth/signup -d '{"email":"Ann@Test.com","password":"short","display_name":"Ann","adult_confirmed":true}'
r $A POST /auth/signup -d '{"email":"Ann@Test.com","password":"longenough1","display_name":"Ann","adult_confirmed":false}'
r $A POST /auth/signup -d '{"email":"Ann@Test.com","password":"longenough1","display_name":"Ann","adult_confirmed":true,"is_admin":true}'
r $A POST /auth/signup -d '{"email":"Ann@Test.com","password":"longenough1","display_name":"Ann","adult_confirmed":true}'
r $A POST /auth/signup -d '{"email":"ann@test.com","password":"longenough1","display_name":"Ann2","adult_confirmed":true}'
r $A GET /auth/me
r $C POST /auth/signup -d '{"email":"bob@test.com","password":"longenough2","display_name":"Bob","adult_confirmed":true}'
r $A PATCH /auth/me -d '{"bio":"PT from Brisbane"}'
echo "== programs (Ann)"
r $A POST /programs -d '{"title":"Leg Day","price_cents":499}'
r $A POST /programs -d '{"title":"Leg Day","description":"Ten weeks","price_cents":999}'
r $A POST /programs/mine/1/publish
r $A POST /programs/mine/1/lessons -d '{"title":"Squats","body":"SECRET-BODY","sets":3,"reps":10,"media_source":"youtube","media_ref":"http://youtube.com/x"}'
r $A POST /programs/mine/1/lessons -d '{"title":"Squats","body":"SECRET-BODY","sets":3,"reps":10,"media_source":"youtube","media_ref":"https://youtu.be/SECRETVID"}'
r $A POST /programs/mine/1/lessons -d '{"title":"Lunges"}'
r $A POST /programs/mine/1/lessons/reorder -d '{"lesson_ids":[2,1]}'
r $A POST /programs/mine/1/publish
echo "== other user / logged out"
r $C GET /programs/mine/1
r $C PATCH /programs/mine/1 -d '{"price_cents":500}'
r $C POST /programs/mine/1/lessons -d '{"title":"hack"}'
r $C DELETE /programs/mine/1/lessons/1
r $C POST /programs/mine/1/unpublish
L=$(mktemp)
r $L GET /programs
r $L GET /programs/1
r $L GET /programs/mine
r $L GET /programs/mine/1
echo "== leak check: any lesson content in public responses?"
curl -s $B/programs $B/programs/1 | grep -cE 'SECRET|Squats|Lunges|youtu' || true
echo "== logout"
r $A POST /auth/logout
r $A GET /auth/me
echo "== rate limit"
for i in $(seq 1 10); do curl -s -o /dev/null -X POST -H 'content-type: application/json' $B/auth/login -d '{"email":"bob@test.com","password":"wrongwrong"}'; done
r $L POST /auth/login -d '{"email":"bob@test.com","password":"longenough2"}'
echo "== delete last lessons of a published program -> unpublished"
r $A POST /auth/login -d '{"email":"ann@test.com","password":"longenough1"}'
r $A DELETE /programs/mine/1/lessons/1
r $L GET /programs/1
r $A DELETE /programs/mine/1/lessons/2
r $L GET /programs/1
r $A GET /programs/mine
echo "== creator links (expect: 400, 409, 200 handle, 409, 409 taken, 200, 404, 1 program, 204 + cookie 1, 204 + cookie 0)"
r $A PATCH /auth/me -d '{"handle":"Bad Name"}'
r $A PATCH /auth/me -d '{"handle":"hypest"}'
r $A PATCH /auth/me -d '{"handle":"ann_pt"}'
r $A PATCH /auth/me -d '{"handle":"ann_pt2"}'
r $C PATCH /auth/me -d '{"handle":"ann_pt"}'
r $L GET /creators/ann_pt
r $L GET /creators/nobody
P=$(curl -s -b $A -c $A -X POST -H 'content-type: application/json' $B/programs -d '{"title":"Hinge Lab","price_cents":900}' | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
r $A POST /programs/mine/$P/lessons -d '{"title":"Hinge"}' >/dev/null; r $A POST /programs/mine/$P/publish >/dev/null
printf 'programs for ann_pt: '; curl -s "$B/programs?creator=ann_pt" | grep -o '"id":' | wc -l
D=$(mktemp)
r $D POST /creators/ann_pt/visit; printf 'visitor cookie: '; grep -c hypest_ref $D
r $A POST /creators/ann_pt/visit; printf 'creator self-visit cookie: '; grep -c hypest_ref $A || true
echo "== logged-in visit saves on the account (check DB: bob referred by ann)"
r $C POST /creators/ann_pt/visit
echo "== signup after a creator link saves the referral on the account (check DB: referred_by_creator_id set for dee@test.com)"
r $D POST /auth/signup -d '{"email":"dee@test.com","password":"longenough4","display_name":"Dee","adult_confirmed":true}'
