#!/usr/bin/env bash
# Fire a little show of example events at the bridge.
# Usage: ./demo.sh [port]
set -euo pipefail

PORT="${1:-${TAMACLAW_PORT:-4321}}"
BASE="http://localhost:$PORT"

post() {
  local path="$1" body="$2"
  echo "→ POST $path  $body"
  curl -sS -X POST "$BASE$path" -H 'content-type: application/json' -d "$body"
  echo
}

echo "== Tamaclaw demo against $BASE =="
curl -sSf "$BASE/health" >/dev/null || {
  echo "bridge is not running — start it with: npm run dev"
  exit 1
}

post /mood      '{"value":"thinking"}'
sleep 2

post /say       '{"text":"Hello, I am Tamaclaw. I am checking your metrics.","mood":"happy"}'

post /dashboard '{"widget":"sales_today","chart":"bar","title":"Today'"'"'s Sales","pin":true,
                  "data":[{"label":"09h","value":12},{"label":"11h","value":31},{"label":"13h","value":26},
                          {"label":"15h","value":44},{"label":"17h","value":38}]}'
sleep 3

post /dashboard '{"widget":"latency","chart":"line","title":"API Latency (ms)","ttl":60000,
                  "data":{"labels":["Mon","Tue","Wed","Thu","Fri"],
                          "series":[{"label":"p50","values":[120,115,130,110,105]},
                                    {"label":"p99","values":[340,360,390,320,300]}]}}'

post /notify    '{"title":"PR approved","body":"kushki-core #142 ready to merge","level":"info"}'
sleep 4

post /notify    '{"title":"Disk at 85%","body":"The data volume is growing fast","level":"warning"}'
sleep 3

post /say       '{"text":"Everything is in order. I will keep watching."}'
post /notify    '{"title":"Demo: critical alert","body":"This interrupts current audio","level":"critical"}'
sleep 3

post /mood      '{"value":"happy"}'
sleep 2

# content card: the pet steps aside
post /show '{"icon":"📧","title":"Inbox summary","source":"Gmail",
             "body":"1. Contract ready to sign\n2. Month-end close pending\n3. RFC awaiting your review",
             "say":"You have three important emails, showing them on screen","ttl":12000}'
sleep 12

# pet tour
for skin in pixa mochi holo nebula; do
  post /skin "{\"value\":\"$skin\"}"
  sleep 2
done

echo "== done =="
