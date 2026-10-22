#!/usr/bin/env bash
# End-to-end API test through the gateway: auth, RBAC, CRUD, business rules, load balancing.
# Usage:  bash deploy/smoke-test.sh [GATEWAY_URL]      (default http://localhost:3000)
# Needs: curl and python3. Set ADMIN_CODE if it differs from EVM-ADMIN-2026.
set -u
GW="${1:-http://localhost:3000}"
ADMIN_CODE="${ADMIN_CODE:-EVM-ADMIN-2026}"
S=$(date +%s)
PASS=0; FAIL=0; CODE=""; BODY=""
TMP=$(mktemp)

req() { # method path [token] [json-body]
  local args=(-s -o "$TMP" -w '%{http_code}' -X "$1" "$GW$2" -H 'Content-Type: application/json')
  [ -n "${3:-}" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "${4:-}" ] && args+=(-d "$4")
  CODE=$(curl "${args[@]}"); BODY=$(cat "$TMP")
}
jget() { python3 -c 'import sys,json
d=json.load(sys.stdin)
for k in sys.argv[1].split("."): d=d[k]
print(d)' "$1" <<<"$BODY" 2>/dev/null; }
check() { # name expected-code
  if [ "$CODE" = "$2" ]; then echo "PASS  $1 ($CODE)"; PASS=$((PASS+1))
  else echo "FAIL  $1 expected $2 got $CODE: $BODY"; FAIL=$((FAIL+1)); fi
}

AEMAIL="admin$S@evm.com"; VEMAIL="dara$S@evm.com"; LEMAIL="lina$S@evm.com"

echo "--- Registration and login"
req POST /api/register "" "{\"name\":\"Sokha Admin\",\"email\":\"$AEMAIL\",\"password\":\"Admin@123\",\"role\":\"ADMIN\",\"adminCode\":\"$ADMIN_CODE\"}"; check "Register ADMIN" 201
req POST /api/register "" "{\"name\":\"Dara Volunteer\",\"email\":\"$VEMAIL\",\"password\":\"Volunteer@123\",\"role\":\"VOLUNTEER\"}"; check "Register VOLUNTEER" 201
req POST /api/register "" "{\"name\":\"Lina Volunteer\",\"email\":\"$LEMAIL\",\"password\":\"Volunteer@123\",\"role\":\"VOLUNTEER\"}"; check "Register second VOLUNTEER" 201
req POST /api/register "" "{\"name\":\"Sokha Admin\",\"email\":\"$AEMAIL\",\"password\":\"Admin@123\",\"role\":\"VOLUNTEER\"}"; check "Duplicate email rejected" 409
req POST /api/register "" "{\"name\":\"Bad Admin\",\"email\":\"bad$S@evm.com\",\"password\":\"Admin@123\",\"role\":\"ADMIN\",\"adminCode\":\"WRONG\"}"; check "ADMIN with wrong code rejected" 403
req POST /api/login "" "{\"email\":\"$AEMAIL\",\"password\":\"Admin@123\"}"; check "Login ADMIN" 200; AT=$(jget token)
req POST /api/login "" "{\"email\":\"$VEMAIL\",\"password\":\"Volunteer@123\"}"; check "Login VOLUNTEER" 200; VT=$(jget token); VID=$(jget user.id)
req POST /api/login "" "{\"email\":\"$LEMAIL\",\"password\":\"Volunteer@123\"}"; check "Login second VOLUNTEER" 200; LT=$(jget token)
req POST /api/login "" "{\"email\":\"$AEMAIL\",\"password\":\"WrongPass1\"}"; check "Wrong password" 401
req POST /api/login "" "{}"; check "Missing fields" 400
req GET /api/login/me "$AT"; check "Profile from database" 200

echo "--- Gateway JWT checks"
req GET /api/events; check "No token" 401
req GET /api/events "abc.def.ghi"; check "Invalid token" 401
req GET /api/events "${AT%?}X"; check "Tampered token" 401

echo "--- Role based access"
req GET /api/register/users "$AT"; check "ADMIN lists users" 200
req GET /api/register/users "$VT"; check "VOLUNTEER cannot list users" 403
req POST /api/events "$VT" '{"title":"x","date":"2026-12-06T07:00:00Z","venueName":"v","city":"c"}'; check "VOLUNTEER cannot create event" 403
req GET /api/assignments/my "$AT"; check "ADMIN cannot use VOLUNTEER API" 403

echo "--- Events CRUD"
req POST /api/events "$AT" '{"title":"Angkor Charity Run","description":"5 km charity run","date":"2026-12-06T07:00:00Z","venueName":"Olympic Hall","venueAddress":"Street 242, Chamkarmon","city":"Phnom Penh","volunteersNeeded":20}'; check "Create event" 201; EID=$(jget event._id)
req GET /api/events "$VT"; check "List events (VOLUNTEER)" 200
req GET "/api/events?status=UPCOMING" "$AT"; check "Filter by status" 200
req GET "/api/events/$EID" "$AT"; check "Get one event" 200
req GET /api/events/123 "$AT"; check "Invalid id format" 400
req PUT "/api/events/$EID" "$AT" '{"volunteersNeeded":30,"status":"ONGOING"}'; check "Update event" 200

echo "--- Assignments (inter-service call to event-service)"
req POST /api/assignments "$AT" "{\"eventId\":\"$EID\",\"volunteerId\":\"$VID\",\"task\":\"First aid tent\"}"; check "Assign volunteer" 201; AID=$(jget assignment._id)
req POST /api/assignments "$AT" "{\"eventId\":\"$EID\",\"volunteerId\":\"$VID\",\"task\":\"First aid tent\"}"; check "Same volunteer twice" 409
req POST /api/assignments "$AT" "{\"eventId\":\"000000000000000000000000\",\"volunteerId\":\"$VID\",\"task\":\"x\"}"; check "Event does not exist" 404
req POST /api/assignments "$VT" "{\"eventId\":\"$EID\",\"volunteerId\":\"$VID\",\"task\":\"x\"}"; check "VOLUNTEER cannot assign" 403
req GET /api/assignments "$AT"; check "List assignments (ADMIN)" 200
req GET /api/assignments/my "$VT"; check "List own assignments" 200
req PATCH "/api/assignments/$AID/respond" "$LT" '{"decision":"ACCEPTED"}'; check "Another volunteer cannot answer" 403
req PATCH "/api/assignments/$AID/respond" "$VT" '{"decision":"ACCEPTED"}'; check "Accept assignment" 200
req PATCH "/api/assignments/$AID/respond" "$VT" '{"decision":"ACCEPTED"}'; check "Answer a finished assignment" 409
req PATCH "/api/assignments/$AID/complete" "$AT" '{"hoursWorked":6}'; check "Complete assignment" 200
req DELETE "/api/events/$EID" "$AT"; check "Delete event" 200

echo "--- Load balancing (four calls, instance should alternate)"
for i in 1 2 3 4; do
  req GET /api/events/health "$AT"
  echo "call $i -> $(echo "$BODY" | grep -o '"instance":"[^"]*"')"
done

rm -f "$TMP"
echo; echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
