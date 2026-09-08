#!/usr/bin/env bash
# Arranca (o reinicia) el entrenamiento y el panel en la máquina de entrenamiento.
#
# Va como script y no como una línea de ssh a propósito: un `pkill -f aprendiz.py`
# escrito directo en el comando de ssh coincide con la propia línea de comandos
# remota y se mata a sí mismo antes de hacer nada.
set -u

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PY:-$HOME/pela-entrenamiento/venv/bin/python}"
PUERTO="${PUERTO:-8420}"

WORKERS="${WORKERS:-8}"
ARENAS="${ARENAS:-96}"
AGENTES="${AGENTES:-4}"
ROLLOUT="${ROLLOUT:-32}"
EPOCAS="${EPOCAS:-6}"
ANCHO="${ANCHO:-1024}"
MINILOTE="${MINILOTE:-32768}"
LIMPIAR="${LIMPIAR:-0}"

cd "$RAIZ" || exit 1
mkdir -p entrenamiento/estado registros

# Se apaga por nombre de archivo del proceso, no por una cadena que pueda estar
# en la línea de comandos de quien lanza esto.
for patron in "entrenamiento/aprendiz.py" "entrenamiento/actor.js" "entrenamiento/panel.js"; do
  pgrep -f "$patron" | while read -r pid; do
    [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null
  done
done
sleep 2
for patron in "entrenamiento/aprendiz.py" "entrenamiento/actor.js"; do
  pgrep -f "$patron" | while read -r pid; do kill -9 "$pid" 2>/dev/null; done
done

if [ "$LIMPIAR" = "1" ]; then
  # Nunca se borra una política: se archiva. Cambiar la recompensa obliga a
  # empezar de cero, pero la política vieja sigue siendo la mejor jugadora que
  # existe para el objetivo con el que fue entrenada, y sirve de rival de
  # referencia. Ya se perdió una así.
  if [ -f entrenamiento/estado/politica.pt ]; then
    DEST="entrenamiento/versiones/auto-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$DEST"
    mv entrenamiento/estado/politica.pt "$DEST/politica.pt"
    [ -f entrenamiento/estado/metricas.jsonl ] && mv entrenamiento/estado/metricas.jsonl "$DEST/metricas.jsonl"
    echo "[arrancar] política anterior archivada en $DEST"
  fi
  rm -f entrenamiento/estado/metricas.jsonl
fi

nohup "$PY" entrenamiento/aprendiz.py \
  --workers "$WORKERS" --arenas "$ARENAS" --agentes "$AGENTES" \
  --rollout "$ROLLOUT" --epocas "$EPOCAS" --ancho "$ANCHO" \
  --minilote "$MINILOTE" > registros/aprendiz.log 2>&1 &
echo "[arrancar] aprendiz pid $!"

sleep 2
PUERTO="$PUERTO" nohup node entrenamiento/panel.js > registros/panel.log 2>&1 &
echo "[arrancar] panel  pid $!  en el puerto $PUERTO"
