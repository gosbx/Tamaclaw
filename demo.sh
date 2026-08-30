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

post /say       '{"text":"Hola, soy Tamaclaw. Estoy revisando tus métricas.","mood":"happy"}'

post /dashboard '{"widget":"ventas_hoy","chart":"bar","title":"Ventas de hoy","pin":true,
                  "data":[{"label":"09h","value":12},{"label":"11h","value":31},{"label":"13h","value":26},
                          {"label":"15h","value":44},{"label":"17h","value":38}]}'
sleep 3

post /dashboard '{"widget":"latencia","chart":"line","title":"Latencia API (ms)","ttl":60000,
                  "data":{"labels":["lun","mar","mié","jue","vie"],
                          "series":[{"label":"p50","values":[120,115,130,110,105]},
                                    {"label":"p99","values":[340,360,390,320,300]}]}}'

post /notify    '{"title":"PR aprobado","body":"kushki-core #142 listo para merge","level":"info"}'
sleep 4

post /notify    '{"title":"Disco al 85%","body":"El volumen de datos crece rápido","level":"warning"}'
sleep 3

post /say       '{"text":"Todo en orden. Sigo atento por aquí."}'
post /notify    '{"title":"Demo: alerta crítica","body":"Esto interrumpe el audio en curso","level":"critical"}'
sleep 3

post /mood      '{"value":"happy"}'
sleep 2

# tarjeta de contenido: la mascota se hace a un lado
post /show '{"icon":"📧","title":"Resumen de inbox","source":"Gmail",
             "body":"1. Contrato listo para firma\n2. Cierre de mes pendiente\n3. RFC esperando tu review",
             "say":"Tienes tres correos importantes, te los dejo en pantalla","ttl":12000}'
sleep 12

# tour de mascotas
for skin in pixa mochi holo nebula; do
  post /skin "{\"value\":\"$skin\"}"
  sleep 2
done

echo "== done =="
