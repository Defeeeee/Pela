#!/usr/bin/env bash
# Arranca (o reinicia) el entrenamiento de los bots de escapecv y su panel.
#
# Va como script y no como una línea de ssh a propósito: un `pkill -f aprendiz`
# escrito directo en el comando de ssh coincide con la propia línea de comandos
# remota y se mata a sí mismo antes de hacer nada.
set -u

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PY:-$HOME/pela-entrenamiento/venv/bin/python}"
PUERTO="${PUERTO:-8421}"

# Este entorno da ~460.000 transiciones por segundo por core, trece veces el del
# Agarrá, así que la GPU es el cuello desde el primer paso y no la simulación.
# Por eso: pocos workers, muchas salas por worker y minilotes grandes.
WORKERS="${WORKERS:-4}"
SALAS="${SALAS:-64}"
AGENTES="${AGENTES:-4}"
ROLLOUT="${ROLLOUT:-32}"
EPOCAS="${EPOCAS:-6}"
ANCHO="${ANCHO:-1024}"
MINILOTE="${MINILOTE:-32768}"
LIMPIAR="${LIMPIAR:-0}"

cd "$RAIZ" || exit 1
mkdir -p entrenamiento-escape/estado registros

# Se apaga por nombre de archivo del proceso y no por una cadena que pueda estar
# en la línea de comandos de quien lanza esto.
for patron in "entrenamiento-escape/aprendiz.py" "entrenamiento-escape/actor.js" "entrenamiento-escape/panel.js"; do
  pgrep -f "$patron" | while read -r pid; do
    [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null
  done
done
sleep 2
for patron in "entrenamiento-escape/aprendiz.py" "entrenamiento-escape/actor.js"; do
  pgrep -f "$patron" | while read -r pid; do kill -9 "$pid" 2>/dev/null; done
done

if [ "$LIMPIAR" = "1" ]; then
  # Nunca se borra una política: se archiva. Cambiar la recompensa obliga a
  # empezar de cero, pero la política vieja sigue siendo la mejor jugadora que
  # existe para el objetivo con el que fue entrenada. Ya se perdió una así.
  if [ -f entrenamiento-escape/estado/politica.pt ]; then
    DEST="entrenamiento-escape/versiones/auto-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$DEST"
    mv entrenamiento-escape/estado/politica.pt "$DEST/politica.pt"
    [ -f entrenamiento-escape/estado/mejor.pt ] && cp entrenamiento-escape/estado/mejor.pt "$DEST/mejor.pt"
    [ -f entrenamiento-escape/estado/metricas.jsonl ] && mv entrenamiento-escape/estado/metricas.jsonl "$DEST/metricas.jsonl"
    echo "[arrancar] política anterior archivada en $DEST"
  fi
  rm -f entrenamiento-escape/estado/metricas.jsonl
fi

nohup "$PY" entrenamiento-escape/aprendiz.py \
  --workers "$WORKERS" --salas "$SALAS" --agentes "$AGENTES" \
  --rollout "$ROLLOUT" --epocas "$EPOCAS" --ancho "$ANCHO" \
  --minilote "$MINILOTE" > registros/aprendiz-escape.log 2>&1 &
echo "[arrancar] aprendiz pid $!"

sleep 2
PUERTO="$PUERTO" nohup node entrenamiento-escape/panel.js > registros/panel-escape.log 2>&1 &
echo "[arrancar] panel  pid $!  en el puerto $PUERTO"
