import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MAX_CELLS,
  MIN_SPLIT_MASS,
  MERGE_COOLDOWN_MS,
  EAT_MASS_RATIO,
  INITIAL_MASS,
} from "../multiplayer-server/agarra.js";

/**
 * Codificador de observación: de la arena a un vector fijo de números.
 *
 * Todo es egocéntrico —relativo al centro de masa del agente— porque la
 * política tiene que aprender "hay una amenaza arriba a la izquierda" y no
 * "hay una amenaza en (1200, 800)": lo segundo la obligaría a aprender el
 * mismo concepto de nuevo en cada rincón del mapa.
 *
 * Regla que se sigue en todo el archivo: **ningún canal puede saturar dentro
 * del rango normal de juego.** Un número que vale 1.0 en la mitad de las
 * situaciones no le dice nada a la red. Por eso las masas van en escala
 * logarítmica (van de 20 a decenas de miles) y las distancias se dividen por
 * el alcance real del anillo y no por una constante redonda.
 */

// Anillos de visión, en píxeles. El tercero llega a 1600 y no a 2000 porque
// más allá de eso lo que pasa ya no afecta la decisión inmediata, y meterlo
// sólo diluye la densidad de palas del anillo lejano hasta volverla constante.
const ANILLOS = [300, 700, 1600];
const SECTORES = 8;
const CANALES = 8;

const BASE_PROPIA = 17;
export const TAM_OBS = BASE_PROPIA + SECTORES * ANILLOS.length * CANALES; // 209

// Masa máxima que se espera ver. Se usa sólo para normalizar en log, así que
// pasarse no rompe nada: sólo comprime un poco la parte alta de la escala.
const MASA_REF = 20000;
const logMasa = (m) => Math.log(Math.max(1, m) / INITIAL_MASS) / Math.log(MASA_REF / INITIAL_MASS);

/**
 * Aplana las palas de una arena en un array de coordenadas.
 *
 * Se hace una vez por arena y por paso, no una vez por agente: iterar un Map
 * de 600 elementos cuatro veces (una por agente) era el costo dominante de la
 * codificación.
 */
/**
 * Calcula la velocidad de cada jugador por diferencia de posición y la deja
 * anotada en el propio objeto (vxObs/vyObs).
 *
 * Se hace por diferencia y no leyendo cell.vx porque ése es sólo el impulso de
 * la división, que se apaga en menos de un segundo: el movimiento normal del
 * jugador no está en ninguna variable, se aplica directo a la posición.
 */
export function anotarVelocidades(arena, dtSeg) {
  for (const p of arena.players.values()) {
    if (!p.alive) continue;
    if (p._px !== undefined) {
      p.vxObs = (p.x - p._px) / dtSeg;
      p.vyObs = (p.y - p._py) / dtSeg;
    } else {
      p.vxObs = 0;
      p.vyObs = 0;
    }
    p._px = p.x;
    p._py = p.y;
  }
}

export function aplanarPalas(arena, destino) {
  let n = 0;
  for (const pala of arena.palas.values()) {
    destino[n++] = pala.x;
    destino[n++] = pala.y;
  }
  return n >> 1;
}

/**
 * Escribe la observación del jugador `id` en `destino` (Float32Array).
 *
 * Escribe sobre un buffer que provee el llamador para no crear un array por
 * agente por paso: a cientos de miles de transiciones por segundo eso sería
 * basura suficiente como para que el recolector se vuelva el cuello de botella.
 */
export function codificar(arena, id, destino, offset = 0, palas = null, nPalas = 0) {
  destino.fill(0, offset, offset + TAM_OBS);

  const p = arena.players.get(id);
  if (!p || !p.alive || p.cells.length === 0) return destino;

  // Centro de masa y velocidad media, pesados por masa.
  let cx = 0, cy = 0, vx = 0, vy = 0, masaTotal = 0, masaMayor = 0;
  for (const c of p.cells) {
    cx += c.x * c.mass;
    cy += c.y * c.mass;
    vx += c.vx * c.mass;
    vy += c.vy * c.mass;
    masaTotal += c.mass;
    if (c.mass > masaMayor) masaMayor = c.mass;
  }
  cx /= masaTotal; cy /= masaTotal; vx /= masaTotal; vy /= masaTotal;

  // 1. Estado propio.
  //
  // Van la masa TOTAL y la de la célula MÁS GRANDE por separado, y son cosas
  // distintas: lo que decide si te podés comer a alguien es la célula mayor,
  // no la suma. Un agente partido en ocho pedazos de 50 tiene masa total 400 y
  // no se puede comer a nadie de 60. Confundirlas es lo que hace que un bot
  // partido salga a cazar a alguien que en realidad se lo come a él.
  let enfriamiento = 0;
  for (const c of p.cells) enfriamiento = Math.max(enfriamiento, c.mergeAt - arena.tiempo);

  const puedeDividirse = p.cells.length < MAX_CELLS && masaMayor >= MIN_SPLIT_MASS;

  destino[offset + 0] = logMasa(masaTotal);
  destino[offset + 1] = logMasa(masaMayor);
  destino[offset + 2] = p.cells.length / MAX_CELLS;
  destino[offset + 3] = Math.min(1, Math.max(0, enfriamiento / MERGE_COOLDOWN_MS));
  destino[offset + 4] = puedeDividirse ? 1 : 0;
  // Qué tan repartido está: 1 si toda la masa está en una célula, menos si no.
  destino[offset + 5] = masaMayor / masaTotal;

  // Paredes, normalizadas por el alcance de visión: lo que importa es "la
  // tengo encima", no a qué fracción del mapa estoy. Dividir por 2000 hacía
  // que media cancha se viera idéntica.
  const alcance = ANILLOS[ANILLOS.length - 1];
  destino[offset + 6] = Math.min(1, cx / alcance);
  destino[offset + 7] = Math.min(1, (WORLD_WIDTH - cx) / alcance);
  destino[offset + 8] = Math.min(1, cy / alcance);
  destino[offset + 9] = Math.min(1, (WORLD_HEIGHT - cy) / alcance);

  // Velocidad, contra la escala del impulso de división (520 px/s), que es la
  // velocidad más alta que se alcanza en el juego.
  destino[offset + 10] = Math.max(-1, Math.min(1, vx / 520));
  destino[offset + 11] = Math.max(-1, Math.min(1, vy / 520));
  destino[offset + 12] = Math.min(1, arena.tiempo / 180000); // cuánto lleva la partida
  destino[offset + 13] = Math.min(1, (p.kills || 0) / 10);

  // Lo que podría comer SI ESTUVIERA ENTERO.
  //
  // Los canales de presa de la grilla se calculan contra la célula mayor
  // propia, que es lo correcto para saber qué puede comer AHORA. Pero eso deja
  // al agente ciego a la oportunidad: dividido en ocho, su célula mayor es
  // chica y la grilla le dice que no hay presas, cuando la verdad es que las
  // hay y lo único que las separa de él es volver a juntarse.
  //
  // Medido en producción: dividido podía comerse a 0,00 bots de 4,8; entero, a
  // 0,96. Sin estos tres números no tiene forma de enterarse de esa diferencia,
  // y "quedarse entero para poder cazar" es una estrategia que jamás podría
  // descubrir porque su recompensa nunca aparece en lo que percibe.
  let mejorPresaEntero = 0;
  let cuantasPresasEntero = 0;
  let distPresaEntero = 1;
  for (const otro of arena.players.values()) {
    if (otro.id === id || !otro.alive) continue;
    let mayorOtro = 0;
    for (const c of otro.cells) if (c.mass > mayorOtro) mayorOtro = c.mass;
    if (mayorOtro <= 0) continue;
    // Comible entero pero no como está: ésa es justo la oportunidad perdida.
    if (masaTotal >= mayorOtro * EAT_MASS_RATIO && masaMayor < mayorOtro * EAT_MASS_RATIO) {
      cuantasPresasEntero++;
      if (mayorOtro > mejorPresaEntero) mejorPresaEntero = mayorOtro;
      const d = Math.hypot(otro.x - cx, otro.y - cy) / ANILLOS[ANILLOS.length - 1];
      if (d < distPresaEntero) distPresaEntero = Math.min(1, d);
    }
  }
  destino[offset + 14] = mejorPresaEntero > 0 ? logMasa(mejorPresaEntero) : 0;
  destino[offset + 15] = Math.min(1, cuantasPresasEntero / 6);
  destino[offset + 16] = distPresaEntero;

  // 2. Grilla polar egocéntrica.
  const base = offset + BASE_PROPIA;
  const indice = (dx, dy, dist) => {
    let anillo = -1;
    for (let i = 0; i < ANILLOS.length; i++) {
      if (dist < ANILLOS[i]) { anillo = i; break; }
    }
    if (anillo === -1) return -1;
    let ang = Math.atan2(dy, dx);
    if (ang < 0) ang += Math.PI * 2;
    const sector = Math.min(SECTORES - 1, Math.floor((ang / (Math.PI * 2)) * SECTORES));
    return base + (sector * ANILLOS.length + anillo) * CANALES;
  };

  // Distancias arrancan en 1 (nada a la vista) y bajan cuando hay algo cerca.
  for (let i = 0; i < SECTORES * ANILLOS.length; i++) {
    destino[base + i * CANALES + 4] = 1;
    destino[base + i * CANALES + 5] = 1;
  }

  // Palas: sólo cuenta cuántas hay por celda.
  //
  // El descarte por caja antes de la raíz cuadrada es lo que hace barato esto:
  // de 600 palas repartidas en 4000x4000, apenas una fracción cae dentro del
  // anillo de visión, y comparar dos restas es mucho más barato que un hypot.
  if (palas) {
    for (let k = 0; k < nPalas; k++) {
      const dx = palas[k * 2] - cx;
      if (dx > alcance || dx < -alcance) continue;
      const dy = palas[k * 2 + 1] - cy;
      if (dy > alcance || dy < -alcance) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = indice(dx, dy, d);
      if (i !== -1) destino[i] += 1;
    }
  } else {
    for (const pala of arena.palas.values()) {
      const dx = pala.x - cx, dy = pala.y - cy;
      if (dx > alcance || dx < -alcance || dy > alcance || dy < -alcance) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = indice(dx, dy, d);
      if (i !== -1) destino[i] += 1;
    }
  }
  // Se normaliza por el área de cada anillo, si no el anillo lejano —que es
  // mucho más grande— siempre parece el más lleno de palas.
  for (let s = 0; s < SECTORES; s++) {
    for (let a = 0; a < ANILLOS.length; a++) {
      const rInt = a === 0 ? 0 : ANILLOS[a - 1];
      const area = Math.PI * (ANILLOS[a] ** 2 - rInt ** 2) / SECTORES;
      const esperadas = (600 / (WORLD_WIDTH * WORLD_HEIGHT)) * area;
      const i = base + (s * ANILLOS.length + a) * CANALES;
      destino[i] = Math.min(2, destino[i] / Math.max(1, esperadas)) / 2;
    }
  }

  // Otros jugadores, célula por célula. La comparación es contra la célula
  // mayor propia, que es la que decide quién come a quién.
  for (const otro of arena.players.values()) {
    if (otro.id === id || !otro.alive) continue;
    for (const c of otro.cells) {
      const dx = c.x - cx, dy = c.y - cy;
      const d = Math.hypot(dx, dy);
      const i = indice(dx, dy, d);
      if (i === -1) continue;

      const dNorm = d / ANILLOS[ANILLOS.length - 1];

      // Velocidad de acercamiento: cuánto de la velocidad relativa apunta
      // hacia el agente. Positiva = se viene encima, negativa = se aleja.
      //
      // Sin esto la observación es una foto: dice dónde está cada uno pero no
      // hacia dónde va, así que un bot enorme que se acerca y uno que se aleja
      // se ven exactamente igual. Es la diferencia entre poder anticipar y
      // sólo poder reaccionar cuando ya lo tenés encima.
      let acerc = 0;
      if (d > 1) {
        const rvx = (otro.vxObs || 0) - vx;
        const rvy = (otro.vyObs || 0) - vy;
        acerc = Math.max(-1, Math.min(1, -(rvx * dx + rvy * dy) / d / 200));
      }

      if (c.mass >= masaMayor * EAT_MASS_RATIO) {
        destino[i + 1] += logMasa(c.mass);                       // masa amenazante
        if (dNorm < destino[i + 4]) {
          destino[i + 4] = dNorm;                                // amenaza más cercana
          destino[i + 6] = acerc;                                // y si se viene encima
        }
      } else if (masaMayor >= c.mass * EAT_MASS_RATIO) {
        destino[i + 2] += logMasa(c.mass);                       // masa comestible
        if (dNorm < destino[i + 5]) {
          destino[i + 5] = dNorm;                                // presa más cercana
          destino[i + 7] = acerc;                                // y si se escapa
        }
      } else {
        destino[i + 3] += logMasa(c.mass);                       // ni una cosa ni la otra
      }
    }
  }

  return destino;
}
