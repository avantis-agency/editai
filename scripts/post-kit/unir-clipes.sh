#!/usr/bin/env bash
# unir-clipes.sh — une N clipes (e um end-card opcional) num vídeo só, normalizando v+a.
# Uso: unir-clipes.sh <saida.mp4> <clipeA.mp4> <clipeB.mp4> [clipeC.mp4 ...] [--endcard card.png[:segundos]]
# Ex.: unir-clipes.sh final.mp4 a.mp4 b.mp4 --endcard endcard.png:3
# Normaliza tudo p/ 720x1280 @30fps, áudio 48k stereo (evita falha/dessync no concat).
set -euo pipefail

OUT="${1:?uso: unir-clipes.sh <saida.mp4> <clipe...> [--endcard png[:seg]]}"; shift
W=720; H=1280; FPS=30
CARD=""; CARD_SEC=3
CLIPS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --endcard) shift; CARD="${1%%:*}"; [[ "$1" == *:* ]] && CARD_SEC="${1##*:}";;
    *) CLIPS+=("$1");;
  esac; shift
done
[ "${#CLIPS[@]}" -ge 1 ] || { echo "✗ informe ao menos 1 clipe" >&2; exit 1; }

INPUTS=(); FILTER=""; PARTS=""; n=0
for c in "${CLIPS[@]}"; do
  [ -f "$c" ] || { echo "✗ clipe não encontrado: $c" >&2; exit 1; }
  INPUTS+=(-i "$c")
  FILTER+="[${n}:v]scale=${W}:${H},setsar=1,fps=${FPS}[v${n}];[${n}:a]aresample=48000,aformat=channel_layouts=stereo[a${n}];"
  PARTS+="[v${n}][a${n}]"
  n=$((n+1))
done
if [ -n "$CARD" ]; then
  [ -f "$CARD" ] || { echo "✗ end-card não encontrado: $CARD" >&2; exit 1; }
  INPUTS+=(-loop 1 -t "$CARD_SEC" -i "$CARD")           # vídeo do card (input n)
  INPUTS+=(-f lavfi -t "$CARD_SEC" -i anullsrc=r=48000:cl=stereo)  # áudio silêncio (input n+1)
  FILTER+="[${n}:v]scale=${W}:${H},setsar=1,fps=${FPS}[v${n}];"
  PARTS+="[v${n}][$((n+1)):a]"
  n=$((n+1))
fi
TOTAL=$(( n ))   # nº de segmentos no concat (clipes + card, se houver)

ffmpeg -y "${INPUTS[@]}" \
  -filter_complex "${FILTER}${PARTS}concat=n=${TOTAL}:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 20 -preset fast -pix_fmt yuv420p -c:a aac -b:a 160k \
  "$OUT" -loglevel error

echo "✅ $OUT  ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s, ${#CLIPS[@]} clipe(s)${CARD:+ + end-card})"
