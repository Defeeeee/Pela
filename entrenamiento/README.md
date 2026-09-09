# Entrenamiento de los bots de Agarrá.io

Aprendizaje por refuerzo contra **el mismo código que corre en producción**
(`multiplayer-server/agarra.js`). No hay simulador aparte, así que no hay brecha
entre lo que se entrena y lo que se despliega.

## Cómo se arranca

En la máquina de entrenamiento (DefeServer, por Tailscale):

```bash
ssh defee@defeserver
LIMPIAR=1 ~/pela-rl/entrenamiento/arrancar.sh      # de cero
~/pela-rl/entrenamiento/arrancar.sh                # retoma el checkpoint
```

Panel: <http://defeserver:8420> (también sirve `ssh -L 8420:localhost:8420 defee@defeserver`).

Variables: `WORKERS ARENAS AGENTES ROLLOUT EPOCAS ANCHO MINILOTE PUERTO LIMPIAR`.

## Las piezas

| Archivo | Qué hace |
|---|---|
| `observacion.js` | Estado egocéntrico de 158 números: propio + grilla polar de 8 sectores × 3 anillos |
| `acciones.js` | 33 acciones (quieto, 16 rumbos, 16 rumbos con división) y la **máscara de legalidad** |
| `entorno.js` | Muchas arenas por proceso, varios agentes por arena, recompensa y currículum |
| `actor.js` | Worker de simulación; habla protocolo binario por stdin/stdout |
| `aprendiz.py` | PPO en la GPU, con actualización solapada con la recolección |
| `panel.js` / `panel.html` | Panel de métricas y espectador en vivo |
| `medir.js` | Línea de base con política al azar y medición de rendimiento |

## Decisiones que conviene no volver a discutir

- **El reloj de la arena es simulado** (`arena.tiempo`), no `Date.now()`. Con el
  reloj de pared, entrenar a 600x dejaba el enfriamiento de fusión sin vencer
  nunca y el agente aprendía que dividirse era gratis y permanente.
- **Las acciones ilegales se enmascaran, no se castigan.** Dividirse ocupa el 48%
  del espacio de acciones y por debajo de masa 36 no hace nada: cobrar por una
  acción que no cambia el estado no enseña nada, sólo hunde el retorno.
- **Los agentes no son `isBot`.** Marcarlos como bots hacía que la arena los
  reviviera sola a los 2 segundos, así que el episodio no terminaba nunca.
- **Currículum de masa al reaparecer.** Un cuarto de las vidas empieza entre 40 y
  400. Si todas empiezan en 20 y mueren en 25, el tramo del juego donde existe la
  división queda fuera de la experiencia y no se puede aprender.
- **Las arenas se reciclan.** Los bots crecen hasta el techo y una arena vieja es
  una carnicería donde reaparecer con masa 20 no es dificultad, es imposibilidad.
- **La red va en la GPU y la simulación en los cores.** Un forward de 1,5M de
  parámetros en JS son ~900/s; un core simulando pide ~40.000/s.
- **Recolectar y aprender se solapan** con dos copias de la política. Sin eso los
  cores quedan parados durante el backprop y la GPU durante la simulación.
