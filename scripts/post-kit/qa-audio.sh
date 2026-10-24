#!/usr/bin/env bash
# qa-audio.sh — QA de áudio de um ad: detecta cortes (silêncio) e transcreve a fala.
# Uso: qa-audio.sh <video.mp4> [idioma] [modelo_whisper]
#   idioma         default: Portuguese
#   modelo_whisper default: medium  (NUNCA use small — inventa erros que não existem no áudio)
# Saída: dimensão/duração, silêncios suspeitos (>0.4s) e a transcrição.
set -euo pipefail

VIDEO="${1:?uso: qa-audio.sh <video.mp4> [idioma] [modelo]}"
LANG_="${2:-Portuguese}"
MODEL="${3:-medium}"
[ -f "$VIDEO" ] || { echo "✗ arquivo não encontrado: $VIDEO" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "✗ ffmpeg ausente" >&2; exit 1; }
command -v whisper >/dev/null || { echo "✗ whisper ausente (pip install -U openai-whisper)" >&2; exit 1; }

WAV="$(mktemp -t qaaudio).wav"
OUTDIR="$(mktemp -d)"
trap 'rm -f "$WAV"' EXIT

echo "== Vídeo =="
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration \
  -of default=nw=1 "$VIDEO" 2>/dev/null || true

ffmpeg -y -i "$VIDEO" -ac 1 -ar 16000 "$WAV" -loglevel error

echo ""; echo "== Silêncios (>0.4s — buraco no meio = corte) =="
ffmpeg -i "$WAV" -af silencedetect=n=-35dB:d=0.4 -f null - 2>&1 \
  | grep -E 'silence_(start|end)' || echo "  nenhum silêncio longo ✅"

echo ""; echo "== Transcrição (whisper $MODEL) — confira pronúncia de siglas/termos técnicos =="
whisper "$WAV" --language "$LANG_" --model "$MODEL" --output_format txt --output_dir "$OUTDIR" --verbose False >/dev/null 2>&1
cat "$OUTDIR"/*.txt
echo ""
echo "Dica: sílaba engolida em PT (síndico→singta, laudo→lau) = pediram voz RÁPIDA na geração."
echo "      Regenere com dicção CALMA/CLARA e acelere por fora (acelerar.sh). Palavra teimosa → respelling fonético."
