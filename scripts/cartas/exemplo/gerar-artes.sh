#!/usr/bin/env bash
# Artes PROVISÓRIAS das 24 colecionáveis de teste (cartas-teste.csv): um degradê nas
# cores do NIKS por carta, 600×840 (proporção da carta). Só para desenvolvimento — a
# arte de verdade substitui pelo mesmo nome de arquivo e reimporta.
#
#   bash scripts/cartas/exemplo/gerar-artes.sh <pasta-de-saida>
#   SUPABASE_SERVICE_ROLE_KEY=… node scripts/cartas/importar.mjs scripts/cartas/exemplo/cartas-teste.csv <pasta-de-saida>
set -euo pipefail
OUT="${1:?pasta de saída}"
mkdir -p "$OUT"
CORES=(FFE1EE:FF5EA8 FBCDE5:EBD6FB FFD9EA:F24F9C EBD6FB:FF86C1 FFC2DB:D9B8FF FF8CC0:FFE1EE)
i=0
grep -o 'teste-[a-z0-9-]*\.png' "$(dirname "$0")/cartas-teste.csv" | while read -r arq; do
  par="${CORES[$((i % ${#CORES[@]}))]}"
  ffmpeg -loglevel error -y -f lavfi -i "gradients=s=600x840:c0=0x${par%%:*}:c1=0x${par##*:}:x0=0:y0=0:x1=600:y1=840:d=1" -frames:v 1 "$OUT/$arq"
  i=$((i + 1))
done
echo "Artes em $OUT"
