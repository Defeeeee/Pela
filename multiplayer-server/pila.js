/**
 * La pila de palas — el puzzle diario de seguir un puntero.
 *
 * En castellano "pila" es las dos cosas: el montón de palas y la estructura de
 * datos. El juego aprovecha eso. Te dan una secuencia de PUSH y POP sobre un
 * montón de palas y tenés que decir dónde quedó el puntero, qué pala quedó
 * arriba, cuántas hay, y qué quedó en una dirección determinada.
 *
 * POR QUÉ ES UN BUEN PUZZLE: la convención de pila de OrgaSmall es genuinamente
 * contraintuitiva, y no por capricho de la materia sino porque así son las
 * máquinas de verdad. Tres cosas se pelean con la intuición:
 *
 *   1. La pila CRECE HACIA ABAJO. Apilar una pala baja la dirección.
 *   2. R7 apunta al PRÓXIMO LUGAR LIBRE, no al tope. La pala de arriba está en
 *      R7 + 1. Es lo que se llama una pila vacía-descendente, y es el error más
 *      común de la materia: mirar R7 y leer basura.
 *   3. POPEAR NO BORRA NADA. Bajar el puntero deja la pala donde estaba; sigue
 *      en memoria hasta que un PUSH la pise. Por eso el juego pregunta qué hay
 *      en una dirección suelta: la respuesta puede ser una pala que "ya no está".
 *
 * Nada de esto es secreto: la secuencia de operaciones es pública y el jugador
 * puede simularla a mano, que es exactamente el punto. Lo que se mide es si
 * seguiste bien el puntero, y el desempate es el tiempo. Igual que en bit golf.
 */

/** El tamaño de la memoria visible, en palabras. Direcciones 0x00 a 0x1F. */
export const MEM = 32;

/**
 * Donde arranca R7: una dirección por debajo del techo de la memoria.
 *
 * No arranca en 0x1F porque entonces la primera pala iría justo al borde y la
 * convención "R7 + 1 es el tope" quedaría escondida: R7 valdría 0x1E y el tope
 * 0x1F, que es el techo, y se podría confundir con "R7 apunta al tope" sin que
 * el puzzle lo delate. Arrancando en 0x1E el borde no ayuda a nadie.
 */
export const R7_INICIAL = 0x1e;

// Cantidad de operaciones. Suficientes para que haya que anotar, pocas como para
// seguirlas a mano sin perderse: es un puzzle de trazar, no de aguante.
const MIN_OPS = 10;
const MAX_OPS = 14;

// Hasta dónde puede crecer la pila, y con cuántas palas puede terminar.
const PROF_MAX = 6;
const PROF_FIN_MAX = 5;

/**
 * El corte de arriba tuvo un bug que encontró el propio test al imprimir el
 * reparto de profundidades finales: decía `quedan <= profundidad - 1`, que fuerza
 * POPs mucho antes de hacer falta, y la pila terminaba SIEMPRE con una o dos
 * palas. Con eso, "cuántas quedan" se acierta el 58% de las veces contestando 2
 * sin mirar nada, y una de las cuatro preguntas deja de medir.
 *
 * Lo correcto es forzar POPs sólo cuando ya no alcanzan las operaciones que
 * quedan para bajar hasta PROF_FIN_MAX, o sea `quedan <= profundidad - PROF_FIN_MAX`.
 */

/** Generador con semilla. splitmix32, por el bug de días vecinos de palas.js. */
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
 * Corre la secuencia y devuelve el estado final.
 *
 * Diez líneas, y son LA especificación de la convención. Si alguna vez hay que
 * discutir qué hace el juego, se discute acá y no en la interfaz.
 */
export function simular(ops, r7Inicial = R7_INICIAL) {
  const mem = new Array(MEM).fill(null);
  let r7 = r7Inicial;
  // Las palas que están de verdad en la pila, de abajo hacia arriba.
  const pila = [];

  for (const op of ops) {
    if (op.op === "PUSH") {
      // Se guarda en el lugar libre y DESPUÉS se baja el puntero.
      mem[r7] = op.pala;
      r7--;
      pila.push(op.pala);
    } else {
      // Se sube el puntero y se lee. La pala NO se borra de la memoria.
      r7++;
      pila.pop();
    }
  }

  return {
    r7,
    mem,
    // El tope está en R7 + 1, que es el punto de todo el ejercicio.
    arriba: pila.length > 0 ? mem[r7 + 1] : null,
    cuantas: pila.length,
  };
}

/**
 * Arma la secuencia del día.
 *
 * El generador tiene que garantizar tres cosas, y las tres son requisitos del
 * puzzle y no detalles:
 *
 *   - Nunca popear la pila vacía, que en la máquina sería un error y acá sería
 *     un puzzle sin respuesta.
 *   - Terminar con al menos una pala, para que "cuál está arriba" tenga sentido.
 *   - Que haya al menos un POP seguido de un PUSH, o sea que una pala pise a
 *     otra. Es la situación que enseña el juego: sin eso, la memoria final y la
 *     pila final coinciden y las tres preguntas se contestan con una sola idea.
 */
export function secuenciaDelDia(dia) {
  const r = rng((Number(dia) || 0) ^ 0x70696c61);

  for (let intento = 0; intento < 500; intento++) {
    const nOps = MIN_OPS + Math.floor(r() * (MAX_OPS - MIN_OPS + 1));
    const ops = [];
    let profundidad = 0;
    let pisada = false;

    /**
     * Las palas se numeran AL AZAR y no 1, 2, 3 en orden de apilado.
     *
     * Con un contador, la pala de arriba es siempre la de número más alto que no
     * se popeó, y el jugador resuelve por ese atajo sin seguir el puntero, que es
     * lo único que el puzzle quiere medir. Con números sueltos hay que trazar.
     *
     * Y de paso arregla un problema de tamaño que era serio: las secuencias de
     * PUSH/POP válidas de 10 a 14 operaciones son sólo 3.111 —las enumeré—, así
     * que hasta sorteando perfecto habría 43 repeticiones en dos años. Los
     * números multiplican ese espacio por millones y las repeticiones se van a
     * cero. Un puzzle diario que se repite cada dos meses es un puzzle roto.
     */
    const usados = new Set();
    const nuevaPala = () => {
      for (;;) {
        const v = 10 + Math.floor(r() * 90); // dos dígitos, se leen de un vistazo
        if (!usados.has(v)) { usados.add(v); return v; }
      }
    };

    for (let i = 0; i < nOps; i++) {
      const quedan = nOps - i;

      /**
       * Se apila o se saca según la profundidad, no al azar puro. Con una
       * moneda la secuencia se va a una pila de diez o a una que se vacía
       * sola; el sesgo la mantiene entre dos y cinco palas, que es donde el
       * puzzle se puede trazar a mano.
       */
      let apilar;
      if (profundidad === 0) apilar = true;                    // no se puede popear
      else if (profundidad >= PROF_MAX) apilar = false;         // demasiado alta
      else if (quedan <= profundidad - PROF_FIN_MAX) apilar = false;
      else apilar = r() < 0.5;

      if (apilar) {
        // Si la anterior fue un POP, esta pala pisa a la que quedó colgada.
        if (ops.length > 0 && ops[ops.length - 1].op === "POP") pisada = true;
        ops.push({ op: "PUSH", pala: nuevaPala() });
        profundidad++;
      } else {
        ops.push({ op: "POP" });
        profundidad--;
      }
    }

    if (profundidad < 1 || profundidad > PROF_FIN_MAX) continue;
    if (!pisada) continue;

    const fin = simular(ops);

    /**
     * La dirección que se pregunta sale siempre de FUERA de la pila, y puede ser
     * de dos clases:
     *
     *   - huérfana: tiene una pala que quedó colgada de un POP. Es el corazón
     *     del ejercicio, porque la respuesta es una pala que "ya no está".
     *   - vacía: nunca se escribió, y la respuesta correcta es "nada".
     *
     * Tienen que existir LAS DOS. Si sólo se preguntara por huérfanas, "nada"
     * nunca sería la respuesta y el jugador aprendería a descartarla sin pensar,
     * que es justo el pensamiento que el puzzle quiere provocar. Las vacías se
     * buscan pegadas al puntero —no en la otra punta de la memoria— para que haya
     * que razonar hasta dónde llegó la pila y no salte a la vista.
     */
    const huerfanas = [];
    const vacias = [];
    for (let d = 0; d < MEM; d++) {
      if (d > fin.r7) continue; // está en la pila: no se pregunta
      if (fin.mem[d] !== null) huerfanas.push(d);
      else if (d >= fin.r7 - 3) vacias.push(d);
    }
    if (huerfanas.length === 0 || vacias.length === 0) continue;

    // Dos de cada tres días la respuesta es una pala colgada, porque ésa es la
    // lección; el tercero es "nada", para que la lección haya que aplicarla.
    const pool = r() < 0.67 ? huerfanas : vacias;
    const consulta = pool[Math.floor(r() * pool.length)];

    return {
      dia: Number(dia) || 0,
      r7Inicial: R7_INICIAL,
      ops,
      consulta,
      // Los números que se usaron, para poder validar las respuestas: contestar
      // una pala que nunca existió es un error de entrada, no una respuesta mal.
      valores: [...usados],
    };
  }

  // Salida de emergencia: una secuencia a mano que cumple todo. Un puzzle
  // diario no se puede permitir devolver nada.
  const ops = [
    { op: "PUSH", pala: 47 }, { op: "PUSH", pala: 12 }, { op: "POP" },
    { op: "PUSH", pala: 83 }, { op: "PUSH", pala: 25 }, { op: "POP" },
    { op: "POP" }, { op: "PUSH", pala: 61 }, { op: "PUSH", pala: 34 },
    { op: "POP" },
  ];
  return {
    dia: Number(dia) || 0, r7Inicial: R7_INICIAL, ops,
    consulta: R7_INICIAL - 2, valores: [47, 12, 83, 25, 61, 34],
  };
}

/**
 * La secuencia sin las respuestas, que es lo único que viaja al cliente.
 *
 * Acá NO hay nada que esconder —el jugador puede simular la secuencia a mano,
 * es el juego— pero tampoco hay razón para mandar el resultado calculado. Que
 * el servidor no lo mande es lo que hace que el único envío signifique algo:
 * sin esto, el resultado estaría en la respuesta de red antes de contestar.
 */
export function secuenciaPublica(dia) {
  const s = secuenciaDelDia(dia);
  return {
    dia: s.dia,
    mem: MEM,
    r7Inicial: s.r7Inicial,
    ops: s.ops.map((o) => (o.op === "PUSH" ? ["PUSH", o.pala] : ["POP"])),
    consulta: s.consulta,
  };
}

/**
 * Corrige las cuatro respuestas.
 *
 * `mal` es cuántas erró, de 0 a 4, y es el valor por el que se rankea: tiene la
 * misma forma de "menos es mejor" que los intentos de Pelardle y los golpes de
 * bit golf, así que el ordenamiento del leaderboard sirve sin tocarlo.
 */
export function corregir(dia, respuesta) {
  const s = secuenciaDelDia(dia);
  const fin = simular(s.ops, s.r7Inicial);

  if (!respuesta || typeof respuesta !== "object") return { error: "Respuesta inválida." };

  const r7 = Math.floor(Number(respuesta.r7));
  const arriba = Math.floor(Number(respuesta.arriba));
  const cuantas = Math.floor(Number(respuesta.cuantas));
  const enConsulta = respuesta.enConsulta === null || respuesta.enConsulta === "nada"
    ? null
    : Math.floor(Number(respuesta.enConsulta));

  if (!Number.isFinite(r7) || r7 < 0 || r7 >= MEM) return { error: "El valor de R7 no es una dirección." };
  // Se valida por PERTENENCIA y no por rango: las palas ahora tienen números
  // sueltos, así que "existe" es estar en la lista de las que se apilaron.
  if (!s.valores.includes(arriba)) return { error: "Esa pala no existe." };
  if (!Number.isFinite(cuantas) || cuantas < 0 || cuantas > MEM) return { error: "Ese número de palas no puede ser." };
  if (enConsulta !== null && !s.valores.includes(enConsulta)) return { error: "Esa pala no existe." };

  const esperado = {
    r7: fin.r7,
    arriba: fin.arriba,
    cuantas: fin.cuantas,
    enConsulta: fin.mem[s.consulta],
  };
  const detalle = {
    r7: r7 === esperado.r7,
    arriba: arriba === esperado.arriba,
    cuantas: cuantas === esperado.cuantas,
    enConsulta: enConsulta === esperado.enConsulta,
  };
  const mal = Object.values(detalle).filter((ok) => !ok).length;

  return { mal, detalle, esperado, perfecto: mal === 0 };
}

/**
 * Registra el único envío del día.
 *
 * Lo que NO vuelve al cliente es `esperado`, y es la única cosa que este juego
 * tiene para esconder: con las respuestas correctas en la mano, el jugador
 * siguiente las copia. Se devuelve cuáles acertó y cuáles no —así el resultado
 * enseña algo— pero no cuál era la buena.
 */
export function registrarIntento(store, { dia, playerId, playerName, respuesta }) {
  const d = Number(dia);
  if (!Number.isFinite(d) || d < 1) return { error: "Falta el día." };
  if (!playerId) return { error: "Falta el jugador." };

  const previo = (store.daily[d] || []).find((e) => e.playerId === playerId);
  if (previo) {
    return { error: "Ya entregaste el de hoy.", yaJugado: true, mal: previo.attempts, perfecto: previo.solved };
  }

  const r = corregir(d, respuesta);
  if (typeof r.error === "string") return { error: r.error };

  store.recordCompletion(d, playerId, playerName || "Pelado Anónimo", r.mal, r.perfecto);
  return { ok: true, mal: r.mal, detalle: r.detalle, perfecto: r.perfecto };
}
