/**
 * ¿Cuántas palas? — el puzzle diario de estimación.
 *
 * Una escena generada por procedimiento a partir del índice del día: palas
 * desparramadas, rotadas, de tamaños distintos y encimándose. El jugador la
 * mira unos segundos y dice cuántas hay. Un solo intento.
 *
 * Se rankea por CERCANÍA y no por intentos, que es lo que lo hace un tipo de
 * habilidad distinto de Pelardle: ahí premia deducir, acá premia mirar bien.
 *
 * DOS DECISIONES DE DISEÑO QUE VALEN LA ACLARACIÓN:
 *
 *  1. El rango es 18 a 42 a propósito. Con menos de quince se cuenta sin
 *     esfuerzo y no hay juego; con más de cincuenta contar exacto es suerte y el
 *     "acertaste" nunca llega, así que la racha se muere. En este rango contar
 *     exacto es difícil pero posible, y por eso el acierto exacto puede ser la
 *     condición de racha.
 *
 *  2. Ninguna pala queda completamente tapada. Se verifica al generar: si el
 *     centro de una queda cubierto por otra que se dibuja después, se descarta
 *     la posición. Sin eso el puzzle sería injusto — habría palas imposibles de
 *     ver y el número correcto parecería un error.
 *
 * LO QUE ESTE JUEGO NO DEFIENDE, y queda escrito igual que el agujero de
 * identidad de Pelardle: la escena se dibuja en el cliente, así que quien abra
 * las herramientas del navegador puede contar los elementos del arreglo en vez
 * de mirarlos. Cerrarlo requeriría renderizar la imagen en el servidor, y en un
 * sitio de chistes entre amigos no vale el costo. La defensa real es el reloj:
 * la escena se muestra unos segundos y después se tapa, así que el que quiera
 * hacer trampa tiene que querer bastante.
 */

export const ANCHO = 900;
export const ALTO = 600;

export const MIN_PALAS = 18;
export const MAX_PALAS = 42;

// Segundos que la escena queda a la vista antes de taparse. Es la mecánica, no
// una restricción técnica: sin reloj el juego se vuelve contar con el dedo.
// Doce y no dieciocho: con dieciocho alcanzaba para contar tranquilo y el juego
// pasaba de estimar a contar despacio, que premia la paciencia y no la vista.
export const SEGUNDOS_VISIBLE = 12;

const LARGO_MIN = 46;
const LARGO_MAX = 78;

/**
 * Generador con semilla, para que la escena del día sea la misma para todos.
 *
 * La semilla pasa por splitmix32 antes de usarse, y eso NO es decoración: con
 * la semilla cruda, xorshift devuelve casi el mismo primer valor para semillas
 * consecutivas —0,3165 para los días 1, 2 y 3— y como el primer valor es el que
 * elige cuántas palas hay, TODOS los días daban 25. El test que exige variedad
 * de totales lo agarró en el primer intento.
 *
 * Mezclar la semilla resuelve la correlación de raíz: splitmix32 está hecho
 * justamente para convertir contadores consecutivos en valores independientes.
 */
function rng(semilla) {
  // splitmix32: mezcla el contador del día hasta que días vecinos no se parezcan.
  let z = ((Number(semilla) || 0) + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  let x = (z ^ (z >>> 15)) >>> 0 || 1; // xorshift no arranca desde cero

  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/** ¿Está (px,py) dentro de la pala? Se aproxima con su rectángulo rotado. */
function dentro(pala, px, py) {
  const dx = px - pala.x;
  const dy = py - pala.y;
  const c = Math.cos(-pala.ang);
  const s = Math.sin(-pala.ang);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= pala.largo / 2 && Math.abs(ly) <= pala.ancho / 2;
}

/**
 * Arma la escena del día.
 *
 * Devuelve las palas y el total. El total NO se le manda al cliente: lo guarda
 * el servidor para poder corregir el intento.
 */
export function escenaDelDia(dia) {
  const r = rng(Number(dia) || 0);
  const total = MIN_PALAS + Math.floor(r() * (MAX_PALAS - MIN_PALAS + 1));

  // Unos pocos racimos en vez de posiciones uniformes: contar un montón
  // desparramado es tedioso, contar racimos que se enciman es el juego.
  const nRacimos = 2 + Math.floor(r() * 3);
  const racimos = [];
  for (let i = 0; i < nRacimos; i++) {
    racimos.push({
      x: 120 + r() * (ANCHO - 240),
      y: 110 + r() * (ALTO - 220),
      radio: 90 + r() * 130,
    });
  }

  const palas = [];
  let intentos = 0;
  while (palas.length < total && intentos < total * 400) {
    intentos++;
    const largo = LARGO_MIN + r() * (LARGO_MAX - LARGO_MIN);
    const ancho = largo * (0.3 + r() * 0.12);
    const ang = r() * Math.PI * 2;

    // El 75% cae en un racimo y el resto suelto, para que la vista no pueda
    // resolver el conteo con un solo patrón.
    let x, y;
    if (r() < 0.75) {
      const c = racimos[Math.floor(r() * racimos.length)];
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * c.radio;
      x = c.x + Math.cos(a) * d;
      y = c.y + Math.sin(a) * d;
    } else {
      x = 70 + r() * (ANCHO - 140);
      y = 70 + r() * (ALTO - 140);
    }

    const margen = largo / 2 + 6;
    if (x < margen || x > ANCHO - margen || y < margen || y > ALTO - margen) continue;

    const cand = { x, y, ang, largo, ancho, tono: Math.floor(r() * 5) };

    // Ninguna pala puede quedar del todo tapada: si el centro de esta cae
    // adentro de una que ya está, se descarta. Se chequea en los dos sentidos
    // porque el dibujo respeta el orden del arreglo.
    let tapada = false;
    for (const p of palas) {
      if (dentro(p, cand.x, cand.y) || dentro(cand, p.x, p.y)) { tapada = true; break; }
    }
    if (tapada) continue;

    palas.push(cand);
  }

  return { dia: Number(dia) || 0, total: palas.length, palas };
}

/** La escena sin el total, que es lo único que puede viajar al cliente. */
export function escenaPublica(dia) {
  const e = escenaDelDia(dia);
  return {
    dia: e.dia,
    mundo: [ANCHO, ALTO],
    segundos: SEGUNDOS_VISIBLE,
    palas: e.palas.map((p) => [
      Math.round(p.x), Math.round(p.y),
      Math.round(p.ang * 1000) / 1000,
      Math.round(p.largo), Math.round(p.ancho), p.tono,
    ]),
  };
}

/**
 * Corrige un intento.
 *
 * `error` es la distancia al número correcto y es el valor por el que se
 * rankea: cero es un acierto exacto. Tiene la misma forma de "menos es mejor"
 * que los intentos de Pelardle, así que el ordenamiento del leaderboard sirve
 * sin cambios.
 */
export function corregir(dia, intento) {
  const { total } = escenaDelDia(dia);
  const n = Math.floor(Number(intento));
  if (!Number.isFinite(n) || n < 0 || n > 999) return { error: "Intento inválido." };
  const error = Math.abs(n - total);
  return { total, intento: n, error, exacto: error === 0 };
}
