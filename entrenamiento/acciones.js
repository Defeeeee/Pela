import { MAX_CELLS, MIN_SPLIT_MASS } from "../multiplayer-server/agarra.js";

/**
 * Espacio de acciones discreto sobre lo único que el servidor acepta:
 * `setInput(dx, dy)` y `splitPlayer()`.
 *
 *   0        quieto
 *   1..16    moverse en uno de 16 rumbos
 *   17..32   moverse en ese rumbo y además dividirse
 */
export const RUMBOS = 16;
export const NUM_ACCIONES = 1 + RUMBOS * 2;

const COS = new Float32Array(RUMBOS);
const SEN = new Float32Array(RUMBOS);
for (let i = 0; i < RUMBOS; i++) {
  const a = (i * 2 * Math.PI) / RUMBOS;
  COS[i] = Math.cos(a);
  SEN[i] = Math.sin(a);
}

export function decodificar(indice) {
  if (indice <= 0) return { dx: 0, dy: 0, dividir: false };
  const dividir = indice > RUMBOS;
  const rumbo = (dividir ? indice - RUMBOS - 1 : indice - 1) % RUMBOS;
  return { dx: COS[rumbo], dy: SEN[rumbo], dividir };
}

/**
 * Máscara de acciones legales.
 *
 * Cuando el agente no puede dividirse —porque le falta masa o ya llegó al
 * tope de células— las 16 acciones de división se marcan ilegales y la
 * política ni siquiera puede elegirlas.
 *
 * Esto reemplaza a castigar el split inválido, que era lo que había antes y
 * es una trampa clásica: el 48% del espacio de acciones era "dividirse", a
 * masa 20 dividirse no hace nada (el mínimo son 36), y cobrar por eso le
 * enseñaba al agente que la mitad de sus acciones son malas sin que ninguna
 * cambiara el estado. No hay nada que aprender de una penalización que no
 * viene acompañada de una consecuencia.
 *
 * Enmascarar también recorta el problema: mientras es chico, el agente elige
 * entre 17 acciones en vez de 33.
 */
export function mascara(arena, id, destino, offset = 0) {
  destino.fill(1, offset, offset + NUM_ACCIONES);

  const p = arena.players.get(id);
  let puede = false;
  if (p && p.alive && p.cells.length < MAX_CELLS) {
    for (const c of p.cells) {
      if (c.mass >= MIN_SPLIT_MASS) { puede = true; break; }
    }
  }

  if (!puede) destino.fill(0, offset + 1 + RUMBOS, offset + NUM_ACCIONES);
  return destino;
}
