import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  CORRAL_X,
  CORRAL_Y,
  CORRAL_W,
  CORRAL_H,
} from "./rooms.js";

/**
 * Observación egocéntrica de un jugador de escapecv, para la red que maneja a
 * los bots.
 *
 * La diferencia de fondo con la observación del Agarrá es que acá el juego es
 * geométrico y determinista: los enemigos entran desde afuera y cruzan el mapa
 * en LÍNEA RECTA a velocidad constante, sin perseguir a nadie. Esquivarlos no
 * es una cuestión de intuición sino de resolver, para cada uno, cuándo va a
 * pasar más cerca y a qué distancia.
 *
 * Por eso no se le pasan posiciones crudas y se espera que la red derive la
 * geometría a fuerza de gradientes: se le pasa el resultado. Para cada enemigo
 * cercano van su `tiempo al acercamiento máximo` y su `distancia de paso`, que
 * son exactamente las dos variables con las que se decide si hay que moverse o
 * no. Es el mismo razonamiento que en el Agarrá llevó a agregar la velocidad
 * relativa y los canales de "presa si estuviera entero": lo que la red no puede
 * percibir, no lo puede aprender, y lo que puede calcularse en cerrado no vale
 * la pena hacérselo descubrir.
 *
 * El otro canal propio de este juego son los AVISOS. Antes de que un enemigo
 * exista, la sala publica dónde va a aparecer con ~900-1400 ms de anticipación.
 * Un jugador que los mira se posiciona antes; uno que no, reacciona tarde. Es
 * información gratis y decisiva, así que tiene sus propios canales.
 */

// Cuántos enemigos individuales entran con detalle completo. Ordenados por
// amenaza, no por distancia: el que pasa cerca en dos segundos importa más que
// el que está al lado pero se aleja.
export const ENEMIGOS_DETALLE = 8;
const CANALES_ENEMIGO = 8;

// Los avisos y la densidad van en sectores alrededor del jugador, que es la
// forma de resumir "de qué lado viene el problema" sin depender de cuántos
// haya.
export const SECTORES = 8;
const ANILLOS = 2;
const CANALES_SECTOR = 3;
const CANALES_AVISO = 3;

// Compañeros: en coop son objetivos a revivir, en battle son cuerpos que te
// pueden empujar contra una pala (y a los que podés empujar).
export const COMPANEROS_DETALLE = 3;
const CANALES_COMPANERO = 5;

const PROPIOS = 12;

export const TAM_OBS =
  PROPIOS +
  ENEMIGOS_DETALLE * CANALES_ENEMIGO +
  SECTORES * ANILLOS * CANALES_SECTOR +
  SECTORES * CANALES_AVISO +
  COMPANEROS_DETALLE * CANALES_COMPANERO;

// Escalas de normalización. Todas fijas y explícitas: una observación que
// cambia de escala entre entrenamiento y producción es un modelo roto en
// silencio.
const DIAGONAL = Math.hypot(CORRAL_W, CORRAL_H);
const RADIO_CERCA = 220; // primer anillo, en píxeles de mundo
const RADIO_LEJOS = 520; // segundo anillo
const T_HORIZONTE = 120; // ticks; ~4 s simulados, más allá no vale mirar
const V_MAX = 10; // px por tick, cota de velocidad de enemigo

/**
 * Geometría del cruce entre un jugador quieto en el origen y un enemigo que
 * viaja recto.
 *
 * Devuelve en cuántos ticks pasa a distancia mínima y cuál es esa distancia.
 * Si el enemigo se aleja, el mínimo ya ocurrió: se devuelve t=0 y la distancia
 * actual, que es lo correcto —no hay nada que esquivar.
 */
function acercamiento(rx, ry, vx, vy) {
  const v2 = vx * vx + vy * vy;
  if (v2 < 1e-9) return { t: 0, d: Math.hypot(rx, ry) };

  let t = -(rx * vx + ry * vy) / v2;
  if (t < 0) t = 0;

  const px = rx + vx * t;
  const py = ry + vy * t;
  return { t, d: Math.hypot(px, py) };
}

/**
 * Codifica el estado de la sala desde el punto de vista de `id` en `destino`,
 * a partir de `base`.
 *
 * Escribe siempre exactamente TAM_OBS números, incluso si el jugador está
 * muerto o la sala está vacía: un tamaño variable rompería el lote del
 * aprendiz.
 */
export function codificar(room, id, destino, base = 0) {
  destino.fill(0, base, base + TAM_OBS);

  const yo = room.players.get(id);
  if (!yo) return destino;

  let k = base;

  // --- Estado propio -------------------------------------------------------
  // Posición dentro del corral, en [-1,1]. El corral es lo que importa, no el
  // mundo: el jugador está clampeado ahí y las paredes matan por encierro.
  const cx = CORRAL_X + CORRAL_W / 2;
  const cy = CORRAL_Y + CORRAL_H / 2;
  destino[k++] = (yo.x - cx) / (CORRAL_W / 2);
  destino[k++] = (yo.y - cy) / (CORRAL_H / 2);

  // Distancia a cada pared, normalizada. Separadas y no como una sola
  // "distancia al borde" porque el jugador necesita saber hacia dónde tiene
  // salida, y eso es asimétrico.
  destino[k++] = (yo.x - (CORRAL_X + yo.size / 2)) / CORRAL_W;
  destino[k++] = (CORRAL_X + CORRAL_W - yo.size / 2 - yo.x) / CORRAL_W;
  destino[k++] = (yo.y - (CORRAL_Y + yo.size / 2)) / CORRAL_H;
  destino[k++] = (CORRAL_Y + CORRAL_H - yo.size / 2 - yo.y) / CORRAL_H;

  destino[k++] = yo.speed / 10;
  destino[k++] = yo.alive ? 1 : 0;
  destino[k++] = yo.immuneUntil && room.tiempo < yo.immuneUntil ? 1 : 0;

  // El tiempo transcurrido cambia el juego: los enemigos aceleran y aparecen
  // más seguido, y aparecen más gigantes. Sin este canal la política no puede
  // saber que la misma escena exige más margen a los tres minutos que al
  // arranque.
  destino[k++] = Math.min(1, room.tiempo / 180000);

  // El modo cambia la estrategia por completo, así que va explícito en vez de
  // esperar que la red lo infiera de la escena.
  destino[k++] = room.mode === "coop" ? 1 : 0;
  destino[k++] = room.mode === "battle" ? 1 : 0;

  // --- Enemigos individuales, ordenados por amenaza ------------------------
  const amenazas = [];
  for (const e of room.enemies) {
    const rx = e.x - yo.x;
    const ry = e.y - yo.y;
    const { t, d } = acercamiento(rx, ry, e.vx, e.vy);

    // Margen: cuánto le sobra a la distancia de paso por encima del contacto.
    // Negativo significa que, si nadie se mueve, esto es un choque.
    const contacto = yo.size / 2 + e.size * 0.35;
    const margen = d - contacto;

    /**
     * Puntaje de amenaza, en dos niveles estrictos: CUALQUIER choque que llegue
     * dentro del horizonte va antes que CUALQUIER cosa que pase de largo.
     *
     * Un solo puntaje continuo no sirve, y el test lo agarró: con
     * `margen + t*2`, un enemigo inofensivo pegado al jugador (margen 20)
     * le ganaba a un choque frontal que llegaba en 83 ticks. Los ocho slots
     * de detalle se llenaban de enemigos que se alejan mientras el que te
     * mata quedaba fuera de la observación — y una política no puede esquivar
     * lo que no ve.
     *
     * Dentro de los choques ordena por urgencia; entre los demás, por cuánto
     * margen dejan y cuándo pasan.
     */
    const choca = margen <= 0 && t < T_HORIZONTE;
    const puntaje = choca ? t : T_HORIZONTE + margen + t * 0.5;
    amenazas.push({ e, rx, ry, t, d, margen, puntaje, choca });
  }
  amenazas.sort((a, b) => a.puntaje - b.puntaje);

  const n = Math.min(ENEMIGOS_DETALLE, amenazas.length);
  for (let i = 0; i < n; i++) {
    const a = amenazas[i];
    destino[k++] = a.rx / DIAGONAL;
    destino[k++] = a.ry / DIAGONAL;
    destino[k++] = a.e.vx / V_MAX;
    destino[k++] = a.e.vy / V_MAX;
    destino[k++] = a.e.size / 100;
    destino[k++] = Math.min(1, a.t / T_HORIZONTE);
    destino[k++] = Math.max(-1, Math.min(1, a.margen / RADIO_CERCA));
    destino[k++] = a.choca ? 1 : 0;
  }
  k = base + PROPIOS + ENEMIGOS_DETALLE * CANALES_ENEMIGO;

  // --- Densidad por sector y anillo ---------------------------------------
  // Resume lo que no entró en el detalle. Sin esto, ocho enemigos inminentes
  // tapan por completo una pared de veinte que viene atrás.
  for (const a of amenazas) {
    const dist = Math.hypot(a.rx, a.ry);
    if (dist > RADIO_LEJOS) continue;
    const anillo = dist <= RADIO_CERCA ? 0 : 1;
    let ang = Math.atan2(a.ry, a.rx);
    if (ang < 0) ang += Math.PI * 2;
    const sec = Math.min(SECTORES - 1, Math.floor((ang / (Math.PI * 2)) * SECTORES));

    const off = base + PROPIOS + ENEMIGOS_DETALLE * CANALES_ENEMIGO +
      (sec * ANILLOS + anillo) * CANALES_SECTOR;

    destino[off] += 1 / 6; // cuenta, saturando cerca de 6
    // Velocidad de acercamiento: proyección de la velocidad sobre la línea que
    // los une. Positiva si viene hacia acá.
    const vAcerca = -(a.e.vx * a.rx + a.e.vy * a.ry) / (dist || 1);
    if (vAcerca / V_MAX > destino[off + 1]) destino[off + 1] = vAcerca / V_MAX;
    if (a.choca) destino[off + 2] = 1;
  }

  // --- Avisos: enemigos que todavía no existen ----------------------------
  // Van por sector con el tiempo que falta, porque la decisión que habilitan
  // es "de qué lado NO conviene estar cuando esto entre".
  const offAvisos = base + PROPIOS + ENEMIGOS_DETALLE * CANALES_ENEMIGO +
    SECTORES * ANILLOS * CANALES_SECTOR;
  for (const w of room.warnings) {
    const rx = w.x - yo.x;
    const ry = w.y - yo.y;
    let ang = Math.atan2(ry, rx);
    if (ang < 0) ang += Math.PI * 2;
    const sec = Math.min(SECTORES - 1, Math.floor((ang / (Math.PI * 2)) * SECTORES));
    const off = offAvisos + sec * CANALES_AVISO;

    destino[off] += 1 / 4;
    // Cuánto falta, invertido: 1 es inminente, 0 es lejano. Se queda el más
    // urgente del sector.
    const falta = Math.max(0, (w.spawnAt - room.tiempo) / 1500);
    const urgencia = 1 - Math.min(1, falta);
    if (urgencia > destino[off + 1]) destino[off + 1] = urgencia;
    if (w.size / 100 > destino[off + 2]) destino[off + 2] = w.size / 100;
  }

  // --- Compañeros ---------------------------------------------------------
  // En coop, un compañero muerto cerca es masa de maniobra: pararse encima
  // tres segundos lo revive. En battle es un cuerpo que empuja.
  const offComp = offAvisos + SECTORES * CANALES_AVISO;
  const otros = [];
  for (const p of room.players.values()) {
    if (p.id === id) continue;
    const rx = p.x - yo.x;
    const ry = p.y - yo.y;
    otros.push({ p, rx, ry, dist: Math.hypot(rx, ry) });
  }
  otros.sort((a, b) => a.dist - b.dist);

  const m = Math.min(COMPANEROS_DETALLE, otros.length);
  for (let i = 0; i < m; i++) {
    const o = otros[i];
    const off = offComp + i * CANALES_COMPANERO;
    destino[off] = o.rx / DIAGONAL;
    destino[off + 1] = o.ry / DIAGONAL;
    destino[off + 2] = o.p.alive ? 1 : 0;
    // Progreso de reanimación: le dice al que está encima que le falta poco y
    // conviene aguantar, en vez de abandonar a los dos segundos.
    destino[off + 3] = Math.min(1, (o.p.reviveProgressMs || 0) / 3000);
    destino[off + 4] = o.p.isBeingRevived ? 1 : 0;
  }

  return destino;
}
