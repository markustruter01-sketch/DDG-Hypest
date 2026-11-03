#!/bin/bash
# API smoke test. Run against a LOCAL or dev API only (it creates users).
# Usage: bash scripts/api-smoke.sh [base-url]   (default http://localhost:8099/api, needs an empty database)
B=${1:-http://localhost:8099/api}; A=$(mktemp); C=$(mktemp); L=$(mktemp)
r(){ local jar=$1; shift; local m=$1; shift; local p=$1; shift; printf '%-44s ' "$m $p"; curl -s -o /tmp/body -w '%{http_code} ' -b $jar -c $jar -X $m -H 'content-type: application/json' "$B$p" "$@"; head -c 220 /tmp/body; echo; }
echo "== auth"
r $A POST /auth/signup -d '{"email":"Ann@Test.com","password":"short","display_name":"Ann","adult_confirmed":true}'
r $A POST /auth/signup -d '{"email":"Ann@Test.com","password":"longenough1","display_name":"Ann","adult_confirmed":false}'
r $A POST /auth/signup -d '{"email":"Ann@Test.com","password":"longenough1","display_name":"Ann","adult_confirmed":true,"is_admin":true}'
r $A POST /auth/signup -d '{"email":"Ann@Test.com","password":"longenough1","display_name":"Ann","adult_confirmed":true}'
r $A POST /auth/signup -d '{"email":"ann@test.com","password":"longenough1","display_name":"Ann2","adult_confirmed":true}'
r $A GET /auth/me
r $C POST /auth/signup -d '{"email":"bob@test.com","password":"longenough2","display_name":"Bob","adult_confirmed":true}'
echo "== profile (expect: 200, 400 bio is gone, 400 bad link name, 409 reserved)"
r $A PATCH /auth/me -d '{"display_name":"Ann B"}'
r $A PATCH /auth/me -d '{"bio":"PT from Brisbane"}'
r $A PATCH /auth/me -d '{"handle":"Bad Name"}'
r $A PATCH /auth/me -d '{"handle":"hypest"}'
echo "== logout"
r $A POST /auth/logout
r $A GET /auth/me
echo "== rate limit"
for i in $(seq 1 10); do curl -s -o /dev/null -X POST -H 'content-type: application/json' $B/auth/login -d '{"email":"bob@test.com","password":"wrongwrong"}'; done
r $L POST /auth/login -d '{"email":"bob@test.com","password":"longenough2"}'
echo "== config"
r $L GET /config
