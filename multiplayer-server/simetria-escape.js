import { SECTORES, ENEMIGOS_DETALLE, COMPANEROS_DETALLE, TAM_OBS } from "./observacion-escape.js";
import { RUMBOS, NUM_ACCIONES } from "./acciones-escape.js";

/**
 * Espejado de observaciones y acciones, para aprovechar la simetría del juego.
 *
 * El corral es 1131×636 y está centrado en el mundo, así que reflejarlo sobre
 * su eje vertical u horizontal lo deja idéntico: las palas entran por los
 * cuatro lados con igual probabilidad y nada distingue la izquierda de la
 * derecha. O sea que hay CUATRO versiones equivalentes de cada situación y la
 * política estaba aprendiendo una sola.
 *
 * Medido en la política del paso ~2000: elegía "izquierda" el 32% de las veces
 * y terminaba apretada contra la pared izquierda el 70% del tiempo, con la
 * derecha en 0,0%. La política espejada sería idénticamente buena, así que esa
 * elección es una moneda que la red tiró al azar y sobre la que gastó
 * capacidad.
 *
 * DÓNDE SE APLICA, y por qué importa: en el ACTOR, no en el aprendiz. A cada
 * sala se le asigna un espejo fijo al nacer; se codifica su observación en ese
 * marco y se desespeja la acción antes de dársela al servidor. Así la acción
 * fue realmente muestreada de la red con esa observación, y el `log_prob` que
 * PPO usa para el cociente de importancia es exacto sin ninguna corrección.
 *
 * Aumentar el lote del lado del aprendiz habría sido más natural de escribir y
 * está mal: el `log_prob` viejo de una muestra sintética no es el de la muestra
 * original salvo que la política ya sea simétrica, que es justo lo que no es.
 * Y simetrizar la red promediando los cuatro forwards costaría 4× de GPU, que
 * es el recurso escaso acá.
 *
 * El espejo es FIJO por sala y no por paso: si cambiara a mitad de un episodio,
 * el mundo se daría vuelta bajo los pies del agente y ninguna política podría
 * con eso.
 */

// ── Distribución de la observación (tiene que coincidir con observacion-escape.js) ──
const PROPIOS = 12;
const CANALES_ENEMIGO = 8;
const ANILLOS = 2;
const CANALES_SECTOR = 3;
const CANALES_AVISO = 3;
const CANALES_COMPANERO = 5;

const OFF_ENEMIGOS = PROPIOS;
const OFF_SECTORES = OFF_ENEMIGOS + ENEMIGOS_DETALLE * CANALES_ENEMIGO;
const OFF_AVISOS = OFF_SECTORES + SECTORES * ANILLOS * CANALES_SECTOR;
const OFF_COMPANEROS = OFF_AVISOS + SECTORES * CANALES_AVISO;

if (OFF_COMPANEROS + COMPANEROS_DETALLE * CANALES_COMPANERO !== TAM_OBS) {
  throw new Error(
    `simetria-escape: la distribución no cuadra con TAM_OBS=${TAM_OBS}. ` +
    `Si cambió la observación, hay que actualizar este archivo — un espejado ` +
    `desalineado corrompería cada muestra en silencio.`
  );
}

/**
 * Permutación de sectores. El sector s cubre [s·45°, (s+1)·45°) con el ángulo
 * medido como `atan2(ry, rx)`, o sea 0° a la derecha y creciendo hacia abajo
 * (la `y` del mundo crece hacia abajo).
 *
 * Espejo horizontal (x → −x): el ángulo pasa a 180° − ang.
 * Espejo vertical   (y → −y): el ángulo pasa a −ang.
 *
 * Las dos son involuciones, así que la misma permutación sirve para ir y venir.
 */
function permutarSectores(signoX, signoY) {
  const p = new Int32Array(SECTORES);
  for (let s = 0; s < SECTORES; s++) {
    const centro = ((s + 0.5) / SECTORES) * Math.PI * 2;
    const x = Math.cos(centro) * signoX;
    const y = Math.sin(centro) * signoY;
    let a = Math.atan2(y, x);
    if (a < 0) a += Math.PI * 2;
    p[s] = Math.min(SECTORES - 1, Math.floor((a / (Math.PI * 2)) * SECTORES));
  }
  return p;
}

/** Permutación de acciones: 0 (quieto) es fijo, los 16 rumbos se reflejan. */
function permutarAcciones(signoX, signoY) {
  const p = new Int32Array(NUM_ACCIONES);
  p[0] = 0;
  for (let i = 1; i < NUM_ACCIONES; i++) {
    const ang = ((i - 1) / RUMBOS) * Math.PI * 2;
    const x = Math.cos(ang) * signoX;
    const y = Math.sin(ang) * signoY;
    let a = Math.atan2(y, x);
    if (a < 0) a += Math.PI * 2;
    p[i] = 1 + (Math.round((a / (Math.PI * 2)) * RUMBOS) % RUMBOS);
  }
  return p;
}

/**
 * Los cuatro espejos: identidad, horizontal, vertical y los dos.
 * `sx`/`sy` son los signos que se aplican a las componentes x e y.
 */
export const ESPEJOS = [
  { nombre: "identidad", sx: 1, sy: 1 },
  { nombre: "horizontal", sx: -1, sy: 1 },
  { nombre: "vertical", sx: 1, sy: -1 },
  { nombre: "ambos", sx: -1, sy: -1 },
].map((e) => ({
  ...e,
  sectores: permutarSectores(e.sx, e.sy),
  acciones: permutarAcciones(e.sx, e.sy),
}));

export const NUM_ESPEJOS = ESPEJOS.length;

/**
 * Espeja la observación en sitio, dentro de `[base, base+TAM_OBS)`.
 *
 * Trabaja sobre un buffer auxiliar para los bloques que permutan, porque una
 * permutación hecha en sitio se pisa a sí misma.
 */
const aux = new Float32Array(TAM_OBS);

export function espejarObs(obs, base, espejo) {
  const { sx, sy, sectores } = espejo;
  if (sx === 1 && sy === 1) return obs;

  // ── Estado propio ──
  // 0,1: posición dentro del corral. 2..5: distancias a izquierda, derecha,
  // arriba y abajo, que se INTERCAMBIAN por pares al reflejar.
  obs[base + 0] *= sx;
  obs[base + 1] *= sy;
  if (sx === -1) {
    const t = obs[base + 2]; obs[base + 2] = obs[base + 3]; obs[base + 3] = t;
  }
  if (sy === -1) {
    const t = obs[base + 4]; obs[base + 4] = obs[base + 5]; obs[base + 5] = t;
  }
  // 6..11 (velocidad, vivo, inmune, tiempo, modo) son invariantes.

  // ── Enemigos: rx, ry, vx, vy cambian de signo; tamaño, tiempo al
  // acercamiento, margen y choque son invariantes. El ORDEN de los ocho slots
  // también, porque el puntaje de amenaza sólo usa magnitudes invariantes.
  for (let i = 0; i < ENEMIGOS_DETALLE; i++) {
    const o = base + OFF_ENEMIGOS + i * CANALES_ENEMIGO;
    obs[o + 0] *= sx;
    obs[o + 1] *= sy;
    obs[o + 2] *= sx;
    obs[o + 3] *= sy;
  }

  // ── Sectores y anillos: los canales son magnitudes invariantes (cuenta,
  // velocidad de acercamiento, choque); lo único que cambia es en qué sector
  // caen.
  const nSec = SECTORES * ANILLOS * CANALES_SECTOR;
  for (let k = 0; k < nSec; k++) aux[k] = obs[base + OFF_SECTORES + k];
  for (let s = 0; s < SECTORES; s++) {
    const sd = sectores[s];
    for (let an = 0; an < ANILLOS; an++) {
      for (let c = 0; c < CANALES_SECTOR; c++) {
        obs[base + OFF_SECTORES + (sd * ANILLOS + an) * CANALES_SECTOR + c] =
          aux[(s * ANILLOS + an) * CANALES_SECTOR + c];
      }
    }
  }

  // ── Avisos: misma permutación de sectores, canales invariantes.
  const nAv = SECTORES * CANALES_AVISO;
  for (let k = 0; k < nAv; k++) aux[k] = obs[base + OFF_AVISOS + k];
  for (let s = 0; s < SECTORES; s++) {
    for (let c = 0; c < CANALES_AVISO; c++) {
      obs[base + OFF_AVISOS + sectores[s] * CANALES_AVISO + c] = aux[s * CANALES_AVISO + c];
    }
  }

  // ── Compañeros: rx, ry cambian de signo. El orden es por distancia, que es
  // invariante al reflejar.
  for (let i = 0; i < COMPANEROS_DETALLE; i++) {
    const o = base + OFF_COMPANEROS + i * CANALES_COMPANERO;
    obs[o + 0] *= sx;
    obs[o + 1] *= sy;
  }

  return obs;
}

/** Espeja la máscara de acciones en sitio. */
const auxMsc = new Uint8Array(NUM_ACCIONES);

export function espejarMascara(msc, base, espejo) {
  if (espejo.sx === 1 && espejo.sy === 1) return msc;
  for (let a = 0; a < NUM_ACCIONES; a++) auxMsc[a] = msc[base + a];
  for (let a = 0; a < NUM_ACCIONES; a++) msc[base + espejo.acciones[a]] = auxMsc[a];
  return msc;
}

/**
 * Traduce una acción elegida en el marco espejado al marco del mundo.
 *
 * Las permutaciones son involuciones, así que la misma tabla sirve en las dos
 * direcciones; queda como función aparte para que el llamador diga qué está
 * haciendo.
 */
export function desespejarAccion(a, espejo) {
  return espejo.acciones[a];
}

/** Elige un espejo a partir de un número en [0,1). */
export function espejoAlAzar(r) {
  return ESPEJOS[Math.min(NUM_ESPEJOS - 1, Math.floor(r * NUM_ESPEJOS))];
}
