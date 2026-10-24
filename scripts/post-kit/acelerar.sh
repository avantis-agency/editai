#!/usr/bin/env bash
# acelerar.sh — acelera um vídeo (vídeo + áudio) preservando o tom da voz.
# Uso: acelerar.sh <entrada.mp4> [fator] [saida.mp4]
#   fator  default 1.5  (faixa segura ~1.2–2.0; acima de ~2.0 prefira rubberband)
# Por quê por fora: acelerar aqui MANTÉM todas as sílabas (só comprime o tempo).
# Mandar a IA "falar rápido" na geração APAGA sílabas — NÃO faça isso. Gere calmo, acelere aqui.
set -euo pipefail

IN="${1:?uso: acelerar.sh <entrada.mp4> [fator] [saida.mp4]}"
FACTOR="${2:-1.5}"
OUT="${3:-${IN%.*}-${FACTOR}x.mp4}"
[ -f "$IN" ] || { echo "✗ não encontrado: $IN" >&2; exit 1; }

# setpts divide o tempo do vídeo; atempo acelera o áudio preservando pitch.
ffmpeg -y -i "$IN" \
  -filter_complex "[0:v]setpts=PTS/${FACTOR}[v];[0:a]atempo=${FACTOR}[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 20 -preset fast -pix_fmt yuv420p -c:a aac -b:a 160k \
  "$OUT" -loglevel error

DUR_IN=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
DUR_OUT=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
echo "✅ $OUT  (${DUR_IN}s → ${DUR_OUT}s, ${FACTOR}×)"
