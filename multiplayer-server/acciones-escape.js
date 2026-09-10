/**
 * Espacio de acciones de escapecv.
 *
 * Mucho más chico que el del Agarrá, que tenía 33 acciones porque el split
 * duplicaba cada rumbo. Acá el único control del juego es `setInput(dx, dy)`
 * con un vector normalizado, así que alcanzan los rumbos más quedarse quieto.
 *
 * Quedarse quieto es una acción de verdad y no un relleno: con enemigos que
 * viajan recto, muchas veces el movimiento óptimo es ninguno —cualquier
 * desplazamiento te mete en la trayectoria de otro— y sin esta acción la
 * política tendría que aproximarla oscilando entre dos rumbos opuestos, que
 * gasta distancia y termina cerca de una pared.
 *
 * 16 rumbos son 22,5° de resolución. Con el jugador moviéndose a ~3 px por
 * tick y decidiendo a 10 Hz, el error lateral que introduce un rumbo mal
 * elegido por medio sector es de menos de un píxel por decisión: por debajo
 * del ruido de la propia geometría.
 */

export const RUMBOS = 16;
export const NUM_ACCIONES = 1 + RUMBOS; // 0 = quieto

const DX = new Float64Array(NUM_ACCIONES);
const DY = new Float64Array(NUM_ACCIONES);

for (let i = 0; i < RUMBOS; i++) {
  const ang = (i / RUMBOS) * Math.PI * 2;
  DX[1 + i] = Math.cos(ang);
  DY[1 + i] = Math.sin(ang);
}

/** Traduce el índice de acción al vector que espera `setInput`. */
export function decodificar(a) {
  if (a < 0 || a >= NUM_ACCIONES) return { dx: 0, dy: 0 };
  return { dx: DX[a], dy: DY[a] };
}

/**
 * Máscara de acciones legales.
 *
 * A diferencia del Agarrá, donde dividirse era ilegal sin masa suficiente,
 * acá TODAS las acciones son siempre legales: el servidor clampea al jugador
 * contra la pared, así que apretar contra el borde no es un error, sólo es
 * inútil.
 *
 * La máscara existe igual, y siempre en unos, por dos razones: el aprendiz
 * espera un tensor de máscara con forma fija, y si alguna vez se agrega una
 * acción condicional (un dash con enfriamiento, por ejemplo) el enganche ya
 * está y no hay que tocar el formato del lote.
 */
export function mascara(room, id, destino, base = 0) {
  destino.fill(1, base, base + NUM_ACCIONES);
  return destino;
}
