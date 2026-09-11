/**
 * Bit Golf — el puzzle diario de llegar de un byte a otro en los menos golpes.
 *
 * Te dan un byte inicial y uno objetivo, y cinco operaciones. Hay que llegar al
 * objetivo aplicándolas, y el puntaje son los golpes que usaste. Como en el golf,
 * el par está a la vista.
 *
 * LO QUE HACE VIABLE EL JUEGO es que el par se puede CALCULAR. Son 256 estados y
 * cinco operaciones, así que un recorrido en anchura da la distancia exacta entre
 * cualquier par de bytes. Eso resuelve de una el problema que hundió a la mitad de
 * las ideas de puzzle: no hay que estimar la dificultad ni rezar que tenga
 * solución — se sabe que la tiene y en cuántos golpes.
 *
 * Y todo es público: el byte inicial, el objetivo y las operaciones. No hay nada
 * que esconder, y por lo tanto nada que se pueda filtrar. Alguien puede escribir
 * un solucionador y sacar el par siempre, igual que con el ajedrez: el par es
 * alcanzable pensando, y el desempate es el tiempo. Se aclara acá para que nadie
 * lo descubra en dos meses creyendo que es un descuido.
 */

/**
 * Las cinco operaciones, sobre 8 bits.
 *
 * `INC` sola alcanza para llegar a cualquier byte desde cualquier byte, así que
 * NINGÚN puzzle puede ser imposible. Es la razón de que esté en el repertorio:
 * las otras cuatro son las interesantes, ésta es la garantía.
 *
 * `SHL` y `SHR` PIERDEN el bit que se van, que es lo que hace que el camino
 * corto no sea obvio: a veces conviene desplazar y perder información antes de
 * reconstruirla.
 */
export const OPS = [
  { clave: "SHL", etiqueta: "SHL", desc: "corre los bits a la izquierda, el de arriba se pierde", f: (x) => (x << 1) & 0xff },
  { clave: "SHR", etiqueta: "SHR", desc: "corre los bits a la derecha, el de abajo se pierde", f: (x) => x >>> 1 },
  { clave: "NOT", etiqueta: "NOT", desc: "invierte los ocho bits", f: (x) => ~x & 0xff },
  { clave: "XOR", etiqueta: "XOR 0x0F", desc: "invierte los cuatro bits de abajo", f: (x) => x ^ 0x0f },
  { clave: "INC", etiqueta: "ADD 1", desc: "suma uno, y de 0xFF vuelve a 0x00", f: (x) => (x + 1) & 0xff },
];

const PORCLAVE = new Map(OPS.map((o) => [o.clave, o]));

/** Aplica una operación por su clave. Devuelve null si la clave no existe. */
export function aplicar(valor, clave) {
  const op = PORCLAVE.get(clave);
  if (!op) return null;
  return op.f(valor & 0xff);
}

/**
 * Distancias mínimas desde `desde` a los 256 bytes, por recorrido en anchura.
 *
 * Se calcula una vez y se guarda: son 256 tablas de 256 bytes, o sea 64 KB en
 * total, y el juego las consulta en cada pedido.
 */
const cacheDist = new Map();

export function distanciasDesde(desde) {
  const d0 = desde & 0xff;
  if (cacheDist.has(d0)) return cacheDist.get(d0);

  const dist = new Int16Array(256).fill(-1);
  const previo = new Int16Array(256).fill(-1);
  const via = new Array(256).fill(null);
  dist[d0] = 0;

  const cola = [d0];
  for (let i = 0; i < cola.length; i++) {
    const x = cola[i];
    for (const op of OPS) {
      const y = op.f(x);
      if (dist[y] !== -1) continue;
      dist[y] = dist[x] + 1;
      previo[y] = x;
      via[y] = op.clave;
      cola.push(y);
    }
  }

  const tabla = { dist, previo, via };
  cacheDist.set(d0, tabla);
  return tabla;
}

/** Un camino óptimo de `desde` a `hasta`, como lista de claves de operación. */
export function caminoOptimo(desde, hasta) {
  const { dist, previo, via } = distanciasDesde(desde);
  const h = hasta & 0xff;
  if (dist[h] === -1) return null;

  const pasos = [];
  let cur = h;
  while (cur !== (desde & 0xff)) {
    pasos.push(via[cur]);
    cur = previo[cur];
  }
  return pasos.reverse();
}

/** Generador con semilla. splitmix32 por el mismo motivo que en palas.js. */
function rng(semilla) {
  let z = ((Number(semilla) || 0) + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  let x = (z ^ (z >>> 15)) >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * Los pares jugables.
 *
 * Con menos de cuatro golpes el puzzle se resuelve de memoria. Con más de seis
 * se vuelve tanteo a ciegas: el espacio de caminos crece como 5^n.
 *
 * Y el 7 queda AFUERA por una razón medida, no por gusto: en este grafo el par 7
 * es el 1% de los pares, y solo 100 de los 256 bytes tienen algún destino a esa
 * distancia —muchos con un único destino posible—. Forzar un par 7 sería sortear
 * de un pozo diminuto, o sea repetir el mismo puzzle seguido. El par 8 existe
 * (29 pares en 65.536) y por lo mismo tampoco entra.
 */
const PARES = [4, 5, 6];

/**
 * Mínimo de destinos posibles para aceptar un byte inicial.
 *
 * Si desde un byte hay un solo destino a la distancia buscada, ese puzzle
 * aparecería siempre que salga ese byte con ese par. El filtro cuesta nada y
 * mantiene los pozos en 21.564 / 18.978 / 5.723 pares.
 */
const MIN_DESTINOS = 8;

// Tope de golpes que se le permiten al jugador. Generoso respecto del par, pero
// finito: sin tope, "aplicar INC doscientas veces" resuelve cualquier puzzle y
// el juego deja de ser de caminos cortos.
export const GOLPES_MAX = 14;

/**
 * El puzzle del día.
 *
 * Devuelve el byte inicial, el objetivo y el par. El par SÍ se le muestra al
 * jugador: es un juego de golf, y en el golf el par está en la tarjeta. Saberlo
 * es lo que convierte "llegué" en "llegué en los justos".
 */
export function puzzleDelDia(dia) {
  const r = rng((Number(dia) || 0) ^ 0x6b697462);

  /**
   * Se elige PRIMERO el par y después el destino, y no un par de bytes al azar.
   *
   * Sorteando pares uniformemente el juego queda pegado a la parte fácil: la
   * distribución de distancias de este grafo tiene el 33% en par 4 y el 29% en
   * par 5, así que la mitad de los días serían el par más bajo. Eligiendo el par
   * primero, los tres niveles salen un tercio de las veces cada uno.
   */
  const par = PARES[Math.floor(r() * PARES.length)];

  for (let intento = 0; intento < 200; intento++) {
    const desde = Math.floor(r() * 256);
    const { dist } = distanciasDesde(desde);

    // Todos los destinos a esa distancia exacta, y se sortea entre ellos. Una
    // sola pasada por la tabla, sin rechazar pares uno por uno.
    const destinos = [];
    for (let h = 0; h < 256; h++) if (dist[h] === par) destinos.push(h);
    if (destinos.length < MIN_DESTINOS) continue;

    const hasta = destinos[Math.floor(r() * destinos.length)];
    return { dia: Number(dia) || 0, desde, hasta, par, golpesMax: GOLPES_MAX };
  }

  // Salida de emergencia, para no devolver nunca undefined. No debería llegar
  // acá —los 256 bytes tienen 40 o más destinos a distancia 4— pero un puzzle
  // diario no se puede permitir devolver nada.
  const { dist } = distanciasDesde(0);
  return { dia: Number(dia) || 0, desde: 0, hasta: 0x0f, par: dist[0x0f], golpesMax: GOLPES_MAX };
}

/**
 * Corrige una solución.
 *
 * `golpes` es la cantidad de operaciones que usó, y es el valor por el que se
 * rankea: menos es mejor, igual que los intentos de Pelardle. Una solución que
 * no llega al objetivo no puntúa.
 */
export function corregir(dia, jugadas) {
  const p = puzzleDelDia(dia);
  if (!Array.isArray(jugadas)) return { error: "Solución inválida." };
  if (jugadas.length === 0) return { error: "No jugaste ningún golpe." };
  if (jugadas.length > GOLPES_MAX) return { error: `El máximo es ${GOLPES_MAX} golpes.` };

  let v = p.desde;
  for (const clave of jugadas) {
    const siguiente = aplicar(v, clave);
    if (siguiente === null) return { error: `"${clave}" no es una operación.` };
    v = siguiente;
  }

  if (v !== p.hasta) {
    return {
      llego: false,
      golpes: jugadas.length,
      valorFinal: v,
      par: p.par,
      // Sin esto el jugador no sabe si estuvo cerca o lejísimos, y un puzzle
      // que no dice nada al fallar no enseña nada.
      mensaje: `Llegaste a 0x${v.toString(16).toUpperCase().padStart(2, "0")} y el objetivo era 0x${p.hasta.toString(16).toUpperCase().padStart(2, "0")}.`,
    };
  }

  return {
    llego: true,
    golpes: jugadas.length,
    par: p.par,
    sobrePar: jugadas.length - p.par,
    enPar: jugadas.length === p.par,
  };
}

/**
 * Registra el único envío del día.
 *
 * Se puede experimentar todo lo que se quiera en la pantalla —las operaciones
 * son públicas y el cliente simula solo— pero se entrega una vez. Es lo que
 * hace que el puntaje signifique algo.
 */
export function registrarIntento(store, { dia, playerId, playerName, jugadas }) {
  const d = Number(dia);
  if (!Number.isFinite(d) || d < 1) return { error: "Falta el día." };
  if (!playerId) return { error: "Falta el jugador." };

  const previo = (store.daily[d] || []).find((e) => e.playerId === playerId);
  if (previo) {
    return { error: "Ya entregaste el de hoy.", yaJugado: true, golpes: previo.attempts, enPar: previo.solved };
  }

  const r = corregir(d, jugadas);
  if (typeof r.error === "string") return { error: r.error };

  // Una solución que no llega puntúa con el tope de golpes, no con los que usó:
  // si no, entregar dos golpes que no llegan rankearía mejor que cinco que sí.
  const puntaje = r.llego ? r.golpes : GOLPES_MAX + 1;
  store.recordCompletion(d, playerId, playerName || "Pelado Anónimo", puntaje, !!r.enPar);

  return { ok: true, ...r };
}
